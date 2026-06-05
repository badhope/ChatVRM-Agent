/**
 * Server-side runtime.
 *
 * Holds the live, mutable state that multiple HTTP routes need to share:
 *
 *  - `vectorStore` — knowledge base. Default: in-memory. Hydrate from
 *    `~/.personal-assistant/vectors.json` on boot if it exists.
 *  - `embedder` — default hashing embedder (no model required, useful
 *    for tests + offline). Real deployments can swap in OpenAI / Ollama.
 *  - `retriever` — HybridRetriever over the in-memory vector store +
 *    an in-process BM25 index.
 *  - `webhookRouter` — singleton WebhookRouter.
 *  - `queue` — in-process job queue with retries.
 *  - `observability` — in-memory IObservability that records every
 *    trace/span/generation for the admin UI.
 *
 * The `Runtime` is created once in `createApp()` and passed to the
 * route factories by name. Routes that need different deps (e.g. real
 * LLM) are constructed in `app.ts` from the `Adapters` object as
 * before.
 */

import { EventEmitter } from 'eventemitter3';
import { HashingEmbedder } from '../src/adapters/embedder.hashing.js';
import { InMemoryVectorStore } from '../src/adapters/vector-store.memory.js';
import { HybridRetriever } from '../src/adapters/hybrid-retriever.js';
import { InProcessQueue } from '../src/adapters/queue.in-process.js';
import { WebhookRouter } from '../src/integration/webhooks.js';
import { NoopObservability } from '../src/adapters/observability.noop.js';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { resolveEmbedDim } from '../src/config/embedder.js';

const VECTORS_FILE = path.join(homedir(), '.personal-assistant', 'vectors.json');
// Single source of truth lives in src/config/embedder.ts so CLI and
// server agree. Override with the `EMBED_DIM` env var.
const EMBED_DIM = resolveEmbedDim();

export class Runtime {
  readonly eventBus = new EventEmitter();
  readonly vectorStore: InMemoryVectorStore;
  readonly embedder: HashingEmbedder;
  readonly retriever: HybridRetriever;
  readonly queue: InProcessQueue;
  readonly webhookRouter: WebhookRouter;
  readonly observability = new NoopObservability({ recordMode: true, ringBufferSize: 500 });

  constructor() {
    this.vectorStore = new InMemoryVectorStore(EMBED_DIM);
    this.embedder = new HashingEmbedder({ dim: EMBED_DIM });
    this.retriever = new HybridRetriever({ vectorStore: this.vectorStore, embedder: this.embedder });
    this.queue = new InProcessQueue('server-runtime');
    this.webhookRouter = new WebhookRouter({ bus: this.eventBus });
  }

  /**
   * Hydrate the vector store from the on-disk file written by the
   * `ingest` CLI command, if present. Errors are logged but do not
   * prevent the runtime from starting.
   */
  async hydrateFromDisk(): Promise<{ loaded: number; path: string | null }> {
    if (!existsSync(VECTORS_FILE)) {
      return { loaded: 0, path: null };
    }
    try {
      const raw = await readFile(VECTORS_FILE, 'utf-8');
      const parsed = JSON.parse(raw) as Array<{
        id: string;
        vector: number[] | Float32Array;
        text: string;
        metadata?: Record<string, unknown>;
      }>;
      const records = parsed.map((r) => ({
        id: r.id,
        text: r.text,
        metadata: r.metadata ?? {},
        vector: Array.isArray(r.vector) ? new Float32Array(r.vector) : new Float32Array(Object.values(r.vector)),
      }));
      // Validate dim against the in-memory store.
      if (records.length > 0 && records[0]!.vector.length !== this.vectorStore.dim) {
        // W17 M9: log dim mismatch to stderr so operators can tell the
        // difference between "no corpus" and "wrong embedder dim".
        process.stderr.write(
          `[runtime] vectors file at ${VECTORS_FILE} has dim ${records[0]!.vector.length}, ` +
            `expected ${this.vectorStore.dim}; skipping hydration\n`,
        );
        return { loaded: 0, path: VECTORS_FILE };
      }
      await this.vectorStore.add(records);
      // W17 M9: also feed the records into the HybridRetriever so that
      // BM25 + hybrid search can return hydrated docs. The vector
      // store alone is not enough — the retriever caches `docs` and
      // `vectorIds` in its own maps.
      await this.retriever.add(
        records.map((r) => ({
          id: r.id,
          text: r.text,
          metadata: r.metadata,
        })),
      );
      return { loaded: records.length, path: VECTORS_FILE };
    } catch (err) {
      // W17 M9: surface hydration errors to the operator's stderr so a
      // corrupt file doesn't silently keep the runtime empty.
      const message = err instanceof Error ? err.message : String(err);
      process.stderr.write(`[runtime] failed to hydrate ${VECTORS_FILE}: ${message}\n`);
      return { loaded: 0, path: VECTORS_FILE };
    }
  }

  /**
   * Persist the current vector store to disk so the CLI's `ingest`
   * command and a restarted server see the same corpus.
   */
  async saveToDisk(): Promise<{ saved: number; path: string }> {
    await this.vectorStore.saveToFile(VECTORS_FILE);
    const n = await this.vectorStore.size();
    return { saved: n, path: VECTORS_FILE };
  }
}

let _instance: Runtime | null = null;
export function getRuntime(): Runtime {
  if (!_instance) _instance = new Runtime();
  return _instance;
}
