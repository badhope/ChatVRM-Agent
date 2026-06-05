/**
 * LLM response cache.
 *
 * A small, in-process LRU cache that keys on a stable hash of the
 * chat request. Use it to:
 *  - skip identical repeated prompts in tests
 *  - cache cheap-to-save LLM completions for retry scenarios
 *  - implement "speculative" pre-warming of likely follow-ups
 *
 * The cache is *transparent*: you call `wrap(port)` to get a new
 * ILLMPort that proxies to the underlying one and memoises results.
 * Streaming responses are NOT cached (they're typically very large
 * and most callers want fresh data).
 *
 * Cache key: stable JSON of (provider, model, messages, tools, temperature,
 * maxTokens, topP, presencePenalty, frequencyPenalty). Two equivalent calls
 * produce the same key. If you change the model behaviour (topP / penalties)
 * the cache key changes, so stale responses are not returned.
 *
 * H9 (W18): key derivation is now a sha256 hash of the canonical
 * stringification instead of a recursive `stableStringify` that
 * produced a multi-MB string for large messages+tools arrays. The
 * stored key is short, comparable, and the hot path no longer
 * allocates one giant string per request.
 *
 * TTL: per-entry expiry; default 5 minutes. LRU eviction: when the
 * cache exceeds `maxEntries`, the least-recently-used entry is removed.
 */

import { createHash } from 'node:crypto';
import type { ILLMPort, ChatResponse, ChatParams } from '../ports/llm.port.js';

export interface LLMCacheOptions {
  /** Max cached entries. Default 256. */
  maxEntries?: number;
  /** Per-entry TTL in ms. Default 5 * 60 * 1000 (5 min). */
  ttlMs?: number;
  /** Optional clock for testing. */
  now?: () => number;
}

interface CacheEntry {
  key: string;
  value: ChatResponse;
  expiresAt: number;
  insertedAt: number;
}

export class LLMCache {
  private readonly maxEntries: number;
  private readonly ttlMs: number;
  private readonly now: () => number;
  private readonly map = new Map<string, CacheEntry>();
  private hits = 0;
  private misses = 0;

  constructor(opts: LLMCacheOptions = {}) {
    this.maxEntries = opts.maxEntries ?? 256;
    this.ttlMs = opts.ttlMs ?? 5 * 60 * 1000;
    this.now = opts.now ?? (() => Date.now());
  }

  /** Compute the cache key for a request. */
  static keyOf(req: ChatParams): string {
    const norm = {
      provider: req.provider ?? null,
      model: req.model ?? null,
      temperature: req.temperature ?? 0,
      maxTokens: req.maxTokens ?? null,
      toolChoice: req.toolChoice ?? null,
      parallelToolCalls: req.parallelToolCalls ?? null,
      // Sampling parameters affect the output distribution; omitting them
      // would cause cache hits across requests with different sampling,
      // returning a wrong answer. Include them.
      topP: req.topP ?? null,
      presencePenalty: req.presencePenalty ?? null,
      frequencyPenalty: req.frequencyPenalty ?? null,
      messages: req.messages.map((m) => ({ role: m.role, content: m.content, toolCallId: m.toolCallId, name: m.name, toolCalls: m.toolCalls })),
      tools: (req.tools ?? []).map((t) => ({ name: t.name, description: t.description, parameters: t.parameters })),
    };
    // H9 (W18): sha256 hash of the canonical JSON. The old stable
    // stringifier concatenated keys in-place and produced a single
    // string the size of the request, which the cache then had to
    // compare lexicographically on every lookup. The hash is a
    // 64-char string and constant-time to compare.
    return createHash('sha256').update(stableStringify(norm)).digest('hex');
  }

  get size(): number { return this.map.size; }
  get hitCount(): number { return this.hits; }
  get missCount(): number { return this.misses; }

  get(key: string): ChatResponse | undefined {
    const entry = this.map.get(key);
    if (!entry) {
      this.misses += 1;
      return undefined;
    }
    if (entry.expiresAt < this.now()) {
      this.map.delete(key);
      this.misses += 1;
      return undefined;
    }
    // LRU: re-insert to mark as recently used.
    this.map.delete(key);
    this.map.set(key, { ...entry, insertedAt: this.now() });
    this.hits += 1;
    // H5 (W18): return a structural clone so callers can't mutate the
    // cached value in place. The previous code returned the same
    // reference every time, so a route that appended `usage` or
    // rearranged `toolCalls` on the response would silently poison
    // every subsequent cache hit. structuredClone preserves the
    // ChatResponse shape (including toolCalls, usage, content) bit-
    // exactly and is fast enough for our cache size.
    // M7 (W18): tag the cloned response with `cacheHit: true` so
    // downstream `TokenBudget` observers can avoid double-counting
    // tokens/cost when the cache is stacked under/over a budget.
    // L10 (W18): also stamp the cloned response with
    // `cachedAt: <insertedAt>`, so a downstream log/observability
    // path can tell the *age* of a cache hit (useful for SLO
    // analysis, e.g. "what fraction of hits are > 1 min stale?").
    // The value is the original insert epoch-millis.
    const cloned = structuredClone(entry.value);
    cloned.cacheHit = true;
    cloned.cachedAt = entry.insertedAt;
    return cloned;
  }

  set(key: string, value: ChatResponse): void {
    if (this.map.has(key)) this.map.delete(key);
    const entry: CacheEntry = {
      key,
      value,
      expiresAt: this.now() + this.ttlMs,
      insertedAt: this.now(),
    };
    this.map.set(key, entry);
    while (this.map.size > this.maxEntries) {
      // The first key in Map iteration order is the least-recently
      // used because we re-insert on get().
      const firstKey = this.map.keys().next().value;
      if (firstKey === undefined) break;
      this.map.delete(firstKey);
    }
  }

  has(key: string): boolean {
    const entry = this.map.get(key);
    if (!entry) return false;
    if (entry.expiresAt < this.now()) {
      this.map.delete(key);
      return false;
    }
    return true;
  }

  clear(): void {
    this.map.clear();
    this.hits = 0;
    this.misses = 0;
  }

  /**
   * Wrap an LLM port with this cache. The returned port proxies to
   * `port.chat()` for cache misses and short-circuits for hits.
   * Streaming is always passed through (uncached).
   */
  wrap(port: ILLMPort): ILLMPort {
    return {
      chat: async (req: ChatParams) => {
        const key = LLMCache.keyOf(req);
        const hit = this.get(key);
        if (hit) return hit;
        const out = await port.chat(req);
        this.set(key, out);
        return out;
      },
      stream: port.stream.bind(port),
      // Keep `this` bound to `port` so instance methods like
      // `getBreaker` on the underlying adapter keep working.
      listModels: ((...args: Parameters<ILLMPort['listModels']>) => port.listModels(...args)) as ILLMPort['listModels'],
      isAvailable: ((...args: Parameters<ILLMPort['isAvailable']>) => port.isAvailable(...args)) as ILLMPort['isAvailable'],
    };
  }
}

/** Deterministic JSON.stringify (sorted keys). */
function stableStringify(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(stableStringify).join(',') + ']';
  const obj = v as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + stableStringify(obj[k])).join(',') + '}';
}
