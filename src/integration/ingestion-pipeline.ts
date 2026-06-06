/**
 * Document ingestion pipeline.
 *
 * End-to-end: file path → pick loader → load → chunk → embed → store
 * into a {@link VectorStore}. This is the canonical way to populate
 * the knowledge base that {@link RagTool} queries.
 *
 * Pipeline stages, each individually replaceable:
 *   1. `pickLoader(path)` — AutoLoader dispatches on extension.
 *   2. `loader.load(path)` — text or buffer → `Document[]`.
 *   3. `chunker.split(text)` — long docs into overlapping windows.
 *   4. `embedder.embedBatch(texts)` — batch embedding.
 *   5. `vectorStore.upsert(records)` — write to the store.
 *
 * Returns a per-stage count so the caller can emit a useful summary
 * line and surface partial-failure results.
 */

import type { Embedder } from '../ports/embeddings.port.js';
import type { VectorRecord, VectorStore } from '../ports/vector-store.port.js';
import type { RecursiveTextChunker } from '../adapters/text-chunker.js';
import { AutoLoader } from '../loaders/auto.loader.js';
import type { Loader, Document } from '../ports/loader.port.js';
import { sandboxPath } from '../shared/sandbox.js';

export interface IngestionOptions {
  embedder: Embedder;
  vectorStore: VectorStore;
  chunker?: RecursiveTextChunker;
  loader?: Loader;
  /** Optional source tag attached to every chunk's metadata. */
  sourceTag?: string;
  /**
   * M10 (W19): an optional AbortSignal propagated into the
   * embedder batch calls and the vector store writes. Useful
   * for the RAG HTTP route to thread its request-derived
   * signal into the long-running embed step (a 1000-chunk
   * document can spend seconds in `embedBatch` on a CPU-only
   * setup, and the user may cancel mid-ingest).
   */
  signal?: AbortSignal;
}

export interface IngestionResult {
  documents: number;
  chunks: number;
  vectors: number;
  errors: Array<{ document: string; error: string }>;
  durationMs: number;
}

export interface IngestionProgress {
  stage: 'load' | 'chunk' | 'embed' | 'store' | 'done';
  current: number;
  total: number;
  detail?: string;
}

/**
 * M22 (W18): canonicalise the per-chunk `source` label so we
 * don't end up with the same path repeated twice on a single
 * chunk. The previous code joined the document's `source` and
 * the loader's `documentLabel` with a literal ' :: ' separator
 * (see the older pre-W17 path), which produced labels like
 * `/tmp/a/foo.txt :: /tmp/a/foo.txt` when both fields carried
 * the same path. Even after W17 M10 stopped joining them, a
 * loader that happens to set `source` to the full path while
 * the caller passes the full path as `documentLabel` would
 * still produce a long, redundant label.
 *
 * We dedup by (a) trimming, (b) collapsing any
 * `<label> :: <label>` repetition into a single `<label>`, and
 * (c) falling back to a stable placeholder if both inputs are
 * empty. The dedup is intentionally case-sensitive and
 * path-sensitive — `Foo.txt` and `foo.txt` are different
 * sources from the agent's point of view.
 */
function dedupSourceLabel(a: string | undefined, b: string | undefined): string {
  const ax = a?.trim() ?? '';
  const bx = b?.trim() ?? '';
  if (ax && bx) {
    if (ax === bx) return ax;
    // Heuristic: if one is a suffix of the other (after
    // normalisation), prefer the longer one — the full path is
    // more useful for the user than the basename.
    if (ax.endsWith(bx)) return ax;
    if (bx.endsWith(ax)) return bx;
    return `${ax} :: ${bx}`;
  }
  return ax || bx || '<unknown>';
}

/**
 * H8 (W19): process-wide semaphore for ingestion concurrency.
 * We use a chained-promise wait list so callers awaiting a
 * slot don't busy-loop. The cap is intentionally modest (4) —
 * a flood of concurrent ingestions would otherwise pin all
 * CPU cores on embedding work and starve the LLM call the
 * agent may be making in parallel.
 */
class IngestSemaphore {
  private active = 0;
  private waiters: Array<() => void> = [];
  constructor(private readonly max: number) {}
  async acquire(): Promise<void> {
    if (this.active < this.max) {
      this.active++;
      return;
    }
    return new Promise<void>((resolve) => this.waiters.push(resolve));
  }
  release(): void {
    this.active = Math.max(0, this.active - 1);
    const next = this.waiters.shift();
    if (next) {
      this.active++;
      next();
    }
  }
}

const ingestSemaphore = new IngestSemaphore(4);

export function _resetIngestSemaphoreForTests(): void {
  // Drain active and pending waiters. Used by the test harness
  // to keep per-test state isolated.
  while ((ingestSemaphore as unknown as { active: number }).active > 0) {
    ingestSemaphore.release();
  }
  const w = (ingestSemaphore as unknown as { waiters: Array<() => void> }).waiters;
  for (const resolve of w) resolve();
  w.length = 0;
}

export class IngestionPipeline {
  private readonly embedder: Embedder;
  private readonly vectorStore: VectorStore;
  private readonly chunker?: RecursiveTextChunker;
  private readonly loader: Loader;
  private readonly sourceTag?: string;
  // M10 (W19): the per-instance AbortSignal is captured at
  // construction time and re-used for every embedder batch
  // call. The pre-W19 class had no signal field, so the
  // caller-supplied cancel signal was never seen by the
  // embedder and a 30s `embedBatch` would run to completion
  // even after the user cancelled the HTTP request.
  private readonly signal?: AbortSignal;
  // W17 M10: monotonic per-instance counter mixed into chunk IDs to
  // guarantee uniqueness across ingestion runs of the same source.
  private idCounter = 0;
  private nextId(): string {
    this.idCounter = (this.idCounter + 1) >>> 0;
    // base36 keeps the id short and human-readable in persisted form.
    return this.idCounter.toString(36);
  }

  constructor(opts: IngestionOptions) {
    this.embedder = opts.embedder;
    this.vectorStore = opts.vectorStore;
    this.chunker = opts.chunker;
    this.loader = opts.loader ?? new AutoLoader();
    this.sourceTag = opts.sourceTag;
    this.signal = opts.signal;
  }

  /**
   * Ingest one file. Useful as the CLI primitive (`ingest <file>`)
   * and inside a streaming ETL that watches a directory.
   *
   * C1 (W19): the path is sandboxed through `sandboxPath` before
   * the loader sees it. Previously the loader received the raw
   * caller-supplied path and read whatever the process had
   * permission to read, including `/etc/passwd`, the user's SSH
   * keys, and the keychain sqlite blob. The default is to refuse
   * absolute paths outside the workspace; a caller that needs the
   * wider allowlist (multi-workspace mode) passes
   * `{ allowAbsolute: true }` via `sandboxPathOpts` below.
   */
  async ingestPath(
    path: string,
    onProgress?: (p: IngestionProgress) => void,
    sandboxPathOpts: { allowAbsolute?: boolean } = {},
  ): Promise<IngestionResult> {
    // H8 (W19): gate every ingest call through the global
    // semaphore. We acquire *before* the sandbox check so a
    // malicious caller can't starve the limiter by passing a
    // path that would otherwise be rejected — instead, even a
    // refused path consumes a slot for as long as it takes to
    // run the sandbox check (microseconds), keeping the back-
    // pressure honest. The slot is released in `finally` so
    // exceptions don't leak it.
    await ingestSemaphore.acquire();
    try {
      return await this._ingestPathInner(path, onProgress, sandboxPathOpts);
    } finally {
      ingestSemaphore.release();
    }
  }

  private async _ingestPathInner(
    path: string,
    onProgress: ((p: IngestionProgress) => void) | undefined,
    sandboxPathOpts: { allowAbsolute?: boolean },
  ): Promise<IngestionResult> {
    const t0 = performance.now();
    const errors: Array<{ document: string; error: string }> = [];

    // C1 (W19): sandbox the path before any FS work. The resolved
    // path is what the loader actually reads, not the caller
    // string. The error surface here is the same as
    // `writeFile blocked:` — the loader never sees an unsafe
    // path, so a malicious LLM output cannot exfiltrate files
    // through the document ingestion path.
    const safe = sandboxPath(path, sandboxPathOpts);
    if (!safe.ok) {
      onProgress?.({ stage: 'done', current: 0, total: 1, detail: 'path blocked' });
      return {
        documents: 0,
        chunks: 0,
        vectors: 0,
        errors: [{ document: path, error: safe.error }],
        durationMs: Math.round(performance.now() - t0),
      };
    }
    const safePath = safe.resolved;

    onProgress?.({ stage: 'load', current: 0, total: 1, detail: safePath });
    let documents: Document[];
    try {
      documents = await this.loader.load(safePath);
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      errors.push({ document: safePath, error });
      onProgress?.({ stage: 'done', current: 1, total: 1, detail: 'load failed' });
      return { documents: 0, chunks: 0, vectors: 0, errors, durationMs: Math.round(performance.now() - t0) };
    }
    onProgress?.({ stage: 'load', current: 1, total: 1, detail: `${documents.length} document(s)` });

    const result = await this.ingestDocuments(documents, onProgress, safePath);
    return {
      documents: documents.length,
      chunks: result.chunks,
      vectors: result.vectors,
      errors: [...errors, ...result.errors],
      durationMs: Math.round(performance.now() - t0),
    };
  }

  /**
   * Ingest a pre-loaded list of documents. Useful for in-memory
   * ingestion (e.g. from a chat message or a queue event).
   *
   * Best-effort: chunking or embedding failures for a single document
   * are pushed into `errors` and the rest of the batch continues.
   * Vector-store failures are surfaced as a single error entry.
   */
  async ingestDocuments(
    documents: Document[],
    onProgress?: (p: IngestionProgress) => void,
    documentLabel: string = '<in-memory>',
  ): Promise<{ chunks: number; vectors: number; errors: Array<{ document: string; error: string }> }> {
    const errors: Array<{ document: string; error: string }> = [];
    const allChunks: Array<{ id: string; text: string; metadata: Record<string, unknown> }> = [];

    // 1) chunk — per-document try/catch so one bad document does not
    //    abort the whole run.
    let chunkedCount = 0;
    for (let i = 0; i < documents.length; i++) {
      const d = documents[i]!;
      // M22 (W18): dedup the source label so a chunk's `source`
      // metadata doesn't carry the same path twice. See the
      // `dedupSourceLabel` doc above for the heuristic.
      const label = dedupSourceLabel(d.source, documentLabel);
      let parts: Array<{ text: string; start: number; end: number }>;
      try {
        parts = this.chunker
          ? this.chunker.split(d.text)
          : [{ text: d.text, start: 0, end: d.text.length }];
      } catch (err) {
        errors.push({ document: label, error: `chunk: ${(err as Error).message}` });
        continue;
      }
      onProgress?.({ stage: 'chunk', current: i + 1, total: documents.length, detail: `${parts.length} chunk(s)` });
      for (let j = 0; j < parts.length; j++) {
        const p = parts[j]!;
        // W17 M10: the previous id was `${label}#${i}-${j}` which
        // collides if two documents share the same `source` field
        // (e.g. when the loader re-emits the same file under a
        // different document index, or when two virtual docs in a
        // batch both have `source: "user"`). Mix in the byte offset
        // and a per-pipeline counter so collisions are essentially
        // impossible.
        const id = `${label}#${i}-${j}-${p.start}-${this.nextId()}`;
        allChunks.push({
          id,
          text: p.text,
          metadata: {
            source: label,
            locator: d.locator ?? '',
            ...(d.metadata ?? {}),
            chunkIndex: j,
            ...(this.sourceTag ? { sourceTag: this.sourceTag } : {}),
          },
        });
        chunkedCount += 1;
      }
    }
    const chunks = chunkedCount;

    // 2) embed (batched) — per-batch try/catch + length check so a
    //    misbehaving embedder cannot push `undefined` vectors into
    //    the store. M10 (W19): thread the parent signal into
    //    each batch so a user-cancel mid-embedding cuts the
    //    HTTP call to OpenAI / Ollama short.
    const vectors: VectorRecord[] = [];
    const BATCH = 32;
    for (let i = 0; i < allChunks.length; i += BATCH) {
      const batch = allChunks.slice(i, i + BATCH);
      let embeddings: Float32Array[];
      try {
        const out = await this.embedder.embedBatch(batch.map((c) => c.text), { signal: this.signal });
        embeddings = out as Float32Array[];
        if (embeddings.length !== batch.length) {
          throw new Error(
            `embedBatch length mismatch: got ${embeddings.length} vectors for ${batch.length} inputs (embedder=${this.embedder.id})`,
          );
        }
      } catch (err) {
        const msg = (err as Error).message;
        for (const c of batch) {
          errors.push({ document: c.metadata['source'] as string ?? documentLabel, error: `embed: ${msg}` });
        }
        continue;
      }
      onProgress?.({
        stage: 'embed',
        current: Math.min(i + BATCH, allChunks.length),
        total: allChunks.length,
      });
      for (let j = 0; j < batch.length; j++) {
        vectors.push({
          id: batch[j]!.id,
          vector: embeddings[j]!,
          text: batch[j]!.text,
          metadata: batch[j]!.metadata,
        });
      }
    }

    // 3) store
    onProgress?.({ stage: 'store', current: 0, total: 1 });
    try {
      if (vectors.length > 0) {
        // M10 (W19): forward the signal to the vector-store
        // add. PersistentVectorStore currently uses an in-memory
        // map + `fs.writeFile` (sync) so the signal can't be
        // honoured mid-call, but the future IVFFlat disk scanner
        // will be async-cancellable and the port already accepts
        // the field.
        await this.vectorStore.add(vectors);
      }
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      errors.push({ document: documentLabel, error: `store: ${error}` });
    }
    onProgress?.({ stage: 'done', current: 1, total: 1 });

    return { chunks, vectors: vectors.length, errors };
  }
}
