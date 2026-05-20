import { Command } from 'commander';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { configManager } from '../config/manager.js';
import { PROVIDER_INFO, PROVIDER_TYPE_LIST, type ProviderType } from '../types.js';
import { printHeader, printSection, printSuccess, printError, printInfo, printWarning } from '../ui/logo.js';
import { printTable, printKeyValue } from '../ui/display.js';
import { showMainMenu } from '../ui/menu.js';
import { aiSuggestCommand } from './ai/ai-suggest.js';
import { aiModelsCommand } from './ai/ai-models.js';
import { waitForEnter } from '../utils/io.js';

const aiCommand = new Command('ai')
  .description('AI模型管理');

// 交互式主菜单
aiCommand
  .command('interactive')
  .alias('i')
  .description('启动交互式菜单')
  .action(async () => {
    await configManager.init();

    while (true) {
      const choice = await showMainMenu();

      if (choice === null || choice === 'exit') {
        printHeader();
        printSuccess('感谢使用 DevFlow Agent，再见！');
        return;
      }

      switch (choice) {
        case 'list': await showProviderList(); break;
        case 'status': await showStatus(); break;
        case 'models': await showAllModels(); break;
        case 'suggest': await showModelSuggestion(); break;
        case 'info': await showModelInfo(); break;
        case 'interactive':
        case 'quick-ask':
        case 'agent-run':
        case 'review-file':
        case 'review-dir':
        case 'tools-list':
        case 'tools-run':
        case 'file-read':
        case 'file-write':
        case 'file-tree':
        case 'memory-view':
        case 'memory-search':
        case 'config-view':
        case 'config-key':
        case 'config-sandbox':
        case 'help': {
          printInfo('请使用主菜单进入此功能: devflow');
          printInfo('或使用命令行: devflow chat ask / devflow agent run 等');
          await waitForEnter();
          break;
        }
        default: {
          printInfo(`功能 "${choice}" 请使用主菜单: devflow`);
          await waitForEnter();
        }
      }
    }
  });

// ==================== 内部函数 ====================

function isProviderConfigured(type: ProviderType): boolean {
  const info = PROVIDER_INFO[type];
  if (!info.requiresApiKey) return true;
  return !!configManager.getApiKey(type);
}

async function showProviderList() {
  printHeader();
  printSection('支持的AI平台');

  PROVIDER_TYPE_LIST.forEach(type => {
    const info = PROVIDER_INFO[type];
    const isConfigured = isProviderConfigured(type);

    console.log(`\n  ${isConfigured ? '✓' : '○'} ${info.displayName}`);
    console.log(`     ${chalk.gray(info.description)}`);
    console.log(`     默认模型: ${chalk.cyan(info.models[0]?.name || '无')}`);

    if (info.freeTier) console.log(`     ${chalk.green('✓ 免费额度')}`);

    if (!info.requiresApiKey) {
      console.log(`     ${chalk.green('✓ 本地运行，无需配置')}`);
    } else if (!isConfigured) {
      printWarning(`需要配置: devflow config set-key ${type} <apiKey>`);
    }
  });

  console.log('\n');
  await waitForEnter();
}

async function showStatus() {
  printHeader();
  printSection('AI配置状态');

  const head = ['平台', '状态', '模型数', '类型', 'API Key'];
  const rows = PROVIDER_TYPE_LIST.map(type => {
    const info = PROVIDER_INFO[type];
    const apiKey = configManager.getApiKey(type);
    const isConfigured = isProviderConfigured(type);
    const typeLabel = info.requiresApiKey ? '云端' : '本地';
    const keyPreview = !info.requiresApiKey ? '无需配置'
      : apiKey ? `${apiKey.substring(0, 8)}...${apiKey.substring(apiKey.length - 4)}`
      : '未设置';
    return [
      info.displayName,
      isConfigured ? '✓ 已配置' : '○ 未配置',
      String(info.models.length),
      typeLabel,
      keyPreview,
    ];
  });

  printTable({ title: 'AI 平台配置状态', head, rows });

  const configuredCount = PROVIDER_TYPE_LIST.filter(isProviderConfigured).length;
  printInfo(`统计: ${configuredCount}/${PROVIDER_TYPE_LIST.length} 个平台已配置`);
  console.log('\n');
  await waitForEnter();
}

async function showAllModels() {
  const { showAllModels: showAll } = await import('./ai/ai-models.js');
  await showAll();
}

async function showModelSuggestion() {
  const { showModelSuggestion: suggest } = await import('./ai/ai-suggest.js');
  await suggest();
}

async function showModelInfo() {
  const { showModelInfo: info } = await import('./ai/ai-models.js');
  await info();
}

// ==================== 子命令（兼容） ====================

aiCommand
  .command('list')
  .description('列出所有支持的AI平台和模型')
  .action(async () => {
    await configManager.init();
    await showProviderList();
  });

aiCommand
  .command('status')
  .description('查看AI配置状态')
  .action(async () => {
    await configManager.init();
    await showStatus();
  });

// 添加子模块命令
aiCommand.addCommand(aiSuggestCommand);
aiCommand.addCommand(aiModelsCommand);

export { aiCommand };
