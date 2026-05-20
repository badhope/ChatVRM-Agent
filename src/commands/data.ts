import { Command } from 'commander';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { memoryManager } from '../memory/manager.js';
import { KnowledgeGraph } from '../memory/knowledgeGraph.js';
import { ragModule } from '../memory/rag.js';
import { backupManager } from '../cloud/backup.js';
import { configManager } from '../config/manager.js';
import { printSuccess, printError, printInfo, printWarning } from '../ui/logo.js';
import { getErrorMessage } from '../utils/error-handling.js';

const DATA_DIR = path.join(os.homedir(), '.devflow');

export const dataCommand = new Command('data')
  .description('数据管理（导出、导入、重置）');

dataCommand
  .command('export')
  .description('导出所有数据到 JSON 文件')
  .option('-o, --output <path>', '输出文件路径', './devflow-export.json')
  .action(async (opts) => {
    try {
      printInfo('正在导出数据...');
      const exportData: Record<string, any> = {
        version: '1.0',
        exportedAt: new Date().toISOString(),
      };

      // 导出配置
      await configManager.init();
      exportData.config = configManager.getAllConfig();

      // 导出记忆
      await memoryManager.init();
      const records = await memoryManager.loadAllRecords();
      exportData.memory = { conversations: records, count: records.length };

      // 导出知识图谱
      try {
        const kg = new KnowledgeGraph();
        await kg.init();
        exportData.knowledgeGraph = {
          entities: await kg.getAllEntities(),
          relationships: await kg.getAllRelationships(),
          stats: await kg.getStats(),
        };
      } catch (error) {
        // Skip knowledge graph export on error
      }

      // 导出统计
      exportData.memoryStats = await memoryManager.getStats();

      const content = JSON.stringify(exportData, null, 2);
      await fs.writeFile(opts.output, content, 'utf-8');
      printSuccess(`数据已导出到: ${opts.output} (${(Buffer.byteLength(content) / 1024).toFixed(1)} KB)`);
    } catch (error: unknown) {
      printError(`导出失败: ${getErrorMessage(error)}`);
    }
  });

dataCommand
  .command('import')
  .description('从 JSON 文件导入数据')
  .option('-i, --input <path>', '输入文件路径', './devflow-export.json')
  .option('--skip-memory', '跳过记忆导入')
  .action(async (opts) => {
    try {
      printInfo('正在导入数据...');
      const content = await fs.readFile(opts.input, 'utf-8');
      const data = JSON.parse(content);

      if (data.version !== '1.0') {
        printWarning('警告: 数据版本不匹配，可能存在兼容性问题');
      }

      // 导入记忆
      if (!opts.skipMemory && data.memory?.conversations) {
        let count = 0;
        for (const record of data.memory.conversations) {
          try {
            if (record.id && record.timestamp) {
              await memoryManager.rememberChat({
                input: record.input || '',
                output: record.output || '',
                provider: record.context?.provider || 'import',
                model: record.context?.model || 'import',
                taskId: record.taskId,
                tags: record.tags,
              });
              count++;
            }
          } catch (error) {
            // Skip invalid records
          }
        }
        printSuccess(`已导入 ${count} 条记忆记录`);
      }

      printSuccess('数据导入完成');
    } catch (error: unknown) {
      printError(`导入失败: ${getErrorMessage(error)}`);
    }
  });

dataCommand
  .command('reset')
  .description('重置所有数据（危险操作）')
  .option('--memory-only', '仅重置记忆数据')
  .option('--confirm <text>', '确认文本（需输入 "DELETE ALL DATA"）')
  .action(async (opts) => {
    if (opts.confirm !== 'DELETE ALL DATA') {
      printError('危险操作！请使用 --confirm "DELETE ALL DATA" 确认');
      process.exit(1);
    }

    try {
      if (opts.memoryOnly) {
        await memoryManager.clear();
        printSuccess('记忆数据已重置');
      } else {
        await memoryManager.clear();
        const kg = new KnowledgeGraph();
        await kg.init();
        await kg.clear();
        printSuccess('所有数据已重置（记忆 + 知识图谱）');
      }
      printInfo('配置数据未被删除，使用 devflow config reset 可重置配置');
    } catch (error: unknown) {
      printError(`重置失败: ${getErrorMessage(error)}`);
    }
  });
