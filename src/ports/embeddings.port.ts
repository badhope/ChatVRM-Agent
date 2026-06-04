/**
 * Embeddings port.
 *
 * An embedder converts a string into a fixed-length dense float vector.
 * Implementations are swappable so the same code path works in tests
 * (HashingEmbedder, deterministic, offline) and production
 * (OpenAIEmbedder, OllamaEmbedder).
 *
 * Hybrid search composes this with {@link VectorStore} and BM25.
 */

export interface Embedder {
  readonly id: string;
  readonly dim: number;
  embed(text: string): Promise<Float32Array>;
  embedBatch(texts: string[]): Promise<Float32Array[]>;
}
