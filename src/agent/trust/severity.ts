/**
 * 严重级别管理模块
 *
 * 提供问题严重级别的定义和排序功能。
 */

import { TrustLevel, TrustIssue, TRUST_LEVEL_WEIGHT } from '../trust-types.js';
import { SeverityLevel, DetectionPattern } from './types.js';

// ==================== Severity Level Configuration ====================

/**
 * 严重级别权重映射（用于排序）
 */
export const SEVERITY_LEVELS: Record<SeverityLevel, number> = {
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

// ==================== Severity Functions ====================

/**
 * 根据信任级别获取严重级别 - 简化版
 *
 * @param level - 信任级别
 * @returns 对应的严重级别
 */
export function getSeverityLevel(level: TrustLevel): SeverityLevel {
  // 简化：仅需确认的问题为 high，其他为 low
  return level === TrustLevel.RequireConfirmation ? 'high' : 'low';
}

/**
 * 按严重级别排序问题列表
 *
 * @param issues - 问题列表
 * @returns 按严重级别降序排列的问题列表
 */
export function sortIssuesBySeverity(issues: TrustIssue[]): TrustIssue[] {
  return [...issues].sort((a, b) => {
    const severityA = SEVERITY_LEVELS[getSeverityLevel(a.level)];
    const severityB = SEVERITY_LEVELS[getSeverityLevel(b.level)];
    return severityB - severityA;
  });
}

/**
 * 去重并排序问题列表
 *
 * 同一类型和描述的问题只保留最高级别的。
 *
 * @param issues - 问题列表
 * @returns 去重并排序后的问题列表
 */
export function deduplicateAndSortIssues(issues: TrustIssue[]): TrustIssue[] {
  const map = new Map<string, TrustIssue>();

  for (const issue of issues) {
    const key = `${issue.type}:${issue.description}`;
    const existing = map.get(key);

    if (!existing || TRUST_LEVEL_WEIGHT[issue.level] > TRUST_LEVEL_WEIGHT[existing.level]) {
      map.set(key, issue);
    }
  }

  // 按风险级别降序排列
  return [...map.values()].sort(
    (a, b) => TRUST_LEVEL_WEIGHT[b.level] - TRUST_LEVEL_WEIGHT[a.level]
  );
}

/**
 * 判断问题是否为高严重级别
 *
 * @param issue - 信任问题
 * @returns 是否为高严重级别（high 或 critical）
 */
export function isHighSeverity(issue: TrustIssue): boolean {
  return issue.level === TrustLevel.RequireConfirmation;
}

/**
 * 从检测模式创建问题对象
 *
 * @param pattern - 检测模式
 * @param suggestion - 可选的建议文本
 * @returns 信任问题对象
 */
export function createIssueFromPattern(
  pattern: DetectionPattern,
  suggestion?: string
): TrustIssue {
  return {
    type: pattern.type,
    level: pattern.level,
    description: pattern.description,
    suggestion: suggestion ?? pattern.description,
  };
}
