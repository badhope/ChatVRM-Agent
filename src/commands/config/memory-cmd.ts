import { Command } from 'commander';
import inquirer from 'inquirer';
import chalk from 'chalk';
import { configManager } from '../../config/manager.js';
import { printHeader, printSection, printSuccess, printError } from '../../ui/logo.js';
import { printKeyValue } from '../../ui/display.js';

export const memoryConfigCommand = new Command('memory')
  .description('记忆系统参数设置');

// 设置记忆参数
memoryConfigCommand
  .command('set-memory')
  .description('设置记忆系统参数')
  .option('--enabled', '总开关：是否记录对话记忆')
  .option('--auto-recall', '是否自动召回记忆注入对话上下文')
  .option('--rag', '启用 RAG 向量检索（消耗 embedding API 额度）')
  .option('--graph', '启用记忆图谱')
  .option('--knowledge', '启用知识图谱自动提取')
  .option('--max <n>', '最大记忆条数')
  .action(async (options: {
    enabled?: string; autoRecall?: string; rag?: string;
    graph?: string; knowledge?: string; max?: string;
  }) => {
    await configManager.init();
    const current = configManager.getMemoryConfig();

    const hasCliArgs = options.enabled || options.autoRecall || options.rag ||
                       options.graph || options.knowledge || options.max;

    if (hasCliArgs) {
      const updates: Record<string, any> = {};
      if (options.enabled !== undefined) updates.enabled = options.enabled === 'true';
      if (options.autoRecall !== undefined) updates.autoRecall = options.autoRecall === 'true';
      if (options.rag !== undefined) updates.ragEnabled = options.rag === 'true';
      if (options.graph !== undefined) updates.graphEnabled = options.graph === 'true';
      if (options.knowledge !== undefined) updates.knowledgeEnabled = options.knowledge === 'true';
      if (options.max !== undefined) updates.maxMemories = parseInt(options.max, 10) || 10000;

      await configManager.updateMemoryConfig(updates);
      printSuccess('记忆参数已更新');

      const updated = configManager.getMemoryConfig();
      console.log(chalk.gray(`  记忆总开关: ${updated.enabled ? '✓ 开启' : '✗ 关闭'}`));
      console.log(chalk.gray(`  自动召回: ${updated.autoRecall ? '✓ 开启' : '✗ 关闭'}`));
      console.log(chalk.gray(`  RAG 向量检索: ${updated.ragEnabled ? '⚠ 开启（消耗额度）' : '✗ 关闭'}`));
      console.log(chalk.gray(`  记忆图谱: ${updated.graphEnabled ? '✓ 开启' : '✗ 关闭'}`));
      console.log(chalk.gray(`  知识图谱: ${updated.knowledgeEnabled ? '✓ 开启' : '✗ 关闭'}`));
      console.log(chalk.gray(`  最大记忆条数: ${updated.maxMemories}`));
      return;
    }

    // 交互式模式
    if (!process.stdin.isTTY) {
      printError('非交互模式请使用 --enabled/--rag 等参数');
      return;
    }

    printHeader();
    printSection('设置记忆参数');

    const answers = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'enabled',
        message: '启用对话记忆（记住每次对话）:',
        default: current.enabled,
      },
      {
        type: 'confirm',
        name: 'autoRecall',
        message: '自动召回记忆（对话时注入相关记忆上下文）:',
        default: current.autoRecall,
        when: (a: { enabled: boolean }) => a.enabled,
      },
      {
        type: 'confirm',
        name: 'ragEnabled',
        message: '启用 RAG 向量检索（⚠ 消耗 embedding API 额度）:',
        default: current.ragEnabled,
      },
      {
        type: 'confirm',
        name: 'graphEnabled',
        message: '启用记忆图谱（关联记忆节点）:',
        default: current.graphEnabled,
      },
      {
        type: 'confirm',
        name: 'knowledgeEnabled',
        message: '启用知识图谱（自动提取实体和关系）:',
        default: current.knowledgeEnabled,
      },
      {
        type: 'number',
        name: 'maxMemories',
        message: '最大记忆条数:',
        default: current.maxMemories,
        validate: (input: number) => input > 0 || '必须大于0',
      },
    ]);

    await configManager.updateMemoryConfig(answers);
    printSuccess('记忆参数已更新');
  });

// 查看记忆参数
memoryConfigCommand
  .command('get-memory')
  .description('查看当前记忆参数')
  .action(async () => {
    await configManager.init();
    const mc = configManager.getMemoryConfig();

    printSection('记忆系统配置');
    printKeyValue([
      { key: '记忆总开关', value: mc.enabled ? '✓ 开启' : '✗ 关闭', highlight: mc.enabled },
      { key: '自动召回', value: mc.autoRecall ? '✓ 开启' : '✗ 关闭', highlight: mc.autoRecall },
      { key: 'RAG 向量检索', value: mc.ragEnabled ? '⚠ 开启（消耗额度）' : '✗ 关闭', highlight: false },
      { key: '记忆图谱', value: mc.graphEnabled ? '✓ 开启' : '✗ 关闭', highlight: mc.graphEnabled },
      { key: '知识图谱', value: mc.knowledgeEnabled ? '✓ 开启' : '✗ 关闭', highlight: mc.knowledgeEnabled },
      { key: '最大记忆条数', value: String(mc.maxMemories) },
    ]);
    console.log();
  });
