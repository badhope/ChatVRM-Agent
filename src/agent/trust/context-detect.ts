/**
 * 上下文特定检测函数
 */

import { TrustLevel, TrustIssue, ISSUE_TYPE_SUGGESTION } from '../trust-types.js';

/**
 * Shell 上下文检测
 *
 * @param output - 输出文本
 * @returns 检测到的问题列表
 */
export function detectShellContext(output: string): TrustIssue[] {
  const issues: TrustIssue[] = [];
  const patterns = [
    { pattern: /:\s*\(\)\s*\{.*\}/, desc: '定义 fork 炸弹' },
    { pattern: />\s*\/etc\/passwd/, desc: '覆盖系统密码文件' },
    { pattern: />\s*\/etc\/shadow/, desc: '覆盖系统影子文件' },
  ];

  for (const { pattern, desc } of patterns) {
    if (pattern.test(output)) {
      issues.push({
        type: 'dangerous',
        level: TrustLevel.RequireConfirmation,
        description: desc,
        suggestion: ISSUE_TYPE_SUGGESTION['dangerous'],
      });
    }
  }

  return issues;
}

/**
 * 数据库上下文检测
 *
 * @param output - 输出文本
 * @returns 检测到的问题列表
 */
export function detectDatabaseContext(output: string): TrustIssue[] {
  const issues: TrustIssue[] = [];
  const patterns = [
    { pattern: /DELETE\s+FROM/i, desc: '执行删除操作' },
    { pattern: /UPDATE\s+\w+\s+SET/i, desc: '执行更新操作' },
    { pattern: /INSERT\s+INTO/i, desc: '执行插入操作' },
  ];

  for (const { pattern, desc } of patterns) {
    if (pattern.test(output)) {
      if (!issues.some(i => i.description === desc)) {
        issues.push({
          type: 'destructive',
          level: TrustLevel.RequireConfirmation,
          description: desc,
          suggestion: '建议确认 SQL 语句正确，并在测试环境验证',
        });
      }
    }
  }

  return issues;
}

/**
 * 文件上下文检测
 *
 * @param output - 输出文本
 * @returns 检测到的问题列表
 */
export function detectFileContext(output: string): TrustIssue[] {
  const issues: TrustIssue[] = [];
  const patterns = [
    { pattern: /\/etc\/(passwd|shadow|hosts|sudoers)/, desc: '修改系统关键配置文件' },
    { pattern: /\.env\b/, desc: '操作环境变量文件（可能包含敏感信息）' },
    { pattern: /\/usr\/bin\/|\/bin\//, desc: '修改系统可执行文件目录' },
    { pattern: /\.ssh\//, desc: '操作 SSH 配置目录' },
  ];

  for (const { pattern, desc } of patterns) {
    if (pattern.test(output)) {
      issues.push({
        type: 'dangerous',
        level: TrustLevel.RequireConfirmation,
        description: desc,
        suggestion: '建议确认文件路径正确，避免误操作系统关键文件',
      });
    }
  }

  return issues;
}

/**
 * 网络上下文检测
 *
 * @param output - 输出文本
 * @returns 检测到的问题列表
 */
export function detectNetworkContext(output: string): TrustIssue[] {
  const issues: TrustIssue[] = [];
  const patterns = [
    { pattern: /authorization\s*:\s*bearer\s+/i, desc: '暴露 Bearer Token' },
    { pattern: /x-api-key\s*:\s*['"][^'"]+['"]/i, desc: '暴露 API Key 在请求头' },
  ];

  for (const { pattern, desc } of patterns) {
    if (pattern.test(output)) {
      issues.push({
        type: 'sensitive',
        level: TrustLevel.RequireConfirmation,
        description: desc,
        suggestion: ISSUE_TYPE_SUGGESTION['sensitive'],
      });
    }
  }

  return issues;
}
