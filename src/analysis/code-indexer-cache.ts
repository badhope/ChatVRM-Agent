/**
 * Code Indexer Cache
 *
 * 为代码索引提供缓存机制，基于文件修改时间检查来决定是否使用缓存。
 * 避免重复构建索引，提高性能。
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { buildCodeIndex } from './code-indexer.js';
import type { CodeIndex } from './indexer/types.js';

// ============================================================
// 缓存实现
// ============================================================

interface CacheEntry {
  mtime: number;
  index: CodeIndex;
}

/**
 * 代码索引缓存管理器
 * 基于目录修改时间提供智能缓存
 */
export class CodeIndexCache {
  private cache = new Map<string, CacheEntry>();

  /**
   * 获取目录的最新修改时间
   * 通过递归检查所有源文件的修改时间
   */
  private async getDirMtime(rootDir: string): Promise<number> {
    let maxMtime = 0;

    async function scanDir(dir: string): Promise<void> {
      try {
        const entries = await fs.readdir(dir, { withFileTypes: true });

        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);

          // 跳过 node_modules 和隐藏目录
          if (entry.name.startsWith('.') || entry.name === 'node_modules') {
            continue;
          }

          if (entry.isDirectory()) {
            await scanDir(fullPath);
          } else if (entry.isFile()) {
            // 只检查常见的源代码文件
            const ext = path.extname(entry.name).toLowerCase();
            const sourceExts = new Set([
              '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
              '.py', '.java', '.go', '.rs', '.cpp', '.c', '.h',
              '.php', '.rb', '.swift', '.kt', '.scala',
            ]);

            if (sourceExts.has(ext)) {
              try {
                const stats = await fs.stat(fullPath);
                if (stats.mtimeMs > maxMtime) {
                  maxMtime = stats.mtimeMs;
                }
              } catch {
                // 忽略无法访问的文件
              }
            }
          }
        }
      } catch {
        // 忽略无法读取的目录
      }
    }

    await scanDir(rootDir);
    return maxMtime;
  }

  /**
   * 获取代码索引
   * 如果缓存有效则返回缓存，否则重新构建
   */
  async getIndex(rootDir: string): Promise<CodeIndex> {
    const currentMtime = await this.getDirMtime(rootDir);
    const cached = this.cache.get(rootDir);

    if (cached && cached.mtime >= currentMtime) {
      return cached.index;
    }

    const newIndex = await buildCodeIndex(rootDir);
    this.cache.set(rootDir, { mtime: Date.now(), index: newIndex });
    return newIndex;
  }

  /**
   * 使指定目录的缓存失效
   */
  invalidate(rootDir: string): void {
    this.cache.delete(rootDir);
  }

  /**
   * 清空所有缓存
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * 获取缓存统计信息
   */
  getStats(): { size: number; entries: string[] } {
    return {
      size: this.cache.size,
      entries: Array.from(this.cache.keys()),
    };
  }
}

// ============================================================
// 全局缓存实例
// ============================================================

/** 全局代码索引缓存实例 */
export const codeIndexCache = new CodeIndexCache();

/**
 * 获取带缓存的代码索引
 * 便捷函数，使用全局缓存实例
 */
export async function getCachedCodeIndex(rootDir: string): Promise<CodeIndex> {
  return codeIndexCache.getIndex(rootDir);
}

/**
 * 使代码索引缓存失效
 * 便捷函数，使用全局缓存实例
 */
export function invalidateCodeIndexCache(rootDir: string): void {
  codeIndexCache.invalidate(rootDir);
}
