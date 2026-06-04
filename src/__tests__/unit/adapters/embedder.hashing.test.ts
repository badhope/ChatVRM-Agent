import { describe, it, expect } from 'vitest';
import { HashingEmbedder } from '../../../adapters/embedder.hashing.js';

describe('HashingEmbedder', () => {
  it('returns L2-normalized vectors of the requested dim', async () => {
    const e = new HashingEmbedder({ dim: 256 });
    const v = await e.embed('hello world');
    expect(v.length).toBe(256);
    let s = 0;
    for (let i = 0; i < v.length; i++) s += v[i] * v[i];
    expect(Math.abs(Math.sqrt(s) - 1)).toBeLessThan(1e-5);
  });

  it('is deterministic for the same input', async () => {
    const e = new HashingEmbedder({ dim: 128 });
    const a = await e.embed('machine learning');
    const b = await e.embed('machine learning');
    expect(Array.from(a)).toEqual(Array.from(b));
  });

  it('produces different vectors for different inputs', async () => {
    const e = new HashingEmbedder({ dim: 256 });
    const a = await e.embed('cat');
    const b = await e.embed('aerospace engineering');
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff += Math.abs(a[i] - b[i]);
    expect(diff).toBeGreaterThan(0);
  });

  it('embeds a batch in one call', async () => {
    const e = new HashingEmbedder({ dim: 64 });
    const out = await e.embedBatch(['a', 'b', 'c']);
    expect(out).toHaveLength(3);
    for (const v of out) expect(v.length).toBe(64);
  });

  it('similar inputs have higher cosine similarity than unrelated ones', async () => {
    const e = new HashingEmbedder({ dim: 1024 });
    const a = await e.embed('the quick brown fox jumps over the lazy dog');
    const b = await e.embed('a quick brown fox leaps over the lazy dog');
    const c = await e.embed('an entirely unrelated financial report about EBITDA');
    function cos(x: Float32Array, y: Float32Array): number {
      let d = 0;
      for (let i = 0; i < x.length; i++) d += x[i] * y[i];
      return d;
    }
    const simAb = cos(a, b);
    const simAc = cos(a, c);
    expect(simAb).toBeGreaterThan(simAc);
  });
});
