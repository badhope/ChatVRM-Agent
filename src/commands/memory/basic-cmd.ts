import { Command } from 'commander';
import chalk from 'chalk';
import { memoryManager } from '../../memory/manager.js';
import { printHeader, printSection, printSuccess, printError, printInfo, createSpinner } from '../../ui/logo.js';

export const memoryBasicCommand = new Command('basic')
  .description('基础记忆操作');

// 查看最近记忆
memoryBasicCommand
  .command('recent')
  .alias('r')
  .description('查看最近的对话记忆')
  .option('-l, --limit <n>', '显示数量', '10')
  .action(async (options: { limit: string }) => {
    const limit = parseInt(options.limit, 10) || 10;
    const spinner = createSpinner('加载记忆...');
    const recent = await memoryManager.getRecent(limit);
    if (spinner) spinner.stop();

    if (recent.length === 0) {
      printInfo('暂无对话记忆');
      printInfo('使用 devflow chat ask 开始对话后，记忆会自动保存');
      return;
    }

    printHeader();
    printSection(`最近 ${recent.length} 条记忆`);

    recent.forEach((r, i) => {
      const input = r.input || '';
      const output = r.output || '';
      console.log(chalk.gray(`  ${i + 1}. ${r.time}  [${r.skill}]`));
      console.log(chalk.cyan(`   问: ${input.slice(0, 60)}${input.length > 60 ? '...' : ''}`));
      console.log(chalk.green(`   答: ${output.slice(0, 80)}${output.length > 80 ? '...' : ''}`));
      console.log();
    });
  });

// 搜索记忆
memoryBasicCommand
  .command('search')
  .alias('find')
  .alias('s')
  .description('按关键词搜索记忆')
  .argument('<keyword>', '搜索关键词')
  .option('-l, --limit <n>', '显示数量', '10')
  .action(async (keyword: string, options: { limit: string }) => {
    const limit = parseInt(options.limit, 10) || 10;
    const spinner = createSpinner('搜索记忆...');
    const results = await memoryManager.recall(keyword, limit);
    if (spinner) spinner.stop();

    if (results.length === 0) {
      printError(`未找到包含 "${keyword}" 的记忆`);
      return;
    }

    printHeader();
    printSection(`搜索 "${keyword}" (${results.length} 条结果)`);

    results.forEach((r, i) => {
      const time = new Date(r.interaction.timestamp).toLocaleString('zh-CN');
      console.log(chalk.gray(`  ${i + 1}. ${time}  相关度: ${chalk.yellow(r.relevance.toFixed(2))}  [${r.interaction.skillUsed}]`));
      console.log(chalk.cyan(`   问: ${(r.interaction.input || '').slice(0, 60)}`));
      console.log(chalk.green(`   答: ${(r.interaction.output || '').slice(0, 80)}`));
      console.log();
    });
  });

// 记忆统计
memoryBasicCommand
  .command('stats')
  .description('查看记忆统计')
  .action(async () => {
    const spinner = createSpinner('统计中...');
    const stats = await memoryManager.getStats();
    if (spinner) spinner.stop();

    printHeader();
    printSection('记忆统计');

    console.log(`  总交互数: ${chalk.bold(String(stats.totalInteractions))}`);
    console.log(`  任务数: ${chalk.bold(String(stats.uniqueTasks))}`);
    console.log(`  今日交互: ${chalk.bold(String(stats.interactionsToday || 0))}`);
    console.log(`  昨日交互: ${chalk.bold(String(stats.interactionsYesterday || 0))}`);
    console.log(`  索引词数: ${chalk.bold(String(stats.indexSize || 0))}`);

    if (stats.skillUsage && Object.keys(stats.skillUsage).length > 0) {
      console.log(chalk.gray('\n  技能使用频率:'));
      const sorted = Object.entries(stats.skillUsage).sort((a, b) => (b[1] as number) - (a[1] as number));
      sorted.forEach(([skill, count]) => {
        console.log(`    ${chalk.cyan(skill.padEnd(30))} ${count} 次`);
      });
    }

    if (stats.skillsUsed && Array.isArray(stats.skillsUsed) && stats.skillsUsed.length > 0) {
      console.log(chalk.gray('\n  使用过的技能:'));
      (stats.skillsUsed as string[]).forEach((s: string) => console.log(`    ${chalk.cyan(s)}`));
    }

    console.log();
  });

// 清空记忆
memoryBasicCommand
  .command('clear')
  .description('清空所有记忆')
  .option('-f, --force', '强制清空，不询问确认', false)
  .action(async (options: { force: boolean }) => {
    if (!options.force && process.stdin.isTTY) {
      const inquirer = await import('inquirer');
      const { confirm } = await inquirer.default.prompt([{
        type: 'confirm',
        name: 'confirm',
        message: '确定要清空所有记忆吗？此操作不可恢复',
        default: false,
      }]);
      if (!confirm) return;
    }

    await memoryManager.clear();
    printSuccess('所有记忆已清空');
  });
