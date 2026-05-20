/**
 * 不确定性和幻觉模式
 */

import { TrustLevel } from '../trust-types.js';
import { DetectionPattern, SeverityLevel } from './types.js';

/**
 * 不确定性表述模式
 */
export const UNCERTAINTY_PATTERNS: DetectionPattern[] = [
  {
    pattern: /我(不)?确定/,
    type: 'uncertainty',
    level: TrustLevel.AutoExecute,
    severity: 'low' as SeverityLevel,
    description: 'AI 自身不确定性表述',
  },
  {
    pattern: /我(不)?清楚/,
    type: 'uncertainty',
    level: TrustLevel.AutoExecute,
    severity: 'low' as SeverityLevel,
    description: 'AI 表示不清楚',
  },
  {
    pattern: /我猜测|我估计/,
    type: 'uncertainty',
    level: TrustLevel.AutoExecute,
    severity: 'low' as SeverityLevel,
    description: 'AI 猜测性表述',
  },
  {
    pattern: /我不(太)?知道/,
    type: 'uncertainty',
    level: TrustLevel.AutoExecute,
    severity: 'low' as SeverityLevel,
    description: 'AI 表示不知道',
  },
];

/**
 * 幻觉/知识边界模式
 */
export const HALLUCINATION_PATTERNS: DetectionPattern[] = [
  {
    pattern: /我(不)?知道/,
    type: 'hallucination',
    level: TrustLevel.AutoExecute,
    severity: 'low' as SeverityLevel,
    description: '知识边界表述',
  },
  {
    pattern: /没有足够信息/,
    type: 'hallucination',
    level: TrustLevel.AutoExecute,
    severity: 'low' as SeverityLevel,
    description: '信息不足表述',
  },
  {
    pattern: /无法确认/,
    type: 'hallucination',
    level: TrustLevel.AutoExecute,
    severity: 'low' as SeverityLevel,
    description: '无法确认表述',
  },
];
