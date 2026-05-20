/**
 * 变更控制系统 - 风险规则与评估
 *
 * 提供操作风险评估能力，包括：
 * 1. 风险级别枚举
 * 2. 预定义的风险规则列表
 * 3. 风险级别工具常量
 * 4. 风险评估函数
 */

import chalk from 'chalk';

// ==================== 枚举 ====================

/**
 * 风险级别枚举
 * 从 NEGLIGIBLE 到 CRITICAL 递增，级别越高风险越大
 */
export enum RiskLevel {
  NEGLIGIBLE = 'negligible',   // 可忽略（读操作）
  LOW = 'low',                 // 低风险（创建新文件）
  MEDIUM = 'medium',           // 中风险（修改现有文件）
  HIGH = 'high',               // 高风险（修改配置文件/系统文件）
  CRITICAL = 'critical',       // 危险（删除文件/批量修改）
}

// ==================== 风险级别工具常量 ====================

/**
 * 风险级别的数值权重，用于比较和聚合
 */
export const RISK_LEVEL_WEIGHT: Record<RiskLevel, number> = {
  [RiskLevel.NEGLIGIBLE]: 0,
  [RiskLevel.LOW]: 1,
  [RiskLevel.MEDIUM]: 2,
  [RiskLevel.HIGH]: 3,
  [RiskLevel.CRITICAL]: 4,
};

/**
 * 风险级别的中文标签
 */
export const RISK_LEVEL_LABEL: Record<RiskLevel, string> = {
  [RiskLevel.NEGLIGIBLE]: '可忽略',
  [RiskLevel.LOW]: '低风险',
  [RiskLevel.MEDIUM]: '中风险',
  [RiskLevel.HIGH]: '高风险',
  [RiskLevel.CRITICAL]: '危险',
};

/**
 * 风险级别的 chalk 颜色样式
 */
export const RISK_LEVEL_STYLE: Record<RiskLevel, (text: string) => string> = {
  [RiskLevel.NEGLIGIBLE]: chalk.gray,
  [RiskLevel.LOW]: chalk.green,
  [RiskLevel.MEDIUM]: chalk.yellow,
  [RiskLevel.HIGH]: chalk.hex('#FFA500'),
  [RiskLevel.CRITICAL]: chalk.red.bold,
};

// ==================== 风险规则常量 ====================

/**
 * 预定义的风险规则列表
 *
 * 规则按优先级排列，后面的规则如果匹配到更高风险等级，会覆盖前面的结果。
 * 每条规则包含：
 * - pattern: 匹配目标路径或命令的正则表达式
 * - action: 适用的操作类型列表
 * - risk: 匹配时的风险等级
 * - reason: 风险原因说明
 */
export const RISK_RULES: Array<{
  pattern: RegExp;
  action: string[];
  risk: RiskLevel;
  reason: string;
}> = [
  // 读操作 - 可忽略
  { pattern: /.*/, action: ['read'], risk: RiskLevel.NEGLIGIBLE, reason: '读取操作无风险' },

  // 创建新文件 - 低风险
  { pattern: /.*/, action: ['create'], risk: RiskLevel.LOW, reason: '创建新文件' },

  // 修改操作 - 中风险（默认）
  { pattern: /.*/, action: ['modify'], risk: RiskLevel.MEDIUM, reason: '修改现有文件' },

  // 移动操作 - 中风险
  { pattern: /.*/, action: ['move'], risk: RiskLevel.MEDIUM, reason: '移动文件' },

  // 删除操作 - 危险
  { pattern: /.*/, action: ['delete'], risk: RiskLevel.CRITICAL, reason: '删除文件' },

  // 系统文件 - 高风险（修改或删除时）
  { pattern: /(\/etc\/|\/usr\/|\/bin\/|\/sbin\/|C:\\Windows|C:\\Program)/i, action: ['modify', 'delete'], risk: RiskLevel.CRITICAL, reason: '系统关键文件' },

  // 配置文件 - 高风险（修改或删除时）
  { pattern: /\.(json|yaml|yml|toml|ini|conf|cfg|env)$/i, action: ['modify', 'delete'], risk: RiskLevel.HIGH, reason: '配置文件修改' },

  // node_modules - 低风险（可恢复）
  { pattern: /node_modules/, action: ['modify', 'delete'], risk: RiskLevel.LOW, reason: '依赖目录，可恢复' },

  // .git 目录 - 高风险（修改或删除时）
  { pattern: /\.git/, action: ['modify', 'delete'], risk: RiskLevel.CRITICAL, reason: 'Git 版本控制目录' },

  // shell 命令 - 根据内容评估
  { pattern: /rm\s+-rf|del\s+\/s/i, action: ['shell'], risk: RiskLevel.CRITICAL, reason: '强制删除命令' },
  { pattern: /DROP\s+TABLE|TRUNCATE/i, action: ['shell'], risk: RiskLevel.CRITICAL, reason: '数据库破坏性命令' },
  { pattern: /sudo|admin/i, action: ['shell'], risk: RiskLevel.HIGH, reason: '需要管理员权限' },
  { pattern: /npm\s+install|yarn|pnpm/i, action: ['shell'], risk: RiskLevel.LOW, reason: '包安装命令' },
  { pattern: /npm\s+run|yarn\s+run/i, action: ['shell'], risk: RiskLevel.LOW, reason: '脚本运行命令' },
  { pattern: /git\s+(commit|push|merge|rebase)/i, action: ['shell'], risk: RiskLevel.MEDIUM, reason: 'Git 写操作' },
  { pattern: /docker\s+(build|run|push)/i, action: ['shell'], risk: RiskLevel.MEDIUM, reason: 'Docker 操作' },
];

// ==================== 风险评估函数 ====================

/**
 * 操作类型（用于风险评估函数签名）
 */
export type ChangeAction = 'read' | 'create' | 'modify' | 'delete' | 'move' | 'shell';

/**
 * 风险评估 - 根据操作类型和目标评估风险等级
 *
 * 遍历所有预定义的风险规则，找到匹配的规则并返回最高风险等级。
 * 支持多条规则同时匹配，最终取风险最高的结果。
 *
 * @param action - 操作类型（read/create/modify/delete/move/shell）
 * @param target - 操作目标（文件路径或 shell 命令）
 * @returns 风险评估结果，包含风险等级、原因和匹配的规则列表
 *
 * @example
 * ```typescript
 * const result = assessRisk('delete', '/etc/config.yaml');
 * // result.risk === RiskLevel.CRITICAL
 * // result.reason 包含 '删除文件' 和 '系统关键文件' 等原因
 * ```
 */
export function assessRisk(
  action: ChangeAction,
  target: string
): { risk: RiskLevel; reason: string; rules: string[] } {
  let maxRisk = RiskLevel.NEGLIGIBLE;
  const matchedRules: string[] = [];
  const reasons: string[] = [];

  for (const rule of RISK_RULES) {
    // 检查操作类型是否匹配
    if (!rule.action.includes(action)) {
      continue;
    }

    // 检查目标是否匹配正则
    if (!rule.pattern.test(target)) {
      continue;
    }

    // 记录匹配的规则
    matchedRules.push(rule.reason);
    reasons.push(rule.reason);

    // 取最高风险等级
    if (RISK_LEVEL_WEIGHT[rule.risk] > RISK_LEVEL_WEIGHT[maxRisk]) {
      maxRisk = rule.risk;
    }
  }

  // 如果没有匹配到任何规则，默认为中风险
  if (matchedRules.length === 0) {
    return {
      risk: RiskLevel.MEDIUM,
      reason: '未匹配到已知规则，默认中风险',
      rules: ['默认规则'],
    };
  }

  return {
    risk: maxRisk,
    reason: reasons.join('；'),
    rules: matchedRules,
  };
}
