import inquirer from 'inquirer';
import chalk from 'chalk';
import { configManager } from '../config/manager.js';

export interface PermissionCheckResult {
  allowed: boolean;
  confirmed?: boolean;
  reason?: string;
}

export interface PermissionRequest {
  action: 'delete' | 'modify' | 'network' | 'exec' | 'read';
  target?: string;
  description?: string;
  risk?: 'low' | 'medium' | 'high' | 'critical';
}

const RISK_ICONS = {
  low: '🔵',
  medium: '🟡',
  high: '🟠',
  critical: '🔴',
};

const RISK_COLORS = {
  low: chalk.blue,
  medium: chalk.yellow,
  high: chalk.red,
  critical: chalk.bgRed,
};

export async function checkAndRequestPermission(
  request: PermissionRequest
): Promise<PermissionCheckResult> {
  await configManager.init();

  const sandbox = configManager.getSandboxConfig();
  const perms = configManager.getSandboxPermissions();

  const actionMap: Record<string, 'delete' | 'modify' | 'network' | 'exec'> = {
    delete: 'delete',
    modify: 'modify',
    network: 'network',
    exec: 'exec',
  };

  const action = actionMap[request.action];
  if (!action) {
    return { allowed: true, reason: '读取操作始终允许' };
  }

  const permission = configManager.checkSandboxPermission(action, request.target);

  if (permission.allowed) {
    return { allowed: true };
  }

  if (!sandbox.confirmOnRisk) {
    return {
      allowed: false,
      reason: permission.reason || `当前权限级别 (${sandbox.level}) 禁止此操作`,
    };
  }

  if (!process.stdin.isTTY) {
    return {
      allowed: false,
      reason: `需要更高权限级别，请使用 devflow config set-sandbox <level> 提升权限`,
    };
  }

  const riskLevel = request.risk || 'medium';
  const riskIcon = RISK_ICONS[riskLevel];
  const riskColor = RISK_COLORS[riskLevel];

  console.log();
  console.log(chalk.bold('⚠️  权限不足，需要用户确认'));
  console.log();

  const details = [
    { key: '操作', value: request.action },
    { key: '目标', value: request.target || '未指定' },
    { key: '当前级别', value: sandbox.level },
    { key: '风险等级', value: riskColor(`${riskIcon} ${riskLevel.toUpperCase()}`) },
  ];

  if (request.description) {
    details.push({ key: '描述', value: request.description });
  }

  for (const { key, value } of details) {
    console.log(`  ${chalk.gray(key)}: ${value}`);
  }

  console.log();
  console.log(riskColor(`  ⚠️  ${permission.reason || '此操作被当前权限级别禁止'}`));
  console.log();

  if (sandbox.level === 'minimal') {
    console.log(chalk.gray('  提示: 极小权限模式下只能执行读取操作'));
    console.log(chalk.gray('  建议: devflow config set-sandbox conservative'));
  } else if (sandbox.level === 'conservative') {
    console.log(chalk.gray('  提示: 保守权限模式禁止删除和系统修改'));
    console.log(chalk.gray('  建议: devflow config set-sandbox balanced'));
  } else if (sandbox.level === 'balanced') {
    console.log(chalk.gray('  提示: 平衡权限模式已启用'));
    console.log(chalk.gray('  要允许此操作: devflow config set-sandbox relaxed'));
  }

  console.log();

  try {
    const { confirmed } = await inquirer.prompt([{
      type: 'confirm',
      name: 'confirmed',
      message: `确认执行此操作? (需要提升权限)`,
      default: false,
    }]);

    if (confirmed) {
      console.log(chalk.green('  ✓ 用户已确认'));
      return { allowed: true, confirmed: true };
    } else {
      console.log(chalk.yellow('  ⏭ 用户已拒绝'));
      return { allowed: false, confirmed: false, reason: '用户拒绝' };
    }
  } catch (error) {
    console.log(chalk.red('  ✗ 无法显示交互提示'));
    return {
      allowed: false,
      reason: `权限不足，请使用 devflow config set-sandbox <level> 提升权限`,
    };
  }
}

export async function showPermissionDeniedError(
  action: string,
  target?: string,
  currentLevel?: string
): Promise<void> {
  console.log();
  console.log(chalk.red('✗ 权限不足'));
  console.log();

  const details = [
    { key: '操作', value: action },
  ];

  if (target) {
    details.push({ key: '目标', value: target });
  }

  if (currentLevel) {
    details.push({ key: '当前级别', value: currentLevel });
  }

  for (const { key, value } of details) {
    console.log(`  ${chalk.gray(key)}: ${value}`);
  }

  console.log();
  console.log(chalk.cyan('💡 解决方案:'));
  console.log(chalk.gray('  1. 查看权限级别: devflow config sandbox-levels'));
  console.log(chalk.gray('  2. 提升权限: devflow config set-sandbox <level>'));
  console.log(chalk.gray('  3. 查看当前配置: devflow config get-sandbox'));
  console.log();
}

export function formatPermissionSummary(): string {
  const sandbox = configManager.getSandboxConfig();
  const perms = configManager.getSandboxPermissions();

  const items = [
    `权限级别: ${sandbox.level}`,
    `删除: ${perms.allowDelete ? '✓' : '✗'}`,
    `系统修改: ${perms.allowSystemModify ? '✓' : '✗'}`,
    `网络: ${perms.allowNetwork ? '✓' : '✗'}`,
    `执行: ${perms.allowExec ? '✓' : '✗'}`,
  ];

  return items.join(' | ');
}
