/**
 * 信任检测模式类型定义
 */

import { TrustLevel, TrustIssue } from '../trust-types.js';

/**
 * 风险严重级别
 */
export type SeverityLevel = 'low' | 'medium' | 'high' | 'critical';

/**
 * 检测模式定义
 */
export interface DetectionPattern {
  pattern: RegExp;
  type: TrustIssue['type'];
  level: TrustLevel;
  severity: SeverityLevel;
  description: string;
  /** 在测试环境中是否忽略 */
  ignoreInTest?: boolean;
}

/**
 * 模式类别类型
 */
export type PatternCategory = 'filesystem' | 'network' | 'code' | 'database' | 'sensitive' | 'system';
