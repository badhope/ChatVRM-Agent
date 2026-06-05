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
import { InMemoryVectorStore, b64ToFloat32 } from '../src/adapters/vector-store.memory.js';
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
   *
   * C2 (W18): also read the v2 base64 vector format that
   * `InMemoryVectorStore.saveToFile` produces since the W17 H4 change.
   * The previous version only understood the v1 `vector: number[]`
   * field, so every restart after a W17-era ingest would lose all
   * vectors.
   */
  async hydrateFromDisk(): Promise<{ loaded: number; path: string | null }> {
    if (!existsSync(VECTORS_FILE)) {
      return { loaded: 0, path: null };
    }
    try {
      const raw = await readFile(VECTORS_FILE, 'utf-8');
      const parsed = JSON.parse(raw) as Array<{
        id: string;
        vector?: number[];
        vectorB64?: string;
        text: string;
        metadata?: Record<string, unknown>;
      }>;
      // b64ToFloat32 is imported above so the runtime module stays
      // free of the vector-store's other utilities.
      const records: Array<{ id: string; text: string; metadata: Record<string, unknown>; vector: Float32Array }> = [];
      for (const r of parsed) {
        // v2 (post-W17 H4): base64-encoded little-endian Float32
        // binary, compact and round-trip precise. v1 fallback: raw
        // `vector: number[]` from pre-W17 ingests.
        let vector: Float32Array;
        if (typeof r.vectorB64 === 'string' && r.vectorB64.length > 0) {
          vector = b64ToFloat32(r.vectorB64);
        } else if (Array.isArray(r.vector)) {
          vector = new Float32Array(r.vector);
        } else if (r.vector) {
          vector = new Float32Array(Object.values(r.vector));
        } else {
          vector = new Float32Array();
        }
        // M4 (W18): dim check immediately after the b64 decode so a
        // truncated or corrupt record (whose length doesn't match
        // the embedder's dim) is rejected before it enters the
        // store. The old code only checked `records[0]`, so a
        // mid-file record with the wrong dim would be added and
        // then fail at query time with a confusing cosine error.
        if (vector.length > 0 && vector.length !== this.vectorStore.dim) {
          process.stderr.write(
            `[runtime] skipping record ${r.id}: decoded dim ${vector.length} ` +
              `does not match expected ${this.vectorStore.dim}\n`,
          );
          continue;
        }
        records.push({
          id: r.id,
          text: r.text,
          metadata: r.metadata ?? {},
          vector,
        });
      }
      // Validate dim against the in-memory store. After M4, every
      // record has already been individually checked, so this is a
      // belt-and-braces guard for the (admittedly rare) case where
      // the embedder's configured dim disagrees with the first
      // record's dim. Kept as a single `loaded > 0` check.
      if (records.length === 0) {
        return { loaded: 0, path: VECTORS_FILE };
      }
      await this.vectorStore.add(records);
      // M23 (W18): feed the records into the HybridRetriever with
      // their pre-computed vectors, so the retriever doesn't
      // re-embed (wasteful) and the hydration is bit-exact (no
      // risk of an embedder config drift silently zeroing the
      // retriever). `addWithVectors` is the canonical hydration
      // path; `add()` remains for first-time ingestions that
      // need to compute vectors from text.
      await this.retriever.addWithVectors(
        records.map((r) => ({
          id: r.id,
          text: r.text,
          metadata: r.metadata,
          vector: r.vector,
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
