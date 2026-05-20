import { Command } from 'commander';
import chalk from 'chalk';
import { printHeader, printSection, printError, printInfo } from '../../ui/logo.js';
import { printTable, printKeyValue } from '../../ui/display.js';
import { detectIssues, generateTrustReport, formatTrustOutput, DANGEROUS_PATTERNS, TrustLevel } from '../../agent/trust.js';

export const agentTrustCommand = new Command('trust')
  .description('信任检查与规则');

// devflow agent trust <文本> - 信任检查
agentTrustCommand
  .command('trust')
  .description('信任检查 - 检测文本中的潜在风险')
  .argument('<text>', '要检查的文本')
  .option('-v, --verbose', '显示详细标注', false)
  .action((text: string, options: { verbose: boolean }) => {
    printHeader();
    printSection('>> 信任检查');

    const issues = detectIssues(text);
    const report = generateTrustReport(issues);

    printKeyValue([
      { key: '信任级别', value: report.level === TrustLevel.AutoExecute ? '自动执行' : '需要确认', highlight: report.level === TrustLevel.AutoExecute },
      { key: '发现问题', value: `${issues.length} 个` },
      { key: '需要确认', value: report.requiresConfirmation ? '⚠ 是' : '✓ 否' },
    ]);

    if (issues.length > 0) {
      printSection('问题详情');
      issues.forEach((issue, i) => {
        const levelIcon = issue.level === TrustLevel.RequireConfirmation ? chalk.yellow('[!]') : chalk.gray('[o]');
        console.log(`  ${levelIcon} ${i + 1}. [${issue.type}] ${issue.description}`);
        console.log(`     ${chalk.gray(issue.suggestion)}`);
      });
    }

    if (options.verbose && issues.length > 0) {
      printSection('标注输出');
      console.log(formatTrustOutput(text, issues));
    }

    console.log();
  });

// devflow agent trust-rules - 查看信任规则
agentTrustCommand
  .command('trust-rules')
  .description('查看所有信任检测规则')
  .action(() => {
    printHeader();
    printSection('>> 信任检测规则');

    const head = ['类型', '级别', '模式', '描述'];
    const rows = DANGEROUS_PATTERNS.map(p => [
      p.type,
      p.level === TrustLevel.RequireConfirmation ? '需确认' : '自动执行',
      p.pattern.source.slice(0, 30),
      p.description,
    ]);

    printTable({ title: `${DANGEROUS_PATTERNS.length} 条检测规则`, head, rows });
    console.log();
  });
