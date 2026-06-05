/**
 * Single source of truth for the hashing embedder's vector dimension.
 * Both the CLI (`src/cli/index.ts`) and the server runtime
 * (`server/runtime.ts`) must agree, otherwise vectors ingested by one
 * cannot be loaded by the other — `InMemoryVectorStore.add()` rejects
 * vectors whose length doesn't match the store's `dim`.
 *
 * Override at runtime via the `EMBED_DIM` env var (parsed as int).
 * Default 256 keeps the JSON-persisted vector store under ~50KB per
 * 1000 records while still giving the BM25 retriever enough
 * resolution to discriminate documents in a 10k-record corpus.
 */
export const DEFAULT_EMBED_DIM = 256;

export function resolveEmbedDim(): number {
  const raw = process.env['EMBED_DIM'];
  if (raw === undefined || raw === '') return DEFAULT_EMBED_DIM;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0 || n > 4096) {
    return DEFAULT_EMBED_DIM;
  }
  return n;
}
