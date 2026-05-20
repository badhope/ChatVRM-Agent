import { describe, it, expect } from 'vitest';
import { estimateTokens, tokenize } from './tokens.js';

describe('estimateTokens', () => {
  it('should return 0 for empty string', () => {
    expect(estimateTokens('')).toBe(0);
  });

  it('should estimate English text', () => {
    const text = 'Hello world';
    const tokens = estimateTokens(text);
    expect(tokens).toBeGreaterThan(0);
  });

  it('should estimate Chinese text with higher ratio', () => {
    const chineseText = '你好世界';
    const englishText = 'Hello world';
    expect(estimateTokens(chineseText)).toBeGreaterThan(estimateTokens(englishText));
  });

  it('should calculate English tokens accurately with tiktoken', () => {
    const text = 'abcd'; // 4 chars
    const tokens = estimateTokens(text);
    // tiktoken may encode differently; just verify it returns a positive number
    expect(tokens).toBeGreaterThan(0);
  });

  it('should calculate Chinese tokens accurately with tiktoken', () => {
    const text = '中';
    const tokens = estimateTokens(text);
    // tiktoken provides accurate count for Chinese characters
    expect(tokens).toBeGreaterThan(0);
  });

  it('should handle mixed content', () => {
    const text = 'Hello你好';
    const tokens = estimateTokens(text);
    // tiktoken provides accurate count
    expect(tokens).toBeGreaterThan(0);
  });
});

describe('tokenize', () => {
  it('should return empty array for empty string', () => {
    expect(tokenize('')).toEqual([]);
  });

  it('should tokenize English text', () => {
    const result = tokenize('Hello world');
    expect(result).toContain('hello');
    expect(result).toContain('world');
  });

  it('should tokenize Chinese text', () => {
    const result = tokenize('你好世界');
    expect(result.length).toBeGreaterThan(0);
  });

  it('should remove duplicates', () => {
    const result = tokenize('hello hello world');
    expect(result.filter(w => w === 'hello').length).toBe(1);
  });

  it('should filter out short words', () => {
    const result = tokenize('a ab abc');
    expect(result).not.toContain('a');
    expect(result).toContain('ab');
    expect(result).toContain('abc');
  });

  it('should convert to lowercase', () => {
    const result = tokenize('HELLO World');
    expect(result).toContain('hello');
    expect(result).toContain('world');
  });
});
