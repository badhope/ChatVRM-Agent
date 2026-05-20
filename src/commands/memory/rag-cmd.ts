import { Command } from 'commander';
import chalk from 'chalk';
import { ragModule } from '../../memory/rag.js';
import { memoryManager } from '../../memory/manager.js';
import { configManager } from '../../config/manager.js';
import { printSuccess, printError, printInfo, createSpinner, printSection } from '../../ui/logo.js';
import type { ProviderType } from '../../types.js';

export const memoryRagCommand = new Command('rag')
  .description('RAG 向量检索管理')
  .addCommand(
    new Command('init')
      .description('初始化 RAG（需要 API Key）')
      .option('-p, --provider <provider>', 'AI 平台', 'aliyun')
      .action(async (options: { provider: string }) => {
        await configManager.init();
        const providerConfig = configManager.getProviderConfig(options.provider as ProviderType);
        if (!providerConfig.apiKey) {
          printError(`请先配置 ${options.provider} 的 API Key`);
          return;
        }
        const spinner = createSpinner('初始化 RAG...');
        await ragModule.init(providerConfig.apiKey);
        if (spinner) spinner.stop();
        printSuccess('RAG 初始化完成');
      })
  )
  .addCommand(
    new Command('index')
      .description('将所有记忆索引到向量数据库')
      .action(async () => {
        await configManager.init();
        const providerConfig = configManager.getProviderConfig('aliyun' as ProviderType);
        if (!providerConfig.apiKey) { printError('请先配置 aliyun API Key'); return; }
        await ragModule.init(providerConfig.apiKey);

        const spinner = createSpinner('索引记忆到向量数据库...');
        const records = await memoryManager.loadAllRecords();
        let indexed = 0;
        for (const r of records) {
          const text = `用户: ${r.input || ''}\nAI: ${r.output || ''}`;
          const vector = await ragModule.embed(text);
          if (vector) {
            await ragModule.addDocument(r.id, text);
            indexed++;
          }
        }
        await ragModule.save();
        if (spinner) spinner.stop();
        printSuccess(`索引完成: ${indexed}/${records.length} 条记忆`);
      })
  )
  .addCommand(
    new Command('search')
      .description('语义搜索记忆')
      .argument('<query>', '搜索内容')
      .option('-k, --top <n>', '返回数量', '5')
      .action(async (query: string, options: { top: string }) => {
        const topK = parseInt(options.top, 10) || 5;
        // 自动初始化 RAG
        await configManager.init();
        const providerConfig = configManager.getProviderConfig('aliyun' as ProviderType);
        if (providerConfig.apiKey) {
          await ragModule.init(providerConfig.apiKey);
        }
        const results = await ragModule.search(query, topK);
        if (results.length === 0) { printInfo('未找到结果，请先运行 memory rag index'); return; }
        printSection(`语义搜索 "${query}"`);
        results.forEach((r, i) => {
          console.log(`  ${i + 1}. ${chalk.gray(`相似度: ${r.score.toFixed(4)}`)}`);
          console.log(`     ${r.text.slice(0, 100)}`);
          console.log();
        });
      })
  )
  .addCommand(
    new Command('stats')
      .description('RAG 统计')
      .action(async () => {
        const stats = await ragModule.getStats();
        printSection('RAG 统计');
        console.log(`  文档总数: ${chalk.bold(String(stats.totalDocuments))}`);
        console.log(`  有效向量: ${chalk.bold(String(stats.validVectors))}`);
        console.log(`  空向量: ${chalk.bold(String(stats.nullVectors))}`);
        console.log(`  向量维度: ${chalk.bold(String(stats.dimensions))}`);
        console.log();
      })
  );
