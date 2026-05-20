import { Command } from 'commander';
import inquirer from 'inquirer';
import chalk from 'chalk';
import { configManager, SANDBOX_PERMISSIONS, type SandboxLevel } from '../../config/manager.js';
import { printHeader, printSection, printSuccess, printError, printWarning } from '../../ui/logo.js';
import { printTable, printKeyValue } from '../../ui/display.js';
import { formatBytes } from '../../utils/format.js';

export const sandboxConfigCommand = new Command('sandbox')
  .description('沙盒权限管理');

// 设置沙盒权限级别
sandboxConfigCommand
  .command('set-sandbox')
  .description('设置沙盒权限级别')
  .argument('[level]', '权限级别 (minimal|conservative|balanced|relaxed|extreme)')
  .action(async (level?: string) => {
    await configManager.init();

    if (level) {
      const validLevels: SandboxLevel[] = ['minimal', 'conservative', 'balanced', 'relaxed', 'extreme'];
      if (!validLevels.includes(level as SandboxLevel)) {
        printError(`无效的权限级别: ${level}`);
        console.log(chalk.gray(`  可选级别: ${validLevels.join(', ')}`));
        console.log(chalk.gray(`  使用 devflow config sandbox-levels 查看详细对比`));
        return;
      }

      await configManager.setSandboxLevel(level as SandboxLevel);
      const perms = SANDBOX_PERMISSIONS[level as SandboxLevel];
      printSuccess(`沙盒权限已设置为: ${level}`);
      console.log(chalk.gray(`  ${perms.description}`));
      return;
    }

    // 交互式选择
    if (!process.stdin.isTTY) {
      printError('非交互模式请指定级别: devflow config set-sandbox <level>');
      console.log(chalk.gray(`  可选级别: minimal, conservative, balanced, relaxed, extreme`));
      return;
    }

    const currentLevel = configManager.getSandboxConfig().level;

    printHeader();
    printSection('设置沙盒权限级别');

    console.log(chalk.gray('  ⚠️  警告: 更高级别的权限意味着更高的风险\n'));

    const choices = [
      {
        name: '🔒 极小权限 (minimal)',
        value: 'minimal',
        description: '仅允许读取操作，无法删除或修改文件',
      },
      {
        name: '🛡️ 保守权限 (conservative)',
        value: 'conservative',
        description: '允许基本文件操作，需要确认危险操作',
      },
      {
        name: '⚖️ 平衡权限 (balanced)',
        value: 'balanced',
        description: '允许常规开发操作，自动备份危险操作（推荐）',
      },
      {
        name: '🔓 宽松权限 (relaxed)',
        value: 'relaxed',
        description: '允许更多操作，信任用户判断',
      },
      {
        name: '⚡ 极端权限 (extreme)',
        value: 'extreme',
        description: '几乎无限制，谨慎使用',
      },
    ];

    const answers = await inquirer.prompt([{
      type: 'list',
      name: 'level',
      message: '选择沙盒权限级别:',
      default: currentLevel,
      choices,
    }]);

    await configManager.setSandboxLevel(answers.level as SandboxLevel);
    const perms = SANDBOX_PERMISSIONS[answers.level as SandboxLevel];
    printSuccess(`沙盒权限已设置为: ${answers.level}`);
    console.log(chalk.gray(`  ${perms.description}`));

    // 如果选择了宽松或极端权限，显示警告
    if (answers.level === 'relaxed' || answers.level === 'extreme') {
      console.log();
      printWarning('⚠️  已选择较高权限级别，请确保您信任正在执行的操作');
      console.log(chalk.gray('  建议仅在必要时使用，并在完成后恢复为平衡权限'));
    }
  });

// 查看沙盒权限级别详细信息
sandboxConfigCommand
  .command('sandbox-levels')
  .alias('sandbox-info')
  .description('查看所有沙盒权限级别的详细信息')
  .action(async () => {
    await configManager.init();
    const currentLevel = configManager.getSandboxConfig().level;

    printHeader();
    printSection('沙盒权限级别对比');

    const levels: SandboxLevel[] = ['minimal', 'conservative', 'balanced', 'relaxed', 'extreme'];
    const head = ['级别', '删除', '系统修改', '网络', '执行', '风险'];
    const rows = levels.map(level => {
      const perms = SANDBOX_PERMISSIONS[level];
      const riskLabel = {
        minimal: chalk.green('极低'),
        conservative: chalk.green('低'),
        balanced: chalk.yellow('中'),
        relaxed: chalk.red('高'),
        extreme: chalk.red('极高'),
      }[level];

      return [
        level === currentLevel ? `★ ${level}` : level,
        perms.allowDelete ? '✓' : '✗',
        perms.allowSystemModify ? '✓' : '✗',
        perms.allowNetwork ? '✓' : '✗',
        perms.allowExec ? '✓' : '✗',
        riskLabel,
      ];
    });

    printTable({ title: '当前级别:', head, rows });

    console.log();
    printSection('级别说明');
    levels.forEach(level => {
      const perms = SANDBOX_PERMISSIONS[level];
      const icon = {
        minimal: '🔒',
        conservative: '🛡️',
        balanced: '⚖️',
        relaxed: '🔓',
        extreme: '⚡',
      }[level];

      const status = level === currentLevel ? ` ${chalk.green('← 当前')} ` : '';
      console.log(`  ${icon} ${chalk.bold(level)}${status}`);
      console.log(`     ${perms.description}`);
      console.log();
    });

    console.log(chalk.gray('  使用 devflow config set-sandbox <level> 更改权限级别'));
    console.log();
  });

// 查看当前沙盒配置
sandboxConfigCommand
  .command('get-sandbox')
  .description('查看当前沙盒配置')
  .action(async () => {
    await configManager.init();
    const sandbox = configManager.getSandboxConfig();
    const perms = configManager.getSandboxPermissions();

    printSection('沙盒权限配置');
    printKeyValue([
      { key: '权限级别', value: sandbox.level, highlight: true },
      { key: '描述', value: perms.description },
      { key: '允许删除', value: perms.allowDelete ? '✓' : '✗' },
      { key: '允许系统修改', value: perms.allowSystemModify ? '✓' : '✗' },
      { key: '允许网络', value: perms.allowNetwork ? '✓' : '✗' },
      { key: '允许执行', value: perms.allowExec ? '✓' : '✗' },
      { key: '风险确认', value: sandbox.confirmOnRisk ? '✓ 开启' : '✗ 关闭' },
    ]);

    console.log();
    console.log(chalk.gray(`  最大文件大小: ${formatBytes(perms.maxFileSize)}`));

    const riskLabel = {
      minimal: chalk.green('极低'),
      conservative: chalk.green('低'),
      balanced: chalk.yellow('中'),
      relaxed: chalk.red('高'),
      extreme: chalk.red('极高'),
    }[sandbox.level];
    console.log(chalk.gray(`  风险等级: ${riskLabel}`));
    console.log();
  });
