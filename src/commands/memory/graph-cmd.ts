import { Command } from 'commander';
import chalk from 'chalk';
import { memoryGraph } from '../../memory/memoryGraph.js';
import { printSection, printError, printInfo } from '../../ui/logo.js';

export const memoryGraphCommand = new Command('graph')
  .alias('g')
  .description('记忆图谱管理')
  .addCommand(
    new Command('search')
      .description('搜索记忆图谱节点')
      .argument('<query>', '搜索关键词')
      .action(async (query: string) => {
        const results = await memoryGraph.search(query, 10);
        if (results.length === 0) { printInfo('未找到匹配节点'); return; }
        printSection(`图谱搜索 "${query}" (${results.length} 个节点)`);
        results.forEach(n => {
          const typeLabel: Record<string, string> = { fact: '📋事实', experience: '📖经历', preference: '⭐偏好', relation: '🔗关系' };
          console.log(`  ${typeLabel[n.node.type] || n.node.type} ${chalk.cyan(n.node.content.slice(0, 60))}  重要性: ${chalk.yellow(n.node.importance.toFixed(2))}`);
        });
        console.log();
      })
  )
  .addCommand(
    new Command('related')
      .description('查看节点的关联节点')
      .argument('<id>', '节点ID（前几位即可）')
      .option('-d, --depth <n>', '遍历深度', '2')
      .action(async (id: string, options: { depth: string }) => {
        const depth = parseInt(options.depth, 10) || 2;
        const allNodes = await memoryGraph.getAllNodes();
        const node = allNodes.find(n => n.id.startsWith(id));
        if (!node) { printError(`未找到节点: ${id}`); return; }
        const related = await memoryGraph.getRelated(node.id, depth);
        printSection(`与 "${node.content.slice(0, 40)}" 相关的节点 (${related.length} 个, 深度 ${depth})`);
        related.forEach(r => {
          console.log(`  ${chalk.gray('→')} ${chalk.cyan(r.content.slice(0, 50))}  [${r.type}]`);
        });
        console.log();
      })
  )
  .addCommand(
    new Command('stats')
      .description('记忆图谱统计')
      .action(async () => {
        const stats = await memoryGraph.getStats();
        printSection('记忆图谱统计');
        console.log(`  节点总数: ${chalk.bold(String(stats.totalNodes))}`);
        console.log(`  边总数: ${chalk.bold(String(stats.totalEdges))}`);
        if (stats.nodesByType) {
          console.log(chalk.gray('\n  节点类型分布:'));
          Object.entries(stats.nodesByType).forEach(([type, count]) => {
            console.log(`    ${type.padEnd(15)} ${count}`);
          });
        }
        console.log();
      })
  );
