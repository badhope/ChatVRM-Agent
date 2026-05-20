import { Command, Option } from 'commander';
import chalk from 'chalk';
import { configManager } from '../../config/manager.js';
import { PROVIDER_INFO } from '../../types.js';
import { printHeader, printSection, printSuccess, printError, printInfo, createSpinner } from '../../ui/logo.js';
import { printTable } from '../../ui/display.js';
import { resolveProvider, checkApiKey, createProviderInstance, formatContext } from './helpers.js';

export const chatModelsCommand = new Command('models')
  .alias('m')
  .description('列出平台所有可用模型')
  .option('-p, --provider <provider>', '指定AI平台')
  .addOption(new Option('--sort <field>', '排序字段').choices(['price', 'name', 'context']).default('price'))
  .action(async (options: { provider?: string; sort: string }) => {
    await configManager.init();

    const providerType = resolveProvider(options);
    if (!providerType) return;

    const info = PROVIDER_INFO[providerType];
    let models = [...info.models];

    switch (options.sort) {
      case 'price': models.sort((a, b) => a.pricing.inputPerMillion - b.pricing.inputPerMillion); break;
      case 'name': models.sort((a, b) => a.name.localeCompare(b.name)); break;
      case 'context': models.sort((a, b) => b.contextWindow - a.contextWindow); break;
    }

    printHeader();
    printSection(`${info.displayName} 模型列表 (${models.length} 个)`);

    const head = ['模型 ID', '名称', '输入$/M', '输出$/M', '上下文', '能力'];
    const rows = models.map(model => {
      const capabilities = [
        model.capabilities.thinking ? 'T' : '',
        model.capabilities.vision ? 'V' : '',
        model.capabilities.tools ? 'X' : '',
        model.capabilities.audio ? 'A' : '',
      ].filter(Boolean).join(' ');
      return [
        model.id,
        model.name,
        '$' + model.pricing.inputPerMillion.toFixed(1),
        '$' + model.pricing.outputPerMillion.toFixed(1),
        formatContext(model.contextWindow),
        capabilities,
      ];
    });

    printTable({ title: `${info.displayName} · ${models.length} 个模型`, head, rows });

    console.log(chalk.gray('  图例: T=思考链 V=视觉 X=工具调用 A=语音'));
    console.log();
  });

// ==================== chat search ====================

export const chatSearchCommand = new Command('search')
  .alias('find')
  .description('搜索平台可用模型（从API实时拉取）')
  .argument('<keyword>', '搜索关键词')
  .option('-p, --provider <provider>', '指定AI平台')
  .option('-l, --limit <n>', '显示数量', '20')
  .action(async (keyword: string, options: { provider?: string; limit: string }) => {
    await configManager.init();

    const providerType = resolveProvider(options);
    if (!providerType) return;
    if (!checkApiKey(providerType)) return;

    const provider = createProviderInstance(providerType, 10000, 0);

    printHeader();
    printSection(`搜索 "${keyword}" - ${PROVIDER_INFO[providerType].displayName}`);

    const spinner = createSpinner('从平台拉取模型列表...');
    const results = await provider.searchModels(keyword);
    if (spinner) spinner.stop();

    const limit = parseInt(options.limit, 10) || 20;

    if (results.length === 0) {
      printError(`未找到匹配 "${keyword}" 的模型`);
      return;
    }

    printSuccess(`找到 ${results.length} 个匹配模型${results.length > limit ? ` (显示前 ${limit} 个)` : ''}\n`);

    results.slice(0, limit).forEach(id => {
      const builtin = PROVIDER_INFO[providerType].models.find(m => m.id === id);
      const tag = builtin ? chalk.green(' ✓') : '';
      const price = builtin ? chalk.gray(` ¥${builtin.pricing.inputPerMillion}/${builtin.pricing.outputPerMillion}/M`) : '';
      console.log(`  ${chalk.cyan(id)}${tag}${price}`);
    });

    console.log();
    printInfo(`使用: devflow chat ask "你的问题" -m <模型ID>`);
    console.log();
  });

// ==================== chat remote-models ====================

export const chatRemoteModelsCommand = new Command('remote-models')
  .alias('rm')
  .description('列出平台所有远程模型（从API实时拉取）')
  .option('-p, --provider <provider>', '指定AI平台')
  .option('-l, --limit <n>', '显示数量', '50')
  .option('--filter <keyword>', '过滤关键词')
  .action(async (options: { provider?: string; limit: string; filter?: string }) => {
    await configManager.init();

    const providerType = resolveProvider(options);
    if (!providerType) return;
    if (!checkApiKey(providerType)) return;

    const provider = createProviderInstance(providerType, 10000, 0);

    printHeader();
    printSection(`${PROVIDER_INFO[providerType].displayName} 远程模型列表`);

    const spinner = createSpinner('从平台拉取模型列表...');
    let models = await provider.listRemoteModels();
    if (spinner) spinner.stop();

    if (options.filter) {
      const lower = options.filter.toLowerCase();
      models = models.filter(id => id.toLowerCase().includes(lower));
    }

    const limit = parseInt(options.limit, 10) || 50;

    printSuccess(`共 ${models.length} 个模型${options.filter ? ` (过滤: ${options.filter})` : ''}${models.length > limit ? ` (显示前 ${limit} 个)` : ''}\n`);

    models.slice(0, limit).forEach(id => {
      const builtin = PROVIDER_INFO[providerType].models.find(m => m.id === id);
      const tag = builtin ? chalk.green(' ✓') : '';
      console.log(`  ${chalk.cyan(id)}${tag}`);
    });

    if (models.length > limit) {
      console.log(chalk.gray(`  ... 还有 ${models.length - limit} 个，使用 --limit 增加显示数量`));
    }

    console.log();
    printInfo(`搜索: devflow chat search <关键词>`);
    console.log();
  });
