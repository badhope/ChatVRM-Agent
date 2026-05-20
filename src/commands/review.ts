import { Command } from 'commander';
import chalk from 'chalk';
import { analyzeCode, CodeAnalyzer } from '../review/analyzer.js';
import { printHeader, printSection, printSuccess, printError, printInfo, printWarning, createSpinner } from '../ui/logo.js';

const reviewCommand = new Command('review')
  .alias('r')
  .description('代码审查');

// 审查文件
reviewCommand
  .command('file')
  .alias('f')
  .description('审查单个文件')
  .argument('<filePath>', '文件路径')
  .option('-c, --category <categories>', '审查类别 (quality,bugs,performance,security)', 'quality,bugs,performance,security')
  .option('--no-ai', '不使用AI深度审查，仅规则检测')
  .action(async (filePath: string, options: { category: string; ai: boolean }) => {
    printHeader();
    printSection(`审查文件: ${filePath}`);

    const categories = options.category.split(',') as Array<'quality' | 'bugs' | 'performance' | 'security'>;

    const spinner = createSpinner('正在审查代码...');

    try {
      const result = await analyzeCode(filePath, { categories, useAi: options.ai });

      if (spinner) spinner.stop();
      printReviewResult(result);
    } catch (error) {
      if (spinner) spinner.stop();
      printError(`审查失败: ${error}`);
    }
  });

// 审查目录
reviewCommand
  .command('dir')
  .alias('d')
  .description('审查整个目录')
  .argument('<dirPath>', '目录路径')
  .option('-c, --category <categories>', '审查类别', 'quality,bugs,performance,security')
  .option('-i, --ignore <patterns>', '忽略的目录（逗号分隔）', 'node_modules,dist,.git,coverage')
  .option('--no-ai', '不使用AI深度审查，仅规则检测')
  .action(async (dirPath: string, options: { category: string; ignore: string; ai: boolean }) => {
    printHeader();
    printSection(`审查目录: ${dirPath}`);

    const categories = options.category.split(',') as Array<'quality' | 'bugs' | 'performance' | 'security'>;
    const ignorePatterns = options.ignore.split(',');

    const spinner = createSpinner('正在扫描目录...');

    try {
      const analyzer = new CodeAnalyzer();
      const results = await analyzer.analyzeDirectory(dirPath, { categories, ignorePatterns, useAi: options.ai });

      if (spinner) spinner.stop();

      if (results.length === 0) {
        printSuccess('没有发现问题！');
        return;
      }

      // 汇总统计
      let totalErrors = 0;
      let totalWarnings = 0;
      let totalInfos = 0;
      const totalFiles = results.length;

      for (const result of results) {
        totalErrors += result.summary.errors;
        totalWarnings += result.summary.warnings;
        totalInfos += result.summary.infos;
      }

      console.log(chalk.bold(`\n  📊 审查汇总\n`));
      console.log(`  ${chalk.red(`  ✗ ${totalErrors} 个错误`)}`);
      console.log(`  ${chalk.yellow(`  ⚠ ${totalWarnings} 个警告`)}`);
      console.log(`  ${chalk.blue(`  ℹ ${totalInfos} 个提示`)}`);
      console.log(`  ${chalk.gray(`  📁 ${totalFiles} 个文件`)}\n`);

      // 每个文件的详细结果
      for (const result of results) {
        console.log(chalk.bold(`  📄 ${result.filePath}`));
        console.log(chalk.gray(`  ${'─'.repeat(result.filePath.length + 4)}`));

        for (const issue of result.issues.slice(0, 5)) {
          const icon = issue.severity === 'error' ? chalk.red('✗') : issue.severity === 'warning' ? chalk.yellow('⚠') : chalk.blue('ℹ');
          const lineInfo = issue.line ? `:${issue.line}` : '';
          console.log(`  ${icon} [${issue.ruleId}] ${issue.message}${lineInfo}`);
          if (issue.suggestion) {
            console.log(`    ${chalk.gray('→ ' + issue.suggestion)}`);
          }
        }

        if (result.issues.length > 5) {
          console.log(chalk.gray(`  ... 还有 ${result.issues.length - 5} 个问题`));
        }
        console.log();
      }
    } catch (error) {
      if (spinner) spinner.stop();
      printError(`审查失败: ${error}`);
    }
  });

function printReviewResult(result: import('../review/types.js').ReviewResult): void {
  const { summary, metrics, issues, filePath } = result;

  console.log(chalk.bold(`\n  📊 审查结果: ${filePath}\n`));

  // 代码指标
  console.log(chalk.bold('  📏 代码指标:'));
  console.log(`     总行数: ${metrics.lines}`);
  console.log(`     代码行: ${metrics.codeLines}`);
  console.log(`     注释行: ${metrics.commentLines}`);
  console.log(`     空白行: ${metrics.blankLines}`);
  if (metrics.codeLines > 0) {
    const commentRatio = ((metrics.commentLines / metrics.codeLines) * 100).toFixed(1);
    console.log(`     注释率: ${commentRatio}%`);
  }

  // 问题统计
  console.log(chalk.bold('\n  🔍 问题统计:'));
  console.log(`     ${chalk.red(`✗ ${summary.errors} 个错误`)}`);
  console.log(`     ${chalk.yellow(`⚠ ${summary.warnings} 个警告`)}`);
  console.log(`     ${chalk.blue(`ℹ ${summary.infos} 个提示`)}`);

  // 详细问题列表
  if (issues.length > 0) {
    console.log(chalk.bold('\n  📋 问题列表:\n'));

    for (const issue of issues) {
      const icon = issue.severity === 'error' ? chalk.red('✗') : issue.severity === 'warning' ? chalk.yellow('⚠') : chalk.blue('ℹ');
      const categoryLabel = getCategoryLabel(issue.category);
      const lineInfo = issue.line ? chalk.gray(` (行 ${issue.line})`) : '';

      console.log(`  ${icon} [${chalk.bold(issue.ruleId)}] [${categoryLabel}] ${issue.message}${lineInfo}`);
      if (issue.suggestion) {
        console.log(`    ${chalk.green('→')} ${issue.suggestion}`);
      }
      if (issue.code) {
        console.log(`    ${chalk.gray('  ' + issue.code.slice(0, 80))}`);
      }
      console.log();
    }
  } else {
    console.log(chalk.green('\n  ✓ 没有发现问题，代码质量良好！\n'));
  }
}

function getCategoryLabel(category: string): string {
  const labels: Record<string, string> = {
    quality: chalk.cyan('质量'),
    bugs: chalk.red('Bug'),
    performance: chalk.yellow('性能'),
    security: chalk.magenta('安全'),
  };
  return labels[category] || category;
}

export { reviewCommand };
