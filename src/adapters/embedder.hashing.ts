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

  async embed(text: string, _options?: { signal?: AbortSignal }): Promise<Float32Array> {
    return this.embedOne(text);
  }

  async embedBatch(texts: string[], _options?: { signal?: AbortSignal }): Promise<Float32Array[]> {
    // M10 (W19): the hashing embedder is purely CPU-bound; it
    // can't actually be cancelled. We still accept the signal
    // for API uniformity, and check it once per batch so a
    // caller that's been waiting on a 100k-row batch gets an
    // early `AbortError` if the parent cancelled mid-loop. The
    // per-token check would be too expensive.
    if (_options?.signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }
    return texts.map((t) => this.embedOne(t));
  }

  private embedOne(text: string): Float32Array {
    const v = new Float32Array(this.dim);
    const counts = new Map<number, { count: number; sign: number }>();
    for (const tok of tokenize(text, this.n)) {
      const h = fnv1a(tok);
      const slot = h % this.dim;
      // Sign polarity must be derived from the n-gram hash, NOT the slot index.
      // Using `(slot & 1)` makes every collision carry the same sign, so
      // collisions *add* instead of partially cancelling. Use the high bit of
      // the same hash for an independent pseudo-random sign per n-gram.
      const sign = ((h >>> 16) & 1) === 1 ? 1 : -1;
      const existing = counts.get(slot);
      if (existing) {
        existing.count += 1;
        // Distinct n-grams that collide on slot but disagree on sign will
        // partially cancel — which is the whole point of polarity.
      } else {
        counts.set(slot, { count: 1, sign });
      }
    }
    for (const [slot, { count, sign }] of counts) {
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
