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

  async embed(text: string): Promise<Float32Array> {
    const res = await this.embedBatch([text]);
    return res[0];
  }

  async embedBatch(texts: string[]): Promise<Float32Array[]> {
    if (texts.length === 0) return [];
    const out: Float32Array[] = [];
    for (const text of texts) {
      const resp = await this.fetchImpl(`${this.baseUrl}/api/embeddings`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ model: this.model, prompt: text }),
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
