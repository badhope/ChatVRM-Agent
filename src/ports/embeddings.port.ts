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

export interface EmbedderOptions {
  /**
   * M10 (W19): abort signal for the embed call. The
   * `IngestionPipeline` and `HybridRetriever.retrieve` paths
   * thread the parent request's signal down so a user-cancel
   * (or a parent-stage abort) cuts the underlying HTTP call
   * to the embedder short. Embedders that talk to a remote
   * endpoint (`OpenAIEmbedder`, `OllamaEmbedder`) wire it
   * through to `fetch({ signal })`; the in-process
   * `HashingEmbedder` ignores it (it can't be cancelled, but
   * it also can't hang).
   */
  signal?: AbortSignal;
}

export interface Embedder {
  readonly id: string;
  readonly dim: number;
  /**
   * Embed a single text. M10 (W19): callers may pass an
   * options bag with an AbortSignal to cancel the underlying
   * call. Implementations that don't talk to the network
   * (e.g. `HashingEmbedder`) ignore the signal.
   */
  embed(text: string, options?: EmbedderOptions): Promise<Float32Array>;
  embedBatch(texts: string[], options?: EmbedderOptions): Promise<Float32Array[]>;
}
