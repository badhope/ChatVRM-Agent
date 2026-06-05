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

export interface IngestionOptions {
  embedder: Embedder;
  vectorStore: VectorStore;
  chunker?: RecursiveTextChunker;
  loader?: Loader;
  /** Optional source tag attached to every chunk's metadata. */
  sourceTag?: string;
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

export class IngestionPipeline {
  private readonly embedder: Embedder;
  private readonly vectorStore: VectorStore;
  private readonly chunker?: RecursiveTextChunker;
  private readonly loader: Loader;
  private readonly sourceTag?: string;

  constructor(opts: IngestionOptions) {
    this.embedder = opts.embedder;
    this.vectorStore = opts.vectorStore;
    this.chunker = opts.chunker;
    this.loader = opts.loader ?? new AutoLoader();
    this.sourceTag = opts.sourceTag;
  }

  /**
   * Ingest one file. Useful as the CLI primitive (`ingest <file>`)
   * and inside a streaming ETL that watches a directory.
   */
  async ingestPath(path: string, onProgress?: (p: IngestionProgress) => void): Promise<IngestionResult> {
    const t0 = performance.now();
    const errors: Array<{ document: string; error: string }> = [];

    onProgress?.({ stage: 'load', current: 0, total: 1, detail: path });
    let documents: Document[];
    try {
      documents = await this.loader.load(path);
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      errors.push({ document: path, error });
      onProgress?.({ stage: 'done', current: 1, total: 1, detail: 'load failed' });
      return { documents: 0, chunks: 0, vectors: 0, errors, durationMs: Math.round(performance.now() - t0) };
    }
    onProgress?.({ stage: 'load', current: 1, total: 1, detail: `${documents.length} document(s)` });

    const result = await this.ingestDocuments(documents, onProgress, path);
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
      const label = d.source ?? documentLabel;
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
        allChunks.push({
          id: `${label}#${i}-${j}`,
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
    //    the store.
    const vectors: VectorRecord[] = [];
    const BATCH = 32;
    for (let i = 0; i < allChunks.length; i += BATCH) {
      const batch = allChunks.slice(i, i + BATCH);
      let embeddings: Float32Array[];
      try {
        const out = await this.embedder.embedBatch(batch.map((c) => c.text));
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
