/**
 * Reranker unit tests.
 */

import { describe, it, expect } from 'vitest';
import { rerank, scorePair, computeTotal, llmRerank } from '../../../integration/reranker.js';
import type { HybridResult } from '../../../adapters/hybrid-retriever.js';

const sample = (id: string, text: string, score = 0): HybridResult => ({
  id,
  text,
  score,
  metadata: {},
  sources: {},
});

describe('rerank', () => {
  it('preserves top item when it has the highest overlap', () => {
    // Item '3' is at the bottom but has the most overlap with the
    // query. Overlap should dominate over the position tie-breaker.
    const results = [
      sample('1', 'unrelated content about plants and gardening'),
      sample('2', 'a brief note about a totally different subject here'),
      sample('3', 'quantum physics and quantum physics are the same subject'),
    ];
    const ranked = rerank('quantum physics', results);
    expect(ranked[0]!.id).toBe('3');
    expect(ranked[0]!.originalRank).toBe(2);
  });

  it('exposes per-feature scores on each result', () => {
    const ranked = rerank('apple fruit', [sample('1', 'apple is a fruit')]);
    expect(ranked[0]!.features).toBeDefined();
    expect(ranked[0]!.features.overlap).toBeGreaterThan(0);
    expect(ranked[0]!.features.position).toBe(1);
  });

  it('handles empty result list', () => {
    expect(rerank('anything', [])).toEqual([]);
  });

  it('preserves the input array (does not mutate)', () => {
    const input = [sample('1', 'a'), sample('2', 'b')];
    const inputCopy = input.map((r) => r.id);
    rerank('test', input);
    expect(input.map((r) => r.id)).toEqual(inputCopy);
  });

  it('penalises very short and very long candidates via length feature', () => {
    // "a" is 1 token (< 3) → length 0.3
    // "a b c d e" is 5 tokens → length 1
    // "a" * 500 is 500 tokens (> 400) → length 0.7
    const features1 = scorePair('a b c d e', 'a b c d e f g h i j');
    const features2 = scorePair('a b c d e', 'a');
    const features3 = scorePair('a b c d e', Array(500).fill('a').join(' '));
    expect(features2.length).toBeLessThan(features1.length);
    expect(features3.length).toBeLessThan(1);
  });

  it('position bias gives earlier candidates a higher position score', () => {
    const f0 = scorePair('q', 'q', { originalRank: 0, candidateCount: 5 });
    const f4 = scorePair('q', 'q', { originalRank: 4, candidateCount: 5 });
    expect(f0.position).toBeGreaterThan(f4.position);
  });

  it('weights can be customised', () => {
    const a = computeTotal({ overlap: 1, position: 0, length: 0 }, { overlapWeight: 1, positionWeight: 0, lengthWeight: 0 });
    const b = computeTotal({ overlap: 1, position: 0, length: 0 }, { overlapWeight: 0, positionWeight: 1, lengthWeight: 0 });
    expect(a).toBe(1);
    expect(b).toBe(0);
  });

  it('normalises weights so the total is in [0,1]', () => {
    const ranked = rerank('q', [sample('1', 'q'), sample('2', 'x')]);
    for (const r of ranked) {
      expect(r.features.total).toBeGreaterThanOrEqual(0);
      expect(r.features.total).toBeLessThanOrEqual(1);
    }
  });
});

describe('llmRerank', () => {
  it('returns a sorted list using the LLM scores', async () => {
    const chat = async (msgs: Array<{ role: 'user' | 'system' | 'assistant'; content: string }>) => {
      // For passage 1 say "3", others "1" or "0".
      const isFirst = msgs.some((m) => m.content.includes('direct answer'));
      return { content: isFirst ? '3' : '1' };
    };
    const ranked = await llmRerank('direct answer', [
      sample('1', 'direct answer: 42'),
      sample('2', 'irrelevant stuff'),
    ], { chat });
    expect(ranked[0]!.id).toBe('1');
  });

  it('handles LLM failures gracefully (falls back to 0)', async () => {
    const chat = async () => { throw new Error('down'); };
    const ranked = await llmRerank('q', [sample('1', 'a'), sample('2', 'b')], { chat });
    expect(ranked).toHaveLength(2);
  });

  it('handles empty input', async () => {
    const chat = async () => ({ content: '0' });
    expect(await llmRerank('q', [], { chat })).toEqual([]);
  });
});
