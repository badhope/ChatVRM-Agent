/**
 * OpenAI embeddings adapter.
 *
 * Calls `/v1/embeddings` for `text-embedding-3-small` (default) or any
 * other OpenAI-compatible endpoint. Works against:
 *   - OpenAI: https://api.openai.com/v1
 *   - Azure OpenAI: same shape, base URL differs
 *   - vLLM / Ollama / LM Studio with an OpenAI-compatible /v1/embeddings
 *
 * Lazy: network is only touched on first `embed()` call.
 */

import type { Embedder } from '../ports/embeddings.port.js';

export interface OpenAIEmbedderOptions {
  model?: string;
  baseUrl?: string;
  apiKey?: string;
  /** Override the fetch impl (for tests / proxies). */
  fetchImpl?: typeof fetch;
}

export class OpenAIEmbedder implements Embedder {
  readonly id: string;
  readonly dim: number;
  private readonly model: string;
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: OpenAIEmbedderOptions = {}) {
    this.model = opts.model ?? 'text-embedding-3-small';
    this.baseUrl = (opts.baseUrl ?? 'https://api.openai.com/v1').replace(/\/$/, '');
    this.apiKey = opts.apiKey ?? process.env.OPENAI_API_KEY ?? '';
    this.fetchImpl = opts.fetchImpl ?? globalThis.fetch.bind(globalThis);
    this.id = `openai:${this.model}`;
    this.dim = OpenAIEmbedder.knownDim(this.model);
  }

  static knownDim(model: string): number {
    switch (model) {
      case 'text-embedding-3-small':
        return 1536;
      case 'text-embedding-3-large':
        return 3072;
      case 'text-embedding-ada-002':
        return 1536;
      default:
        return 1536;
    }
  }

  async embed(text: string): Promise<Float32Array> {
    const res = await this.embedBatch([text]);
    return res[0];
  }

  async embedBatch(texts: string[]): Promise<Float32Array[]> {
    if (texts.length === 0) return [];
    if (!this.apiKey) {
      throw new Error('OpenAIEmbedder: apiKey missing (set OPENAI_API_KEY or pass options)');
    }
    const resp = await this.fetchImpl(`${this.baseUrl}/embeddings`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({ model: this.model, input: texts }),
    });
    if (!resp.ok) {
      const body = await resp.text().catch(() => '');
      throw new Error(`OpenAIEmbedder HTTP ${resp.status}: ${body}`);
    }
    const data = (await resp.json()) as { data: Array<{ embedding: number[] }> };
    return data.data.map((d) => Float32Array.from(d.embedding));
  }
}
