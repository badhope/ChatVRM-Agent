/**
 * 变更控制系统 - 审批工作流
 *
 * 提供变更审批相关功能：
 * 1. 风险摘要格式化
 * 2. 用户审批请求
 */

import chalk from 'chalk';
import inquirer from 'inquirer';

import type { ChangeRecord, ApprovalResult } from './types.js';
import type { RiskAssessmentResult } from './types.js';

import {
  RiskLevel,
  RISK_LEVEL_STYLE,
  RISK_LEVEL_LABEL,
} from '../risk-rules.js';

// ==================== 格式化函数 ====================

/**
 * 格式化风险摘要信息
 *
 * 生成格式化的风险评估摘要，用于在终端中展示。
 *
 * @param action - 操作类型
 * @param target - 操作目标
 * @param assessment - 风险评估结果
 * @param backupInfo - 备份信息（可选）
 * @returns 格式化的摘要文本
 */
export function formatRiskSummary(
  action: ChangeRecord['action'],
  target: string,
  assessment: RiskAssessmentResult,
  backupInfo?: { backedUp: boolean; backupPath?: string }
): string {
  const lines: string[] = [];

  lines.push(chalk.bold('═══════════════════════════════════════'));
  lines.push(chalk.bold('  变更控制 - 操作审批'));
  lines.push(chalk.bold('═══════════════════════════════════════'));
  lines.push('');
  lines.push(chalk.cyan('  操作类型: ') + chalk.white(action));
  lines.push(chalk.cyan('  操作目标: ') + chalk.white(target));
  lines.push(
    chalk.cyan('  风险等级: ') +
    RISK_LEVEL_STYLE[assessment.risk](`[${RISK_LEVEL_LABEL[assessment.risk]}]`)
  );
  lines.push(chalk.cyan('  风险原因: ') + chalk.white(assessment.reason));
  lines.push(chalk.cyan('  匹配规则: ') + chalk.white(assessment.rules.join('、')));

  if (backupInfo?.backedUp && backupInfo.backupPath) {
    lines.push(chalk.cyan('  备份状态: ') + chalk.green(`已备份 (${backupInfo.backupPath})`));
  }

  lines.push('');

  return lines.join('\n');
}

// ==================== 审批请求函数 ====================

/**
 * 请求用户审批
 *
 * 向用户展示风险摘要并请求确认。
 * 在非交互模式下默认拒绝操作。
 *
 * @param action - 操作类型
 * @param target - 操作目标
 * @param assessment - 风险评估结果
 * @param backupInfo - 备份信息（可选）
 * @returns 审批结果，包含是否批准和变更记录
 */
export async function requestApproval(
  action: ChangeRecord['action'],
  target: string,
  assessment: RiskAssessmentResult,
  record: ChangeRecord,
  backupInfo?: { backedUp: boolean; backupPath?: string }
): Promise<ApprovalResult> {
  // 显示风险摘要
  const summary = formatRiskSummary(action, target, assessment, backupInfo);
  console.log(summary);

  // 非交互模式下默认拒绝中高风险操作
  if (!process.stdin.isTTY) {
    console.log(chalk.yellow('[非交互模式] 检测到需要审批的操作，默认拒绝。'));
    console.log('');
    return { approved: false, record };
  }

  // 使用 inquirer 请求用户确认
  try {
    const { confirmed } = await inquirer.prompt([{
      type: 'confirm',
      name: 'confirmed',
      message: '是否批准执行以上操作？',
      default: false,
    }]);

    if (confirmed) {
      console.log(chalk.green('  操作已批准，继续执行。'));
    } else {
      console.log(chalk.yellow('  操作已拒绝。'));
    }
    console.log('');

    return { approved: confirmed, record };
  } catch {
    console.log(chalk.yellow('\n  用户中断，默认拒绝。'));
    console.log('');
    return { approved: false, record };
  }
}

/**
 * 检查是否为交互模式
 *
 * @returns 是否处于交互模式
 */
export function isInteractiveMode(): boolean {
  return process.stdin.isTTY === true;
}
