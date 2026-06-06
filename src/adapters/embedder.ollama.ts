/**
 * Ollama embeddings adapter.
 *
 * Calls `/api/embeddings` on a local Ollama server. Default model is
 * `nomic-embed-text` (768d). Works with any model that exposes that
 * endpoint (mxbai-embed-large, all-minilm, snowflake-arctic-embed, etc.).
 */

import type { Embedder } from '../ports/embeddings.port.js';

export interface OllamaEmbedderOptions {
  model?: string;
  baseUrl?: string;
  dim?: number;
  fetchImpl?: typeof fetch;
}

export class OllamaEmbedder implements Embedder {
  readonly id: string;
  readonly dim: number;
  private readonly model: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: OllamaEmbedderOptions = {}) {
    this.model = opts.model ?? 'nomic-embed-text';
    this.baseUrl = (opts.baseUrl ?? process.env.OLLAMA_HOST ?? 'http://localhost:11434').replace(/\/$/, '');
    this.dim = opts.dim ?? 768;
    this.id = `ollama:${this.model}`;
    this.fetchImpl = opts.fetchImpl ?? globalThis.fetch.bind(globalThis);
  }

  async embed(text: string, options?: { signal?: AbortSignal }): Promise<Float32Array> {
    const res = await this.embedBatch([text], options);
    return res[0];
  }

  async embedBatch(texts: string[], options?: { signal?: AbortSignal }): Promise<Float32Array[]> {
    if (texts.length === 0) return [];
    // M10 (W19): bound each call with a 30s timeout (Ollama is
    // usually local so 30s is generous) AND honour the parent
    // signal. The combined signal races both — the first to
    // fire wins. The pre-W19 code had no timeout at all and
    // didn't propagate any cancellation, so a stuck Ollama
    // server could pin the entire ingestion pipeline.
    const sig = AbortSignal.any([
      options?.signal ?? new AbortController().signal,
      AbortSignal.timeout(30_000),
    ]);
    const out: Float32Array[] = [];
    for (const text of texts) {
      const resp = await this.fetchImpl(`${this.baseUrl}/api/embeddings`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ model: this.model, prompt: text }),
        signal: sig,
      });
      if (!resp.ok) {
        const body = await resp.text().catch(() => '');
        throw new Error(`OllamaEmbedder HTTP ${resp.status}: ${body}`);
      }
      const data = (await resp.json()) as { embedding: number[] };
      out.push(Float32Array.from(data.embedding));
    }
    return out;
  }
}
