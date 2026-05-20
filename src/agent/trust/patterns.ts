/**
 * 信任检测模式定义
 *
 * 包含所有用于检测 AI 输出中潜在问题的模式定义。
 */

import { TrustIssue } from '../trust-types.js';
import { DetectionPattern, PatternCategory } from './types.js';

// Re-export types
export type { DetectionPattern, PatternCategory, SeverityLevel } from './types.js';

// Import pattern groups
import { FILE_SYSTEM_PATTERNS, NETWORK_PATTERNS } from './patterns-fs.js';
import { CODE_PATTERNS, DATABASE_PATTERNS } from './patterns-code.js';
import { SENSITIVE_PATTERNS, SYSTEM_PATTERNS } from './patterns-sensitive.js';
import { UNCERTAINTY_PATTERNS, HALLUCINATION_PATTERNS } from './patterns-uncertainty.js';

// Re-export pattern groups
export { FILE_SYSTEM_PATTERNS, NETWORK_PATTERNS } from './patterns-fs.js';
export { CODE_PATTERNS, DATABASE_PATTERNS } from './patterns-code.js';
export { SENSITIVE_PATTERNS, SYSTEM_PATTERNS } from './patterns-sensitive.js';
export { UNCERTAINTY_PATTERNS, HALLUCINATION_PATTERNS } from './patterns-uncertainty.js';

/**
 * 所有检测模式（合并）
 */
export const ALL_DETECTION_PATTERNS: DetectionPattern[] = [
  ...FILE_SYSTEM_PATTERNS,
  ...NETWORK_PATTERNS,
  ...CODE_PATTERNS,
  ...DATABASE_PATTERNS,
  ...SENSITIVE_PATTERNS,
  ...SYSTEM_PATTERNS,
  ...UNCERTAINTY_PATTERNS,
  ...HALLUCINATION_PATTERNS,
];

/**
 * 获取特定类别的检测模式
 *
 * @param category - 模式类别
 * @returns 该类别的检测模式数组
 */
export function getPatternsByCategory(category: PatternCategory): DetectionPattern[] {
  switch (category) {
    case 'filesystem':
      return [...FILE_SYSTEM_PATTERNS];
    case 'network':
      return [...NETWORK_PATTERNS];
    case 'code':
      return [...CODE_PATTERNS];
    case 'database':
      return [...DATABASE_PATTERNS];
    case 'sensitive':
      return [...SENSITIVE_PATTERNS];
    case 'system':
      return [...SYSTEM_PATTERNS];
  }
}

/**
 * 获取所有检测模式（用于调试或展示）
 *
 * @returns 所有检测模式的副本
 */
export function getAllPatterns(): DetectionPattern[] {
  return [...ALL_DETECTION_PATTERNS];
}
