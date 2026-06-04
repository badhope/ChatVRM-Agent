import { describe, it, expect, beforeEach } from 'vitest';
import { HashingEmbedder } from '../../../adapters/embedder.hashing.js';
import { InMemoryVectorStore } from '../../../adapters/vector-store.memory.js';
import { HybridRetriever } from '../../../adapters/hybrid-retriever.js';

describe('HybridRetriever', () => {
  const dim = 256;
  let retriever: HybridRetriever;

  beforeEach(async () => {
    const embedder = new HashingEmbedder({ dim });
    const store = new InMemoryVectorStore(dim);
    retriever = new HybridRetriever({ embedder, vectorStore: store, oversample: 3 });
  });

  it('combines BM25 and vector with RRF', async () => {
    await retriever.add([
      { id: 'a', text: 'machine learning and deep neural networks' },
      { id: 'b', text: 'pizza with extra cheese and pepperoni' },
      { id: 'c', text: 'unsupervised feature learning' },
      { id: 'd', text: 'deep learning for image classification' },
    ]);
    const results = await retriever.retrieve('deep learning image', 3);
    expect(results).toHaveLength(3);
    // Vector search should rank the deep-learning docs higher; BM25 should
    // also boost them because of the keyword "deep learning".
    expect(['a', 'c', 'd']).toContain(results[0].id);
    expect(results[0].sources.bm25).toBeDefined();
    expect(results[0].sources.vector).toBeDefined();
  });

  it('returns empty list for an empty retriever', async () => {
    const results = await retriever.retrieve('anything', 5);
    expect(results).toEqual([]);
  });

  it('removes documents from both indexes', async () => {
    await retriever.add([
      { id: 'a', text: 'foo bar baz' },
      { id: 'b', text: 'qux quux quuux' },
    ]);
    expect(retriever.size()).toEqual({ bm25: 2, vector: 2 });
    await retriever.remove(['a']);
    expect(retriever.size()).toEqual({ bm25: 1, vector: 1 });
    const results = await retriever.retrieve('foo', 3);
    expect(results.map((r) => r.id)).toEqual(['b']);
  });

  it('respects metadata stored on documents', async () => {
    await retriever.add([
      { id: 'a', text: 'apple', metadata: { kind: 'fruit' } },
      { id: 'b', text: 'apple', metadata: { kind: 'company' } },
    ]);
    const results = await retriever.retrieve('apple', 2);
    expect(results).toHaveLength(2);
    for (const r of results) {
      expect(r.metadata?.kind).toBeDefined();
    }
  });

  it('returns scores in non-increasing order', async () => {
    await retriever.add([
      { id: 'a', text: 'graph neural networks for molecular property prediction' },
      { id: 'b', text: 'transformers for language modeling' },
      { id: 'c', text: 'graph attention networks' },
      { id: 'd', text: 'convolutional neural networks for vision' },
    ]);
    const results = await retriever.retrieve('graph neural networks', 4);
    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1].score).toBeGreaterThanOrEqual(results[i].score);
    }
  });
});
