/**
 * 变更控制系统 - 风险评估器
 *
 * 提供操作风险评估能力：
 * 1. 文件风险评估 - 根据操作类型和目标路径评估风险等级
 * 2. 风险等级标签和颜色工具函数
 */

import chalk from 'chalk';

import type {
  ChangeRecord,
  RiskAssessmentResult,
} from './types.js';

import type { ChangeAction } from '../risk-rules.js';
import {
  RiskLevel,
  RISK_LEVEL_WEIGHT,
  RISK_LEVEL_LABEL,
  RISK_LEVEL_STYLE,
  RISK_RULES,
  assessRisk,
} from '../risk-rules.js';

// ==================== 风险评估函数 ====================

/**
 * 评估文件操作风险
 *
 * 根据操作类型和目标路径，结合预定义的风险规则进行综合评估。
 * 返回风险等级、原因说明和匹配的规则列表。
 *
 * @param action - 操作类型（read/create/modify/delete/move/shell）
 * @param target - 操作目标（文件路径或 shell 命令）
 * @returns 风险评估结果，包含风险等级、原因和匹配的规则列表
 *
 * @example
 * ```typescript
 * const result = assessFileRisk('delete', '/etc/config.yaml');
 * // result.risk === RiskLevel.CRITICAL
 * // result.reason 包含 '删除文件' 和 '系统关键文件' 等原因
 * ```
 */
export function assessFileRisk(
  action: ChangeAction,
  target: string
): RiskAssessmentResult {
  const { risk, reason, rules } = assessRisk(action, target);
  return { risk, reason, rules };
}

/**
 * 检查风险是否达到指定阈值
 *
 * @param risk - 当前风险等级
 * @param threshold - 阈值风险等级
 * @returns 是否达到阈值
 */
export function isRiskAtOrAbove(
  risk: RiskLevel,
  threshold: RiskLevel
): boolean {
  return RISK_LEVEL_WEIGHT[risk] >= RISK_LEVEL_WEIGHT[threshold];
}

// ==================== 风险等级工具函数 ====================

/**
 * 获取风险等级对应的 chalk 颜色函数
 *
 * @param risk - 风险等级
 * @returns chalk 颜色函数
 */
export function getRiskStyle(
  risk: RiskLevel
): (text: string) => string {
  return RISK_LEVEL_STYLE[risk];
}

/**
 * 获取风险等级对应的标签
 *
 * @param risk - 风险等级
 * @returns 中文标签
 */
export function getRiskLabel(risk: RiskLevel): string {
  return RISK_LEVEL_LABEL[risk];
}

/**
 * 获取风险等级对应的颜色名称
 *
 * @param risk - 风险等级
 * @returns 颜色名称字符串
 */
export function getRiskColor(risk: RiskLevel): string {
  const colorMap: Record<RiskLevel, string> = {
    [RiskLevel.NEGLIGIBLE]: 'gray',
    [RiskLevel.LOW]: 'green',
    [RiskLevel.MEDIUM]: 'yellow',
    [RiskLevel.HIGH]: 'orange',
    [RiskLevel.CRITICAL]: 'red',
  };
  return colorMap[risk];
}

/**
 * 检查风险等级是否低于审批阈值（MEDIUM）
 *
 * @param risk - 风险等级
 * @returns 是否需要自动批准
 */
export function isAutoApprovable(risk: RiskLevel): boolean {
  return RISK_LEVEL_WEIGHT[risk] < RISK_LEVEL_WEIGHT[RiskLevel.MEDIUM];
}

/**
 * 创建变更记录（内部函数）
 *
 * @param action - 操作类型
 * @param target - 操作目标
 * @param risk - 风险等级
 * @param id - 唯一标识符
 * @returns 变更记录对象
 */
export function createChangeRecord(
  action: ChangeRecord['action'],
  target: string,
  risk: RiskLevel,
  id: string
): ChangeRecord {
  return {
    id,
    action,
    target,
    risk,
    backedUp: false,
    approved: isAutoApprovable(risk),
    timestamp: Date.now(),
  };
}
