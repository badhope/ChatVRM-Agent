/**
 * error-handler.ts - 智能报错系统
 *
 * 提供友好的错误提示、解决方案建议、错误分类等功能
 */

import chalk from 'chalk';
import { printFancyCard, printFancyDivider, ICONS } from './visual-enhanced.js';

// ==================== 错误分类 ====================
export type ErrorType =
  | 'network'
  | 'authentication'
  | 'permission'
  | 'file_system'
  | 'configuration'
  | 'api'
  | 'validation'
  | 'unknown';

// ==================== 错误模式匹配 ====================
interface ErrorPattern {
  type: ErrorType;
  patterns: RegExp[];
  title: string;
  suggestions: string[];
}

const ERROR_PATTERNS: ErrorPattern[] = [
  {
    type: 'authentication',
    patterns: [/401|unauthorized|invalid.*key|api.*key|auth/i],
    title: '🔐 认证问题',
    suggestions: [
      '检查您的 API 密钥是否正确配置',
      '运行 "personal-assistant config set-key <provider>" 来设置密钥',
      '确认密钥是否已过期或被撤销',
    ],
  },
  {
    type: 'network',
    patterns: [/network|timeout|connection|offline|dns|econnrefused|enetunreach/i],
    title: '🌐 网络问题',
    suggestions: [
      '检查您的网络连接是否正常',
      '尝试访问其他网站确认网络状态',
      '如果使用代理，请检查代理配置',
      '稍后重试，可能是临时网络问题',
    ],
  },
  {
    type: 'permission',
    patterns: [/permission|denied|access.*denied|forbidden|403/i],
    title: '🛡️ 权限问题',
    suggestions: [
      '检查您是否有足够的权限访问该资源',
      '尝试使用管理员权限运行',
      '检查文件/文件夹的读写权限',
    ],
  },
  {
    type: 'file_system',
    patterns: [/file not found|enoent|not.*exist|file.*exist|is a directory/i],
    title: '📁 文件系统问题',
    suggestions: [
      '检查文件路径是否正确',
      '确认文件或文件夹是否存在',
      '检查文件名的大小写是否正确',
      '查看当前工作目录是否正确',
    ],
  },
  {
    type: 'configuration',
    patterns: [/config|configuration|invalid.*config|missing.*config/i],
    title: '⚙️ 配置问题',
    suggestions: [
      '运行 "personal-assistant config status" 检查配置状态',
      '检查您的配置文件格式是否正确',
      '尝试重新设置配置',
    ],
  },
  {
    type: 'api',
    patterns: [/api.*error|server.*error|500|502|503|rate.*limit|quota/i],
    title: '🤖 API 问题',
    suggestions: [
      '稍后重试，可能是服务端暂时问题',
      '检查您的 API 配额是否已用完',
      '尝试使用其他 API 平台',
      '降低请求频率',
    ],
  },
  {
    type: 'validation',
    patterns: [/validation|invalid.*parameter|bad.*request|400/i],
    title: '✏️ 参数验证问题',
    suggestions: [
      '检查您输入的参数是否正确',
      '查看帮助文档了解正确的参数格式',
      '确认所有必填参数都已提供',
    ],
  },
];

// ==================== 错误上下文 ====================
export interface ErrorContext {
  action?: string;
  file?: string;
  provider?: string;
  command?: string;
  additionalInfo?: Record<string, unknown>;
}

// ==================== 智能错误处理 ====================

/**
 * 分析错误类型
 */
export function analyzeError(error: Error | string): { type: ErrorType; title: string; suggestions: string[] } {
  const errorMessage = typeof error === 'string' ? error : error.message;

  for (const pattern of ERROR_PATTERNS) {
    for (const regex of pattern.patterns) {
      if (regex.test(errorMessage)) {
        return {
          type: pattern.type,
          title: pattern.title,
          suggestions: [...pattern.suggestions],
        };
      }
    }
  }

  return {
    type: 'unknown',
    title: '❓ 未知错误',
    suggestions: [
      '查看错误详情了解更多信息',
      '尝试重启应用',
      '如果问题持续，请报告 bug',
    ],
  };
}

/**
 * 显示友好的错误提示
 */
export function showFriendlyError(
  error: Error | string,
  context?: ErrorContext
): void {
  const errorMessage = typeof error === 'string' ? error : error.message;
  const analysis = analyzeError(error);

  // 显示炫酷的错误标题
  printFancyDivider('错误发生', 'magenta');

  // 显示错误卡片
  const content = [
    chalk.red.bold(errorMessage),
    '',
    chalk.gray('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'),
    chalk.yellow.bold('💡 可能的解决方案:'),
    ...analysis.suggestions.map((s, i) => chalk.gray(`  ${i + 1}. ${s}`)),
  ];

  printFancyCard(analysis.title, content, ICONS.error);

  // 如果有上下文信息，显示额外信息
  if (context) {
    printFancyDivider('上下文信息', 'yellow');
    const contextInfo: string[] = [];
    if (context.action) contextInfo.push(chalk.white(`操作: ${context.action}`));
    if (context.file) contextInfo.push(chalk.white(`文件: ${context.file}`));
    if (context.provider) contextInfo.push(chalk.white(`平台: ${context.provider}`));
    if (context.command) contextInfo.push(chalk.white(`命令: ${context.command}`));

    if (contextInfo.length > 0) {
      contextInfo.forEach(line => console.log(`  ${line}`));
    }
    console.log('');
  }

  // 显示帮助提示
  console.log(chalk.gray('  💡 提示: 输入 "help" 或 "?" 查看帮助文档\n'));
}

/**
 * 显示操作成功的庆祝效果
 */
export function showSuccessCelebration(message: string, details?: string[]): void {
  console.log('');
  console.log(chalk.green.bold(`  ${ICONS.confetti} ${ICONS.star} ${ICONS.success} 操作成功! ${ICONS.success} ${ICONS.star} ${ICONS.confetti}`));
  console.log(chalk.green(`  ${message}`));

  if (details && details.length > 0) {
    console.log('');
    details.forEach(d => console.log(chalk.gray(`  ✔ ${d}`)));
  }

  console.log('');
}

/**
 * 显示警告提示
 */
export function showWarningNotice(
  message: string,
  consequences?: string[],
  actions?: string[]
): void {
  printFancyDivider('⚠️ 警告', 'yellow');

  console.log(chalk.yellow.bold(`  ${message}`));
  console.log('');

  if (consequences && consequences.length > 0) {
    console.log(chalk.yellow('  可能的影响:'));
    consequences.forEach(c => console.log(chalk.gray(`  • ${c}`)));
    console.log('');
  }

  if (actions && actions.length > 0) {
    console.log(chalk.green('  建议操作:'));
    actions.forEach(a => console.log(chalk.gray(`  • ${a}`)));
    console.log('');
  }
}

/**
 * 显示操作进度提示
 */
export function showOperationProgress(
  operation: string,
  current: number,
  total: number,
  details?: string
): void {
  const percent = Math.round((current / total) * 100);
  const progress = Math.floor(percent / 5);
  const bar = '█'.repeat(progress) + '░'.repeat(20 - progress);

  let output = chalk.cyan(`\r  ${ICONS.rocket} ${operation}: `);
  output += chalk.green(`[${bar}] `);
  output += chalk.bold(`${percent}%`);
  output += chalk.gray(` (${current}/${total})`);

  if (details) {
    output += chalk.gray(` - ${details}`);
  }

  process.stdout.write(output);
}

/**
 * 显示操作完成提示
 */
export function showOperationComplete(
  operation: string,
  duration?: number,
  stats?: Record<string, number>
): void {
  console.log('');
  console.log(chalk.green.bold(`\n  ${ICONS.success} ${operation} 完成!`));

  if (duration) {
    console.log(chalk.gray(`  ⏱️ 耗时: ${duration.toFixed(2)}秒`));
  }

  if (stats) {
    console.log('');
    Object.entries(stats).forEach(([key, value]) => {
      console.log(chalk.cyan(`  • ${key}: ${value}`));
    });
  }

  console.log('');
}

/**
 * 创建错误报告
 */
export function createErrorReport(error: Error, context?: ErrorContext): string {
  const report: string[] = [];

  report.push('='.repeat(60));
  report.push('PERSONAL ASSISTANT ERROR REPORT');
  report.push('='.repeat(60));
  report.push(`Time: ${new Date().toISOString()}`);
  report.push(`Version: 1.0.0`);
  report.push('');

  if (context) {
    report.push('Context:');
    if (context.action) report.push(`  Action: ${context.action}`);
    if (context.file) report.push(`  File: ${context.file}`);
    if (context.provider) report.push(`  Provider: ${context.provider}`);
    if (context.command) report.push(`  Command: ${context.command}`);
    report.push('');
  }

  report.push('Error Details:');
  report.push(`  Message: ${error.message}`);
  report.push(`  Stack:`);

  if (error.stack) {
    error.stack.split('\n').forEach(line => {
      report.push(`    ${line}`);
    });
  }

  report.push('='.repeat(60));
  return report.join('\n');
}
