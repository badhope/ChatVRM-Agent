import { Command } from 'commander';
import chalk from 'chalk';
import { memoryManager } from '../../memory/manager.js';
import { MemoryReflector } from '../../memory/reflector.js';
import { printHeader, printSection, printInfo, createSpinner } from '../../ui/logo.js';

const reflector = new MemoryReflector(memoryManager);

export const memoryReflectCommand = new Command('reflect')
  .alias('think')
  .description('反思记忆，提炼高层次认知')
  .action(async () => {
    const spinner = createSpinner('正在反思记忆...');
    const report = await reflector.reflect();
    if (spinner) spinner.stop();

    printHeader();
    printSection(`记忆反思报告 (${new Date(report.createdAt).toLocaleString('zh-CN')})`);
    printInfo(`分析了 ${report.totalMemories} 条记忆，生成 ${report.insightsGenerated} 条洞察`);

    const insights = reflector.getInsights();
    if (insights.length === 0) {
      printInfo('暂无洞察（需要至少 3 条记忆）');
      return;
    }

    const typeLabels: Record<string, string> = {
      fact: '📋 事实', preference: '⭐ 偏好', pattern: '📊 模式', summary: '📝 摘要',
    };

    console.log();
    insights.slice(0, 15).forEach((insight, i) => {
      const label = typeLabels[insight.type] || insight.type;
      console.log(`  ${i + 1}. ${label} ${chalk.cyan(insight.content)}`);
      console.log(`     ${chalk.gray(`置信度: ${(insight.confidence * 100).toFixed(0)}% | 引用 ${insight.sourceIds.length} 条记忆`)}`);
      console.log();
    });
  });
