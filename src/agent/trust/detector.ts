/**
 * 信任检测器主模块
 *
 * 提供全面的 AI 输出问题检测能力。
 */

import { TrustIssue, DANGEROUS_PATTERNS, ISSUE_TYPE_SUGGESTION } from '../trust-types.js';
import {
  DetectionPattern,
  ALL_DETECTION_PATTERNS,
  getAllPatterns,
  getPatternsByCategory,
  PatternCategory,
} from './patterns.js';
import { deduplicateAndSortIssues } from './severity.js';
import {
  DetectionContext,
  shouldSkipInTest,
  detectWithContext,
} from './context.js';

// ==================== TrustDetector Class ====================

/**
 * 信任检测器类
 *
 * 提供全面的 AI 输出问题检测能力。
 *
 * @example
 * ```typescript
 * const detector = new TrustDetector();
 * const issues = detector.detect('rm -rf /', { toolUsed: 'shell' });
 * ```
 */
export class TrustDetector {
  private customPatterns: DetectionPattern[] = [];

  /**
   * 添加自定义检测模式
   *
   * @param pattern - 自定义检测模式
   */
  addPattern(pattern: DetectionPattern): void {
    this.customPatterns.push(pattern);
  }

  /**
   * 检测 AI 输出中的潜在问题
   *
   * @param output - AI 的输出文本
   * @param context - 检测上下文
   * @returns 检测到的信任问题列表（按风险级别降序排列）
   */
  detect(output: string, context?: DetectionContext): TrustIssue[] {
    if (!output || typeof output !== 'string') {
      return [];
    }

    const issues: TrustIssue[] = [];
    const isTestEnv = shouldSkipInTest(context);

    // 1. 使用所有预定义模式进行检测
    for (const pattern of ALL_DETECTION_PATTERNS) {
      if (pattern.ignoreInTest && isTestEnv) {
        continue;
      }
      if (pattern.pattern.test(output)) {
        issues.push(this.createIssue(pattern));
      }
    }

    // 2. 使用自定义模式进行检测
    for (const pattern of this.customPatterns) {
      if (pattern.ignoreInTest && isTestEnv) {
        continue;
      }
      if (pattern.pattern.test(output)) {
        issues.push(this.createIssue(pattern));
      }
    }

    // 3. 使用原有 DANGEROUS_PATTERNS 进行检测（保持向后兼容）
    for (const { pattern, type, level, description } of DANGEROUS_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      if (regex.test(output)) {
        // 避免重复添加
        if (!issues.some(i => i.description === description)) {
          issues.push({
            type,
            level,
            description,
            suggestion: ISSUE_TYPE_SUGGESTION[type],
          });
        }
      }
    }

    // 4. 上下文感知检测
    if (context) {
      const contextIssues = detectWithContext(output, context);
      issues.push(...contextIssues);
    }

    // 5. 去重并排序
    return deduplicateAndSortIssues(issues);
  }

  /**
   * 分析输出内容（detect 的别名，保持向后兼容）
   *
   * @param output - AI 的输出文本
   * @param context - 检测上下文
   * @returns 检测到的信任问题列表
   */
  analyze(output: string, context?: DetectionContext): TrustIssue[] {
    return this.detect(output, context);
  }

  /**
   * 创建问题对象
   */
  private createIssue(pattern: DetectionPattern): TrustIssue {
    return {
      type: pattern.type,
      level: pattern.level,
      description: pattern.description,
      suggestion: ISSUE_TYPE_SUGGESTION[pattern.type],
    };
  }
}

// ==================== Standalone Functions ====================

/**
 * 默认检测器实例
 */
const defaultDetector = new TrustDetector();

/**
 * 问题检测器 - 检测 AI 输出中的潜在问题
 *
 * 遍历预定义的危险模式列表，对输出文本进行正则匹配。
 * 同时根据上下文信息（用户意图、使用的工具）进行额外的上下文感知检测。
 *
 * @param output - AI 的输出文本
 * @param context - 可选的上下文信息，包含用户意图和使用的工具
 * @returns 检测到的信任问题列表（按风险级别降序排列）
 *
 * @example
 * ```typescript
 * const issues = detectIssues('你可以执行 rm -rf /tmp/logs 来清理日志', {
 *   intent: 'cleanup',
 *   toolUsed: 'shell',
 * });
 * // issues 将包含一个 CRITICAL 级别的破坏性操作问题
 * ```
 */
export function detectIssues(
  output: string,
  context?: { intent?: string; toolUsed?: string }
): TrustIssue[] {
  return defaultDetector.detect(output, context);
}

// Re-export pattern utilities for backward compatibility
export { getAllPatterns, getPatternsByCategory };
export type { PatternCategory };
