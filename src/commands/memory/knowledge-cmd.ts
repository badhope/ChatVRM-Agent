import { Command } from 'commander';
import chalk from 'chalk';
import { knowledgeGraph } from '../../memory/knowledgeGraph.js';
import { memoryManager } from '../../memory/manager.js';
import { printSection, printSuccess, printError, printInfo, createSpinner } from '../../ui/logo.js';
import type { EntityType } from '../../memory/knowledge-graph/types.js';

export const memoryKnowledgeCommand = new Command('knowledge')
  .alias('k')
  .description('知识图谱管理')
  .addCommand(
    new Command('extract')
      .description('从记忆中自动提取知识')
      .action(async () => {
        const spinner = createSpinner('从记忆中提取知识...');
        const records = await memoryManager.loadAllRecords();
        const result = await knowledgeGraph.extractFromMemory(records);
        if (spinner) spinner.stop();
        printSuccess(`提取完成: ${result.entitiesAdded} 个实体, ${result.relationshipsAdded} 个关系`);
      })
  )
  .addCommand(
    new Command('query')
      .description('查询知识图谱')
      .option('-t, --type <type>', '实体类型 (person/tech/project/concept/skill)')
      .action(async (options: { type?: string }) => {
        const entities = await knowledgeGraph.query(options.type as EntityType);
        if (entities.length === 0) { printInfo('知识图谱为空，先运行 memory knowledge extract'); return; }
        printSection(`知识图谱 (${entities.length} 个实体)`);
        entities.forEach(e => {
          console.log(`  [${chalk.yellow(e.type)}] ${chalk.cyan(e.label)}`);
          if (e.attributes && Object.keys(e.attributes).length > 0) {
            Object.entries(e.attributes).forEach(([k, v]) => {
              console.log(`    ${chalk.gray(k)}: ${v}`);
            });
          }
        });
        console.log();
      })
  )
  .addCommand(
    new Command('path')
      .description('查找两个实体间的关系路径')
      .argument('<from>', '起始实体ID或标签')
      .argument('<to>', '目标实体ID或标签')
      .action(async (from: string, to: string) => {
        const allEntities = await knowledgeGraph.query();
        const fromEntity = allEntities.find(e => e.id.startsWith(from) || e.label.includes(from));
        const toEntity = allEntities.find(e => e.id.startsWith(to) || e.label.includes(to));
        if (!fromEntity) { printError(`未找到: ${from}`); return; }
        if (!toEntity) { printError(`未找到: ${to}`); return; }
        const paths = await knowledgeGraph.findPaths(fromEntity.id, toEntity.id, 3);
        if (paths.length === 0) { printInfo('未找到关联路径'); return; }
        printSection(`路径搜索: ${fromEntity.label} → ${toEntity.label} (${paths.length} 条路径)`);
        paths.forEach((p, i) => {
          console.log(`  路径 ${i + 1}: ${p.map(n => chalk.cyan(n.label)).join(' → ')}`);
        });
        console.log();
      })
  )
  .addCommand(
    new Command('stats')
      .description('知识图谱统计')
      .action(async () => {
        const stats = await knowledgeGraph.getStats();
        printSection('知识图谱统计');
        console.log(`  实体总数: ${chalk.bold(String(stats.entityCount))}`);
        console.log(`  关系总数: ${chalk.bold(String(stats.relationshipCount))}`);
        if (stats.entityByType) {
          console.log(chalk.gray('\n  实体类型分布:'));
          Object.entries(stats.entityByType).forEach(([type, count]) => {
            console.log(`    ${type.padEnd(15)} ${count}`);
          });
        }
        console.log();
      })
  );
