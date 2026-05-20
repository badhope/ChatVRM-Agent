import { Command, Argument } from 'commander';
import chalk from 'chalk';
import { printHeader, printSection, printSuccess, printError, printInfo } from '../../ui/logo.js';
import { printKeyValue, printTable } from '../../ui/display.js';
import { assessRisk, ChangeControlManager, RISK_RULES, backupFile, rollback } from '../../agent/change-control.js';
import type { ChangeAction } from '../../agent/risk-rules.js';

export const agentRiskCommand = new Command('risk')
  .description('风险评估与变更控制');

// devflow agent risk <action> <target> - 风险评估
agentRiskCommand
  .command('risk')
  .description('风险评估 - 评估文件操作的风险等级')
  .addArgument(new Argument('<action>', '操作类型').choices(['read', 'create', 'modify', 'delete', 'shell']))
  .argument('<target>', '目标文件路径或命令')
  .action((action: string, target: string) => {
    printHeader();
    printSection('>> 风险评估');

    const validActions = ['read', 'create', 'modify', 'delete', 'shell'];
    if (!validActions.includes(action)) {
      printError(`无效操作类型: ${action}，支持: ${validActions.join(', ')}`);
      return;
    }

    const result = assessRisk(action as ChangeAction, target);

    const riskIcon = result.risk === 'critical' ? chalk.red('[X]') :
                  result.risk === 'high' ? chalk.red('[!]') :
                  result.risk === 'medium' ? chalk.yellow('[!]') :
                  result.risk === 'low' ? chalk.green('[o]') :
                  chalk.gray('[o]');
    const riskLabel = { negligible: '可忽略', low: '低', medium: '中', high: '高', critical: '危险' }[result.risk];

    printKeyValue([
      { key: '操作', value: `${action} → ${target}`, highlight: true },
      { key: '风险等级', value: `${riskIcon} ${riskLabel}（${result.risk}）`, highlight: result.risk === 'critical' || result.risk === 'high' },
      { key: '匹配规则', value: `${result.rules.length} 条` },
      { key: '需要备份', value: result.risk === 'high' || result.risk === 'critical' ? '⚠ 是' : '否' },
      { key: '需要确认', value: result.risk !== 'negligible' && result.risk !== 'low' ? '⚠ 是' : '否' },
    ]);

    if (result.rules.length > 0) {
      console.log(chalk.gray('\n  匹配规则:'));
      result.rules.forEach(r => console.log(chalk.gray(`    • ${r}`)));
    }
    console.log();
  });

// devflow agent risk-rules - 查看风险规则
agentRiskCommand
  .command('risk-rules')
  .description('查看所有风险评估规则')
  .action(() => {
    printHeader();
    printSection('>> 风险评估规则');

    const head = ['操作类型', '风险', '模式', '原因'];
    const rows = RISK_RULES.map(r => [
      r.action.join(', '),
      r.risk,
      r.pattern.source.slice(0, 35),
      r.reason,
    ]);

    printTable({ title: `${RISK_RULES.length} 条风险规则`, head, rows });
    console.log();
  });

// devflow agent changes - 变更历史
agentRiskCommand
  .command('changes')
  .description('查看变更控制历史')
  .option('-s, --stats', '显示统计信息', false)
  .action((options: { stats: boolean }) => {
    printHeader();
    printSection('>> 变更控制历史');

    const manager = new ChangeControlManager();
    const history = manager.getHistory();

    if (history.length === 0) {
      printInfo('暂无变更记录');
      console.log();
      return;
    }

    if (options.stats) {
      const stats = manager.getStats();
      printKeyValue([
        { key: '总变更数', value: String(stats.total) },
        { key: '可忽略', value: String(stats.byRisk.negligible) },
        { key: '低风险', value: String(stats.byRisk.low) },
        { key: '中风险', value: String(stats.byRisk.medium) },
        { key: '高风险', value: String(stats.byRisk.high) },
        { key: '危险', value: String(stats.byRisk.critical) },
      ]);
      console.log();
      return;
    }

    const head = ['操作', '目标', '风险', '已备份', '已批准', '时间'];
    const rows = history.slice(-20).reverse().map(r => [
      r.action,
      r.target.length > 40 ? r.target.slice(0, 37) + '...' : r.target,
      r.risk,
      r.backedUp ? '✓' : '✗',
      r.approved ? '✓' : '✗',
      new Date(r.timestamp).toLocaleString('zh-CN'),
    ]);

    printTable({ title: `最近 ${rows.length} 条变更`, head, rows });
    console.log();
  });

// devflow agent backup <文件> - 手动备份文件
agentRiskCommand
  .command('backup')
  .description('手动备份文件')
  .argument('<filePath>', '要备份的文件路径')
  .action(async (filePath: string) => {
    printHeader();
    printSection('> 文件备份');

    const result = await backupFile(filePath);
    if (result.success) {
      printSuccess(`备份成功: ${result.backupPath}`);
    } else {
      printError(`备份失败: ${result.error}`);
    }
    console.log();
  });

// devflow agent rollback <记录ID> - 回滚变更
agentRiskCommand
  .command('rollback')
  .description('回滚变更（恢复到修改前的状态）')
  .argument('<id>', '变更记录 ID')
  .action(async (id: string) => {
    printHeader();
    printSection('↩️ 回滚变更');

    const manager = new ChangeControlManager();
    const record = manager.getHistory().find(r => r.id === id);

    if (!record) {
      printError(`找不到变更记录: ${id}`);
      console.log(chalk.gray('  提示: 使用 devflow agent changes 查看变更历史'));
      console.log();
      return;
    }

    const result = await rollback(record);
    if (result.success) {
      printSuccess(`回滚成功: ${record.target}`);
    } else {
      printError(`回滚失败: ${result.error}`);
    }
    console.log();
  });
