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
  private readonly vectorWeight: number;
  private readonly rrfK: number;
  private readonly oversample: number;
  private docs = new Map<string, HybridDoc>();
  private vectorIds = new Set<string>();

  constructor(opts: HybridRetrieverOptions) {
    this.embedder = opts.embedder;
    this.vectorStore = opts.vectorStore;
    this.bm25Weight = opts.bm25Weight ?? 1;
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
    const records = docs.map((d, i) => ({
      id: d.id,
      text: d.text,
      metadata: d.metadata,
      vector: vectors[i],
    }));
    await this.vectorStore.add(records);
    for (const r of records) this.vectorIds.add(r.id);
  }

  async remove(ids: string[]): Promise<void> {
    for (const id of ids) {
      this.bm25.discard(id);
      this.docs.delete(id);
      this.vectorIds.delete(id);
    }
    await this.vectorStore.remove(ids);
  }

  async retrieve(query: string, topK: number = 5): Promise<HybridResult[]> {
    const oversample = topK * this.oversample;

    // BM25 results.
    const bm25Hits = this.bm25.search(query, { combineWith: 'AND' }).slice(0, oversample);
    const bm25Rank = new Map<string, number>();
    bm25Hits.forEach((h, idx) => bm25Rank.set(String(h.id), idx + 1));

    // Vector results.
    let vectorHits: VectorHit[] = [];
    if (this.vectorIds.size > 0) {
      const qv = await this.embedder.embed(query);
      vectorHits = await this.vectorStore.query({ vector: qv, topK: oversample });
    }
    const vectorRank = new Map<string, number>();
    vectorHits.forEach((h, idx) => vectorRank.set(h.id, idx + 1));

    // RRF fusion.
    const allIds = new Set<string>([...bm25Rank.keys(), ...vectorRank.keys()]);
    const fused: HybridResult[] = [];
    for (const id of allIds) {
      const rrfBm = bm25Rank.has(id) ? this.bm25Weight / (this.rrfK + (bm25Rank.get(id) ?? 0)) : 0;
      const rrfVe = vectorRank.has(id) ? this.vectorWeight / (this.rrfK + (vectorRank.get(id) ?? 0)) : 0;
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
