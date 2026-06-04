/**
 * In-memory vector store with cosine-similarity k-NN search.
 *
 * This is the default {@link VectorStore} used in tests and small corpora.
 * For larger corpora (>~50k vectors) plug in sqlite-vss / qdrant / pgvector
 * by implementing the same interface.
 */

import type { VectorStore, VectorRecord, VectorQuery, VectorHit } from '../ports/vector-store.port.js';

interface StoredRecord {
  id: string;
  vector: Float32Array;
  text: string;
  metadata?: Record<string, unknown>;
  norm: number;
}

export class InMemoryVectorStore implements VectorStore {
  readonly name = 'in-memory';
  readonly dim: number;
  private records = new Map<string, StoredRecord>();

  constructor(dim: number) {
    this.dim = dim;
  }

  async add(records: VectorRecord[]): Promise<void> {
    for (const r of records) {
      if (r.vector.length !== this.dim) {
        throw new Error(
          `vector dim ${r.vector.length} != store dim ${this.dim} (id=${r.id})`,
        );
      }
      this.records.set(r.id, {
        id: r.id,
        vector: r.vector,
        text: r.text,
        metadata: r.metadata,
        norm: l2norm(r.vector),
      });
    }
  }

  async remove(ids: string[]): Promise<void> {
    for (const id of ids) {
      this.records.delete(id);
    }
  }

  async query(q: VectorQuery): Promise<VectorHit[]> {
    const qNorm = l2norm(q.vector);
    if (qNorm === 0) {
      return [];
    }
    const scored: VectorHit[] = [];
    for (const rec of this.records.values()) {
      if (q.filter && !q.filter(rec.metadata)) {
        continue;
      }
      const score = cosine(q.vector, qNorm, rec.vector, rec.norm);
      scored.push({ id: rec.id, text: rec.text, metadata: rec.metadata, score });
    }
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, q.topK);
  }

  async size(): Promise<number> {
    return this.records.size;
  }

  clear(): void {
    this.records.clear();
  }
}

function l2norm(v: Float32Array): number {
  let s = 0;
  for (let i = 0; i < v.length; i++) s += v[i] * v[i];
  return Math.sqrt(s);
}

function cosine(a: Float32Array, aNorm: number, b: Float32Array, bNorm: number): number {
  if (aNorm === 0 || bNorm === 0) return 0;
  let dot = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) dot += a[i] * b[i];
  return dot / (aNorm * bNorm);
}
