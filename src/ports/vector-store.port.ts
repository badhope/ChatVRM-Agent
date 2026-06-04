/**
 * Vector store port.
 *
 * Stores vectors with an opaque payload (id, text, metadata) and supports
 * top-k nearest-neighbour queries. Implementations:
 *  - {@link InMemoryVectorStore}: default, pure JS, unit-tested
 *  - {@link PersistentVectorStore}: file-backed (JSON) for small corpora
 *  - External adapters (sqlite-vss, qdrant, pgvector) plug into the same port
 */

export interface VectorRecord {
  id: string;
  vector: Float32Array;
  text: string;
  metadata?: Record<string, unknown>;
}

export interface VectorQuery {
  vector: Float32Array;
  topK: number;
  /** Optional filter applied to metadata fields. */
  filter?: (metadata: Record<string, unknown> | undefined) => boolean;
}

export interface VectorHit {
  id: string;
  text: string;
  metadata?: Record<string, unknown>;
  score: number; // cosine similarity in [-1, 1]
}

export interface VectorStore {
  readonly name: string;
  readonly dim: number;
  add(records: VectorRecord[]): Promise<void>;
  remove(ids: string[]): Promise<void>;
  query(q: VectorQuery): Promise<VectorHit[]>;
  size(): Promise<number>;
  /** Persist any in-memory state to disk. */
  persist?(): Promise<void>;
}
