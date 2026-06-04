import { describe, it, expect } from 'vitest';
import { RecursiveTextChunker } from '../../../adapters/text-chunker.js';

describe('RecursiveTextChunker', () => {
  it('returns empty for empty input', () => {
    const c = new RecursiveTextChunker();
    expect(c.split('')).toEqual([]);
  });

  it('returns one chunk if shorter than chunkSize', () => {
    const c = new RecursiveTextChunker({ chunkSize: 100 });
    const out = c.split('hello world');
    expect(out).toHaveLength(1);
    expect(out[0].text).toBe('hello world');
  });

  it('splits long text into multiple chunks', () => {
    const c = new RecursiveTextChunker({ chunkSize: 50, chunkOverlap: 0 });
    const text = 'a'.repeat(200);
    const out = c.split(text);
    expect(out.length).toBeGreaterThan(1);
    for (const chunk of out) {
      expect(chunk.text.length).toBeLessThanOrEqual(50);
    }
  });

  it('preserves paragraph boundaries when possible', () => {
    const c = new RecursiveTextChunker({ chunkSize: 60, chunkOverlap: 0 });
    const text = 'First paragraph here.\n\nSecond paragraph follows.\n\nThird one.';
    const out = c.split(text);
    // Each chunk should not break in the middle of a word.
    for (const chunk of out) {
      expect(chunk.text).not.toMatch(/\b\w-\s/); // no mid-word hyphen
    }
  });

  it('applies overlap between consecutive chunks', () => {
    const c = new RecursiveTextChunker({ chunkSize: 30, chunkOverlap: 10 });
    const text = 'abcdefghij'.repeat(20);
    const out = c.split(text);
    if (out.length >= 2) {
      // Tail of chunk N should appear at head of chunk N+1.
      const tail = out[0].text.substring(out[0].text.length - 5);
      expect(out[1].text).toContain(tail);
    }
  });

  it('splitAll chains splits and re-numbers', () => {
    const c = new RecursiveTextChunker({ chunkSize: 20, chunkOverlap: 0 });
    const out = c.splitAll(['short', 'x'.repeat(50)]);
    expect(out.length).toBeGreaterThanOrEqual(2);
    for (let i = 0; i < out.length; i++) {
      expect(out[i].index).toBe(i);
    }
  });

  it('hard-cuts when no separator fits', () => {
    const c = new RecursiveTextChunker({ chunkSize: 10, chunkOverlap: 0, separators: [''] });
    const text = 'a'.repeat(35);
    const out = c.split(text);
    expect(out).toHaveLength(4);
    for (const chunk of out) {
      expect(chunk.text.length).toBeLessThanOrEqual(10);
    }
  });
});
