/**
 * Deterministic hashing embedder.
 *
 * No model, no network, no GPU. Implements the "hashing trick" used by
 * scikit-learn's HashingVectorizer: each unique n-gram is mapped by a
 * stable hash to a slot in a fixed-size vector; the slot value is the
 * signed count (positive or negative based on hash polarity).
 *
 * It is not a state-of-the-art embedder — it cannot capture synonymy or
 * paraphrase — but it is fast, deterministic, and good enough to test
 * pipelines and to bootstrap a corpus when no model is available.
 *
 * For real embeddings use {@link OpenAIEmbedder} or {@link OllamaEmbedder}.
 */

import type { Embedder } from '../ports/embeddings.port.js';

export interface HashingEmbedderOptions {
  dim?: number;
  /** Character n-gram size. Default 3 (trigrams). */
  n?: number;
  /** Sublinear TF: log(1 + count). Default true. */
  sublinear?: boolean;
}

function fnv1a(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function tokenize(text: string, n: number): string[] {
  const padded = ` ${text.toLowerCase()} `;
  const out: string[] = [];
  for (let i = 0; i + n <= padded.length; i++) {
    out.push(padded.substring(i, i + n));
  }
  return out;
}

export class HashingEmbedder implements Embedder {
  readonly id = 'hashing';
  readonly dim: number;
  private readonly n: number;
  private readonly sublinear: boolean;

  constructor(opts: HashingEmbedderOptions = {}) {
    this.dim = opts.dim ?? 1024;
    this.n = opts.n ?? 3;
    this.sublinear = opts.sublinear ?? true;
  }

  async embed(text: string): Promise<Float32Array> {
    return this.embedOne(text);
  }

  async embedBatch(texts: string[]): Promise<Float32Array[]> {
    return texts.map((t) => this.embedOne(t));
  }

  private embedOne(text: string): Float32Array {
    const v = new Float32Array(this.dim);
    const counts = new Map<number, number>();
    for (const tok of tokenize(text, this.n)) {
      const h = fnv1a(tok);
      const slot = h % this.dim;
      counts.set(slot, (counts.get(slot) ?? 0) + 1);
    }
    for (const [slot, count] of counts) {
      // Sign polarity derived from the n-gram hash to reduce collisions.
      const sign = (slot & 1) === 1 ? 1 : -1;
      v[slot] = sign * (this.sublinear ? Math.log(1 + count) : count);
    }
    // L2 normalize.
    let s = 0;
    for (let i = 0; i < v.length; i++) s += v[i] * v[i];
    const norm = Math.sqrt(s);
    if (norm > 0) {
      for (let i = 0; i < v.length; i++) v[i] /= norm;
    }
    return v;
  }
}
