/**
 * 信任管理领域模型
 */

/**
 * 信任级别枚举
 * 从 SAFE 到 CRITICAL 递增，级别越高风险越大
 */
export enum TrustLevel {
  SAFE = 'safe',
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

/**
 * 信任问题接口
 * 描述检测到的单个信任问题
 */
export interface TrustIssue {
  /** 问题描述 */
  description: string;
  /** 信任级别 */
  level: TrustLevel;
  /** 问题类别 */
  category: 'hallucination' | 'dangerous_op' | 'sensitive_info' | 'uncertainty' | 'quality';
  /** 修复建议 */
  suggestion?: string;
}

/**
 * 信任报告接口
 */
export interface TrustReport {
  /** 是否需要用户确认 */
  requiresConfirmation: boolean;
  /** 检测到的问题列表 */
  issues: TrustIssue[];
  /** 报告摘要 */
  summary: string;
  /** 整体信任级别 */
  overallLevel: TrustLevel;
}
