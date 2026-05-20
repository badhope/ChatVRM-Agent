/**
 * 信任管理器 - 类型定义与常量数据
 *
 * 包含信任评估所需的枚举、接口、危险模式列表和工具常量。
 */

import chalk from 'chalk';

// ==================== 枚举与接口 ====================

/**
 * 信任级别枚举 - 简化为2级
 * 仅区分是否需要用户确认
 */
export enum TrustLevel {
  RequireConfirmation = 'require_confirmation',  // 需要用户确认
  AutoExecute = 'auto_execute',                  // 自动执行，无需确认
}

/**
 * 信任问题接口
 * 描述检测到的单个信任问题
 */
export interface TrustIssue {
  /** 问题类型 */
  type: 'hallucination' | 'uncertainty' | 'dangerous' | 'destructive' | 'sensitive';
  /** 信任级别 */
  level: TrustLevel;
  /** 问题描述 */
  description: string;
  /** 建议的处理方式 */
  suggestion: string;
}

// ==================== 危险模式常量 ====================

/**
 * 预定义的危险模式列表 - 简化为2级
 * 用于检测 AI 输出中的潜在风险
 */
export const DANGEROUS_PATTERNS: Array<{
  pattern: RegExp;
  type: TrustIssue['type'];
  level: TrustLevel;
  description: string;
}> = [
  // 破坏性操作 - 需要确认
  { pattern: /rm\s+-rf/, type: 'destructive', level: TrustLevel.RequireConfirmation, description: '递归强制删除' },
  { pattern: /DROP\s+TABLE/i, type: 'destructive', level: TrustLevel.RequireConfirmation, description: '删除数据库表' },
  { pattern: /FORMAT\s+/i, type: 'destructive', level: TrustLevel.RequireConfirmation, description: '格式化操作' },

  // 敏感信息 - 需要确认
  { pattern: /password\s*[:=]\s*['"][^'"]+['"]|密码\s*[:=]\s*['"][^'"]+['"]|passwd\s*[:=]/i, type: 'sensitive', level: TrustLevel.RequireConfirmation, description: '密码硬编码' },
  { pattern: /api[_-]?key\s*[:=]\s*['"][^'"]+['"]|secret[_-]?key\s*[:=]\s*['"][^'"]+['"]/i, type: 'sensitive', level: TrustLevel.RequireConfirmation, description: 'API Key 硬编码' },

  // 危险操作 - 需要确认
  { pattern: /sudo\s+/, type: 'dangerous', level: TrustLevel.RequireConfirmation, description: '需要管理员权限' },
  { pattern: /chmod\s+777/, type: 'dangerous', level: TrustLevel.RequireConfirmation, description: '开放所有权限' },
  { pattern: /curl.*\|\s*(bash|sh)/i, type: 'dangerous', level: TrustLevel.RequireConfirmation, description: '远程脚本执行' },

  // 不确定性表述 - 自动执行
  { pattern: /我(不)?确定|我(不)?清楚|我猜测|我估计|我不(太)?知道/i, type: 'uncertainty', level: TrustLevel.AutoExecute, description: 'AI 自身不确定性表述' },

  // 幻觉 / 知识边界 - 自动执行
  { pattern: /我(不)?知道|没有足够信息|无法确认/i, type: 'hallucination', level: TrustLevel.AutoExecute, description: '知识边界表述' },
];

// ==================== 信任级别工具 ====================

/**
 * 信任级别的数值权重，用于比较
 */
export const TRUST_LEVEL_WEIGHT: Record<TrustLevel, number> = {
  [TrustLevel.AutoExecute]: 0,
  [TrustLevel.RequireConfirmation]: 1,
};

/**
 * 信任级别的中文标签
 */
export const TRUST_LEVEL_LABEL: Record<TrustLevel, string> = {
  [TrustLevel.AutoExecute]: '自动执行',
  [TrustLevel.RequireConfirmation]: '需要确认',
};

/**
 * 信任级别的 chalk 颜色样式
 */
export const TRUST_LEVEL_STYLE: Record<TrustLevel, (text: string) => string> = {
  [TrustLevel.AutoExecute]: chalk.green,
  [TrustLevel.RequireConfirmation]: chalk.yellow,
};

/**
 * 问题类型的中文标签
 */
export const ISSUE_TYPE_LABEL: Record<TrustIssue['type'], string> = {
  hallucination: '幻觉',
  uncertainty: '不确定性',
  dangerous: '危险操作',
  destructive: '破坏性操作',
  sensitive: '敏感信息',
};

/**
 * 问题类型对应的建议处理方式
 */
export const ISSUE_TYPE_SUGGESTION: Record<TrustIssue['type'], string> = {
  hallucination: '建议核实信息的准确性，不要直接采用未经验证的内容',
  uncertainty: '建议进一步确认后再执行，或向用户说明不确定性',
  dangerous: '建议仔细审查命令参数，确认安全后再执行',
  destructive: '强烈建议备份相关数据，确认无误后再执行',
  sensitive: '建议使用环境变量或密钥管理工具存储敏感信息，避免明文暴露',
};
