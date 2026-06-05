/**
 * Hybrid retriever.
 *
 * Combines a BM25 keyword index and a vector store using Reciprocal
 * Rank Fusion (RRF). The two retrievers run in parallel; their ranked
 * lists are merged with:
 *
 *     rrf(d) = Σ_r  weight_r / (k + rank_r(d))
 *
 * where k=60 (the constant used in the original RRF paper). Documents
 * present in both lists naturally float to the top.
 *
 * This mirrors the common pattern in modern RAG (e.g. LlamaIndex's
 * `QueryFusionRetriever`, LangChain's `EnsembleRetriever`).
 */

import MiniSearch from 'minisearch';
import type { Embedder } from '../ports/embeddings.port.js';
import type { VectorStore, VectorHit } from '../ports/vector-store.port.js';

/**
 * W17 M4: a vector containing NaN/Infinity would poison cosine scores and
 * produce non-deterministic ordering. Detect and reject early so that
 * `retrieve()` falls back to the BM25-only path.
 */
function hasNonFinite(v: Float32Array | number[] | undefined | null): boolean {
  if (!v || v.length === 0) return true;
  for (let i = 0; i < v.length; i += 1) {
    const x = v[i];
    if (x === undefined || x === null || !Number.isFinite(x)) return true;
  }
  return false;
}

export interface HybridDoc {
  id: string;
  text: string;
  metadata?: Record<string, unknown>;
}

export interface HybridResult {
  id: string;
  text: string;
  metadata?: Record<string, unknown>;
  score: number;
  /** Source signals that contributed. */
  sources: { bm25?: number; vector?: number };
}

export interface HybridRetrieverOptions {
  embedder: Embedder;
  vectorStore: VectorStore;
  /** Weight of the BM25 signal. Default 1. */
  bm25Weight?: number;
  /** Weight of the vector signal. Default 1. */
  vectorWeight?: number;
  /** RRF constant k. Default 60. */
  rrfK?: number;
  /** Over-fetch factor (topK * oversample for each retriever). Default 4. */
  oversample?: number;
}

export class HybridRetriever {
  private readonly embedder: Embedder;
  private readonly vectorStore: VectorStore;
  private readonly bm25: MiniSearch<HybridDoc>;
  private readonly bm25Weight: number;
  /** True when the caller passed `bm25Weight` in the options. */
  private readonly bm25WeightSet: boolean;
  private readonly vectorWeight: number;
  private readonly rrfK: number;
  private readonly oversample: number;
  private docs = new Map<string, HybridDoc>();
  private vectorIds = new Set<string>();

  constructor(opts: HybridRetrieverOptions) {
    this.embedder = opts.embedder;
    this.vectorStore = opts.vectorStore;
    this.bm25Weight = opts.bm25Weight ?? 1;
    this.bm25WeightSet = opts.bm25Weight !== undefined;
    this.vectorWeight = opts.vectorWeight ?? 1;
    this.rrfK = opts.rrfK ?? 60;
    this.oversample = opts.oversample ?? 4;
    this.bm25 = new MiniSearch<HybridDoc>({
      idField: 'id',
      fields: ['text'],
      storeFields: ['text', 'metadata'],
    });
  }

  async add(docs: HybridDoc[]): Promise<void> {
    if (docs.length === 0) return;
    // Insert into BM25.
    this.bm25.addAll(docs);
    for (const d of docs) {
      this.docs.set(d.id, d);
    }
    // Insert into vector store.
    const texts = docs.map((d) => d.text);
    const vectors = await this.embedder.embedBatch(texts);
    if (vectors.length !== texts.length) {
      throw new Error(
        `HybridRetriever.add: embedder returned ${vectors.length} vectors for ${texts.length} inputs`,
      );
    }
    for (let i = 0; i < vectors.length; i += 1) {
      if (vectors[i] === undefined || vectors[i] === null) {
        throw new Error(`HybridRetriever.add: embedder returned undefined vector at index ${i}`);
      }
    }
    const records = docs.map((d, i) => ({
      id: d.id,
      text: d.text,
      metadata: d.metadata,
      vector: vectors[i]!,
    }));
    await this.vectorStore.add(records);
    for (const r of records) this.vectorIds.add(r.id);
  }

  async remove(ids: string[]): Promise<void> {
    // W17 L6: clear the local in-memory state FIRST so that even if the
    // vector-store `remove()` throws (e.g. transient I/O error), the
    // retriever's own state is already consistent. We then attempt the
    // backing-store call; if it throws, surface the error.
    for (const id of ids) {
      this.bm25.discard(id);
      this.docs.delete(id);
      this.vectorIds.delete(id);
    }
    await this.vectorStore.remove(ids);
  }

  async retrieve(query: string, topK?: number): Promise<HybridResult[]>;
  async retrieve(opts: { query: string; topK?: number; source?: 'vector' | 'keyword' | 'hybrid'; vectorWeight?: number }): Promise<HybridResult[]>;
  async retrieve(
    arg: string | { query: string; topK?: number; source?: 'vector' | 'keyword' | 'hybrid'; vectorWeight?: number },
    legacyTopK: number = 5,
  ): Promise<HybridResult[]> {
    const opts = typeof arg === 'string' ? { query: arg, topK: legacyTopK } : arg;
    const topK = opts.topK ?? 5;
    const source = opts.source ?? 'hybrid';
    const vectorWeight = opts.vectorWeight ?? 0.6;
    const oversample = topK * this.oversample;

    // BM25 results.
    const bm25Hits = this.bm25.search(opts.query, { combineWith: 'AND' }).slice(0, oversample);
    const bm25Rank = new Map<string, number>();
    bm25Hits.forEach((h, idx) => bm25Rank.set(String(h.id), idx + 1));

    // Vector results (only if the source allows).
    let vectorHits: VectorHit[] = [];
    if ((source === 'vector' || source === 'hybrid') && this.vectorIds.size > 0) {
      const qv = await this.embedder.embed(opts.query);
      // W17 M4: guard against an embedder that produced NaN/Infinity.
      // The cosine math would propagate NaN through the entire ranking
      // and the sort comparator would return unstable results. Reject
      // a degenerate query vector up-front and fall back to BM25-only
      // results for this call.
      if (!hasNonFinite(qv)) {
        vectorHits = await this.vectorStore.query({ vector: qv, topK: oversample });
      }
    }
    const vectorRank = new Map<string, number>();
    vectorHits.forEach((h, idx) => vectorRank.set(h.id, idx + 1));

    // For pure vector mode, return directly (no RRF needed).
    if (source === 'vector') {
      return vectorHits.slice(0, topK).map((h) => ({
        id: h.id,
        text: h.text,
        metadata: h.metadata,
        score: h.score,
        sources: { vector: h.score },
      }));
    }
    // For pure keyword mode, return BM25 hits (normalised).
    if (source === 'keyword') {
      return bm25Hits.slice(0, topK).map((h) => ({
        id: String(h.id),
        text: (h as unknown as { text: string }).text ?? '',
        metadata: (h as unknown as { metadata?: Record<string, unknown> }).metadata,
        score: h.score,
        sources: { bm25: h.score },
      }));
    }

    // RRF fusion (hybrid mode). Honour the user-configured `bm25Weight`
    // from the constructor; if absent, fall back to the symmetric
    // (1 - vectorWeight) default to preserve the historical behaviour.
    const bm25Weight = this.bm25WeightSet
      ? this.bm25Weight
      : Math.max(0, 1 - vectorWeight);
    const allIds = new Set<string>([...bm25Rank.keys(), ...vectorRank.keys()]);
    const fused: HybridResult[] = [];
    for (const id of allIds) {
      const rrfBm = bm25Rank.has(id) ? bm25Weight / (this.rrfK + (bm25Rank.get(id) ?? 0)) : 0;
      const rrfVe = vectorRank.has(id) ? vectorWeight / (this.rrfK + (vectorRank.get(id) ?? 0)) : 0;
      const score = rrfBm + rrfVe;
      const doc = this.docs.get(id);
      if (!doc) continue;
      const bm25Raw = bm25Hits.find((h) => String(h.id) === id)?.score;
      const vectorRaw = vectorHits.find((h) => h.id === id)?.score;
      fused.push({
        id,
        text: doc.text,
        metadata: doc.metadata,
        score,
        sources: { bm25: bm25Raw, vector: vectorRaw },
      });
    }
    fused.sort((a, b) => b.score - a.score);
    return fused.slice(0, topK);
  }

  size(): { bm25: number; vector: number } {
    return { bm25: this.docs.size, vector: this.vectorIds.size };
  }
}
