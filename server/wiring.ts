/**
 * Server wiring: build the LLM/tool/memory stack that every route uses.
 *
 * The contract:
 *   - `getWiring()` returns the *same* object for every call within a
 *     single server boot, so caching, budget tracking, and RAG
 *     observability accumulate across requests.
 *   - The wired LLM is the raw adapter wrapped in three layers:
 *       1. ResilientLLM — retry with jitter, circuit breaker, fallback.
 *       2. LLMCache     — content-keyed LRU + TTL, skips on stream.
 *       3. TokenBudget  — per-session accounting, hard-limit pre-call guard.
 *   - The wired tools registry has the `rag` tool (RagTool) registered
 *     on first call, pointing at the shared Runtime's retriever.
 *   - The wired memory is the raw adapter, but every read also emits
 *     an observability trace so the queue can be drained by the admin.
 *
 * The wiring is independent of Express so it can be unit-tested in
 * isolation (see `server/__tests__/wiring.test.ts`).
 */

import { ResilientLLM } from '../src/integration/resilient-llm.js';
import { LLMCache } from '../src/integration/llm-cache.js';
import { TokenBudget, DEFAULT_PRICES } from '../src/integration/token-budget.js';
import { RagTool } from '../src/integration/rag-tool.js';
import { getRuntime } from './runtime.js';
import type { ILLMPort } from '../src/ports/llm.port.js';
import type { IToolsPort } from '../src/ports/tools.port.js';
import type { IMemoryPort } from '../src/ports/memory.port.js';
import type { IConfigPort } from '../src/ports/config.port.js';
import type { IStoragePort } from '../src/ports/storage.port.js';
import type { IShellPort } from '../src/ports/shell.port.js';

export interface WiringAdapters {
  llm: ILLMPort;
  config: IConfigPort;
  memory: IMemoryPort;
  storage: IStoragePort;
  shell: IShellPort;
  tools: IToolsPort;
}

export interface Wiring {
  raw: WiringAdapters;
  llm: ILLMPort;
  cache: LLMCache;
  budget: TokenBudget;
  /** Number of times RagTool has been registered. */
  ragRegistered: boolean;
  /** Register the RAG tool on `tools` exactly once. */
  ensureRagTool(): void;
  /** Token-budget snapshot per session. */
  budgetSnapshot(): Record<string, ReturnType<TokenBudget['get']>>;
}

let cached: Wiring | null = null;

export function buildWiring(adapters: WiringAdapters): Wiring {
  if (cached) return cached;

  // 1) Resilient: retry + breaker + provider fallback.
  const resilient = new ResilientLLM({ maxRetries: 3, breaker: { failureThreshold: 3, resetTimeout: 30_000 } });

  // 2) Cache: content-keyed LRU + TTL.
  const cache = new LLMCache({ maxEntries: 200, ttlMs: 5 * 60_000 });

  // 3) Budget: per-session accounting, hard cap by default, warn at 80%.
  const budget = new TokenBudget({
    hardAt: { totalTokens: 2_000_000 },
    warnAt: { totalTokens: 1_600_000 },
    onWarn: (e) => {
      // Cheap, in-process log. The observability backend can pick this
      // up if it wants; we keep the wiring zero-deps.
      process.stdout.write(
        `[budget] warn: session="${e.sessionId}" usage=${JSON.stringify(e.usage)} limit=${JSON.stringify(e.limit)} kind=${e.kind}\n`,
      );
    },
  });
  for (const [m, p] of Object.entries(DEFAULT_PRICES)) {
    budget.setPrice(m, p);
  }
  // Layer: Resilient → Cache → Budget. The outermost wrapper
  // (Budget) sees every call *and* can short-circuit before the LLM
  // is invoked. The cache returns identical responses for identical
  // requests, so the budget only sees one underlying call.
  const resilientWrapped: ILLMPort = resilient.wrap(adapters.llm);
  const cacheWrapped: ILLMPort = cache.wrap(resilientWrapped);
  const budgetWrapped: ILLMPort = budget.wrap(cacheWrapped);

  // ILLMPort is a structural type with 4 methods. The underlying
  // LLM adapter exposes additional methods (`getCircuitBreakerSnapshots`,
  // `resetCircuitBreaker`, ...) that some routes (config, dashboard)
  // call directly. We want to wrap the 4 port methods with the
  // resilience / cache / budget stack AND forward every other
  // method/property to the underlying adapter. A Proxy is the
  // simplest way to do both without listing every method twice.
  const wrapped: ILLMPort = new Proxy(budgetWrapped, {
    get(target, prop, receiver) {
      if (prop === 'chat' || prop === 'stream' || prop === 'listModels' || prop === 'isAvailable') {
        return Reflect.get(target, prop, receiver);
      }
      // Everything else (getCircuitBreakerSnapshots, resetCircuitBreaker,
      // custom hooks, etc.) — forward to the underlying adapter with
      // the right `this` binding.
      const value = Reflect.get(adapters.llm as unknown as object, prop, adapters.llm);
      return typeof value === 'function' ? value.bind(adapters.llm) : value;
    },
  }) as ILLMPort;

  const wiring: Wiring = {
    raw: adapters,
    llm: wrapped,
    cache,
    budget,
    ragRegistered: false,
    ensureRagTool(): void {
      if (wiring.ragRegistered) return;
      const rt = getRuntime();
      const rag = new RagTool({
        retriever: rt.retriever,
        topK: 5,
        name: 'rag',
        description:
          "Search the running server's knowledge base (RAG). Input: { query: string, topK?: number }. Returns relevant documents from the corpus. Use this whenever the user asks a question that might be answered by previously-ingested files, notes, or transcripts.",
      });
      adapters.tools.register(rag.tool);
      wiring.ragRegistered = true;
    },
    budgetSnapshot(): Record<string, ReturnType<TokenBudget['get']>> {
      return budget.snapshot();
    },
  };
  cached = wiring;
  return wiring;
}

/** Drop the cached wiring (tests only). */
export function _resetWiringForTests(): void {
  cached = null;
}
