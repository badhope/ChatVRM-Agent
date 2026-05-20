import crypto from 'crypto';
import type { MemoryNode } from './graph-types.js';

// ============================================================
// 工具函数
// ============================================================

/**
 * 生成唯一 ID
 */
export function generateId(): string {
  return `mg-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
}

/**
 * 简单分词：英文按空格，中文提取 2-4 字子串
 * 与 manager.ts 中的 tokenize 方法保持一致
 */
export function tokenize(text: string): string[] {
  const tokens: string[] = [];
  // 英文词
  const englishWords = text.match(/[a-zA-Z0-9]+/g);
  if (englishWords) tokens.push(...englishWords.map(w => w.toLowerCase()));
  // 中文字符提取 2-4 字子串
  const chineseChars = text.match(/[\u4e00-\u9fa5]+/g);
  if (chineseChars) {
    for (const segment of chineseChars) {
      if (segment.length >= 2) tokens.push(segment); // 整段
      if (segment.length >= 4) {
        // 2字窗口
        for (let i = 0; i <= segment.length - 2; i++) {
          tokens.push(segment.substring(i, i + 2));
        }
      }
    }
  }
  return tokens;
}

/**
 * 计算两个文本的相关性得分
 */
export function computeRelevance(queryTokens: string[], content: string): number {
  const lowerContent = content.toLowerCase();
  let score = 0;
  for (const kw of queryTokens) {
    if (kw.length < 2) continue; // 跳过单字符
    const occurrences = lowerContent.split(kw).length - 1;
    if (occurrences > 0) score += occurrences * (kw.length >= 4 ? 2 : 1); // 长词权重更高
  }
  return score;
}

/**
 * 判断节点是否已过期
 */
export function isExpired(node: MemoryNode): boolean {
  if (!node.expiresAt) return false;
  return new Date(node.expiresAt).getTime() < Date.now();
}
