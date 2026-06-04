import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryVectorStore } from '../../../adapters/vector-store.memory.js';
import { HashingEmbedder } from '../../../adapters/embedder.hashing.js';

describe('InMemoryVectorStore', () => {
  const dim = 64;
  let store: InMemoryVectorStore;

  beforeEach(() => {
    store = new InMemoryVectorStore(dim);
  });

  it('starts empty', async () => {
    expect(await store.size()).toBe(0);
  });

  it('rejects vectors of the wrong dim', async () => {
    await expect(
      store.add([{ id: 'a', text: 'a', vector: new Float32Array(8) }]),
    ).rejects.toThrow(/dim/);
  });

  it('returns top-k hits ranked by cosine similarity', async () => {
    const emb = new HashingEmbedder({ dim });
    const texts = [
      'machine learning is fun',
      'deep learning is a kind of machine learning',
      'pizza with extra cheese',
    ];
    const vectors = await emb.embedBatch(texts);
    await store.add(
      texts.map((t, i) => ({ id: `d${i}`, text: t, vector: vectors[i] })),
    );
    const qv = await emb.embed('what is machine learning');
    const hits = await store.query({ vector: qv, topK: 3 });
    expect(hits).toHaveLength(3);
    for (let i = 1; i < hits.length; i++) {
      expect(hits[i - 1].score).toBeGreaterThanOrEqual(hits[i].score);
    }
    expect(['d0', 'd1']).toContain(hits[0].id);
  });

  it('removes vectors', async () => {
    const emb = new HashingEmbedder({ dim });
    const v = await emb.embed('foo');
    await store.add([{ id: 'a', text: 'foo', vector: v }]);
    expect(await store.size()).toBe(1);
    await store.remove(['a']);
    expect(await store.size()).toBe(0);
  });

  it('respects filter function in query', async () => {
    const emb = new HashingEmbedder({ dim });
    const v = await emb.embed('hello');
    await store.add([
      { id: 'keep', text: 'hello', vector: v, metadata: { type: 'a' } },
      { id: 'skip', text: 'hello', vector: v, metadata: { type: 'b' } },
    ]);
    const qv = await emb.embed('hello');
    const hits = await store.query({
      vector: qv,
      topK: 5,
      filter: (m) => m?.type === 'a',
    });
    expect(hits.map((h) => h.id)).toEqual(['keep']);
  });
});
