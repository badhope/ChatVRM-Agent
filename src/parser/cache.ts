/**
 * 语法树缓存
 *
 * 缓存已解析的语法树，支持增量解析复用。
 */

import type { ParseResult } from './engine.js';

interface CacheEntry {
  result: ParseResult;
  timestamp: number;
  sourceHash: string;
}

/** 简单的字符串哈希 */
function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return String(hash);
}

/** 缓存容量 */
const MAX_CACHE_SIZE = 200;
/** 缓存 TTL（毫秒） */
const CACHE_TTL = 5 * 60 * 1000;

class ParseCache {
  private cache = new Map<string, CacheEntry>();

  get(filePath: string): ParseResult | null {
    const entry = this.cache.get(filePath);
    if (!entry) return null;

    // 检查过期
    if (Date.now() - entry.timestamp > CACHE_TTL) {
      this.cache.delete(filePath);
      return null;
    }

    return entry.result;
  }

  set(filePath: string, result: ParseResult): void {
    // LRU 淘汰
    if (this.cache.size >= MAX_CACHE_SIZE) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        this.cache.delete(firstKey);
      }
    }

    this.cache.set(filePath, {
      result,
      timestamp: Date.now(),
      sourceHash: simpleHash(result.source),
    });
  }

  /** 检查文件是否需要重新解析 */
  needsUpdate(filePath: string, newSource: string): boolean {
    const entry = this.cache.get(filePath);
    if (!entry) return true;
    if (Date.now() - entry.timestamp > CACHE_TTL) return true;
    return simpleHash(newSource) !== entry.sourceHash;
  }

  /** 清空缓存 */
  clear(): void {
    this.cache.clear();
  }

  /** 缓存大小 */
  get size(): number {
    return this.cache.size;
  }
}

export const parseCache = new ParseCache();
