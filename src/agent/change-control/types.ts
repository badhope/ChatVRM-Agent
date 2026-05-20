/**
 * 变更控制系统 - 类型定义
 *
 * 提供变更控制相关的类型定义：
 * 1. 变更记录接口
 * 2. 审批结果接口
 * 3. 风险等级阈值常量
 */

import { RiskLevel } from '../risk-rules.js';

// ==================== 接口 ====================

/**
 * 变更记录接口
 * 描述一次文件或命令操作的完整信息
 */
export interface ChangeRecord {
  /** 唯一标识符 */
  id: string;
  /** 操作类型 */
  action: 'read' | 'create' | 'modify' | 'delete' | 'move' | 'shell';
  /** 操作目标（文件路径或命令） */
  target: string;
  /** 风险等级 */
  risk: RiskLevel;
  /** 是否已备份 */
  backedUp: boolean;
  /** 备份文件路径 */
  backupPath?: string;
  /** 是否已获批准 */
  approved: boolean;
  /** 操作时间戳 */
  timestamp: number;
  /** 修改前的文件内容快照（用于回滚） */
  snapshot?: string;
}

/**
 * 审批结果接口
 * 描述风险评估和审批流程的结果
 */
export interface ApprovalResult {
  /** 是否已批准 */
  approved: boolean;
  /** 对应的变更记录 */
  record: ChangeRecord;
}

/**
 * 风险评估结果接口
 * 包含风险评估的详细信息
 */
export interface RiskAssessmentResult {
  /** 风险等级 */
  risk: RiskLevel;
  /** 风险原因 */
  reason: string;
  /** 匹配的规则列表 */
  rules: string[];
}

// ==================== 常量 ====================

/**
 * 风险等级阈值
 * 用于判断操作是否需要用户确认或自动备份
 */
export const RISK_LEVEL_THRESHOLDS = {
  /** 需要用户确认的中等风险阈值 */
  MEDIUM: 2,
  /** 需要自动备份的高风险阈值 */
  HIGH: 3,
  /** 危险操作阈值 */
  CRITICAL: 4,
} as const;

/**
 * 风险等级颜色映射
 * 用于终端输出的颜色配置
 */
export const RISK_COLORS: Record<RiskLevel, string> = {
  [RiskLevel.NEGLIGIBLE]: 'gray',
  [RiskLevel.LOW]: 'green',
  [RiskLevel.MEDIUM]: 'yellow',
  [RiskLevel.HIGH]: 'hex:#FFA500',
  [RiskLevel.CRITICAL]: 'red',
};
