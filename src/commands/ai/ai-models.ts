import { Command } from 'commander';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { configManager } from '../../config/manager.js';
import { PROVIDER_INFO, PROVIDER_TYPE_LIST, type ProviderType } from '../../types.js';
import { printHeader, printSection, printInfo, printWarning } from '../../ui/logo.js';
import { showProviderMenu } from '../../ui/menu.js';
import { waitForEnter } from '../../utils/io.js';

async function isProviderConfigured(type: ProviderType): Promise<boolean> {
  const info = PROVIDER_INFO[type];
  if (!info.requiresApiKey) return true;
  return !!configManager.getApiKey(type);
}

async function showAllModels() {
  printHeader();
  printSection('所有可用模型（按输入价格排序）');

  interface ModelDisplay {
    provider: ProviderType;
    providerName: string;
    id: string;
    name: string;
    inputPrice: number;
    outputPrice: number;
    capabilities: string[];
  }

  const allModels: ModelDisplay[] = [];

  PROVIDER_TYPE_LIST.forEach(type => {
    const info = PROVIDER_INFO[type];
    info.models.forEach(model => {
      const capabilities: string[] = [];
      if (model.capabilities.chat) capabilities.push('聊天');
      if (model.capabilities.stream) capabilities.push('流式');
      if (model.capabilities.tools) capabilities.push('工具');
      if (model.capabilities.thinking) capabilities.push('思考');
      if (model.capabilities.vision) capabilities.push('视觉');

      allModels.push({
        provider: type,
        providerName: info.displayName,
        id: model.id,
        name: model.name,
        inputPrice: model.pricing.inputPerMillion,
        outputPrice: model.pricing.outputPerMillion,
        capabilities
      });
    });
  });

  allModels.sort((a, b) => a.inputPrice - b.inputPrice);

  console.log(chalk.bold('\n  平台              模型                    输入$/M      输出$/M    能力'));
  console.log(chalk.gray('  ' + '─'.repeat(80)));

  allModels.forEach(model => {
    console.log(
      `  ${model.providerName.padEnd(16)}` +
      `${model.name.padEnd(22)}` +
      `$${model.inputPrice.toFixed(2).padEnd(10)}` +
      `$${model.outputPrice.toFixed(2).padEnd(10)}` +
      `${model.capabilities.join(', ')}`
    );
  });

  printInfo(`\n共 ${allModels.length} 个模型`);
  console.log('\n');
  await waitForEnter();
}

async function showModelInfo() {
  printHeader();

  const providerChoice = await showProviderMenu();
  if (!providerChoice || providerChoice === '__back__') return;

  const info = PROVIDER_INFO[providerChoice as ProviderType];
  const { modelId } = await inquirer.prompt([{
    type: 'list',
    name: 'modelId',
    message: '选择模型：',
    choices: info.models.map(m => ({
      name: `${m.name} (${m.pricing.inputPerMillion}$/M)`,
      value: m.id
    }))
  }]);

  const model = info.models.find(m => m.id === modelId);
  if (!model) return;

  printHeader();
  printSection(`模型信息: ${model.name}`);

  console.log(`\n  ${chalk.bold('名称:')} ${chalk.cyan(model.name)}`);
  console.log(`  ${chalk.bold('ID:')} ${chalk.gray(model.id)}`);
  console.log(`  ${chalk.bold('平台:')} ${chalk.cyan(info.displayName)}`);

  console.log(`\n  ${chalk.bold('💰 定价:')}`);
  console.log(`     输入: $${chalk.yellow(model.pricing.inputPerMillion)} ${model.pricing.currency}/百万Token`);
  console.log(`     输出: $${chalk.yellow(model.pricing.outputPerMillion)} ${model.pricing.currency}/百万Token`);

  console.log(`\n  ${chalk.bold('📊 参数:')}`);
  console.log(`     上下文窗口: ${chalk.cyan(model.contextWindow.toLocaleString())} tokens`);
  console.log(`     最大输出: ${chalk.cyan(model.maxOutput.toLocaleString())} tokens`);

  console.log(`\n  ${chalk.bold('✨ 能力:')}`);
  console.log(`     聊天: ${model.capabilities.chat ? chalk.green('✓') : chalk.red('✗')}`);
  console.log(`     流式: ${model.capabilities.stream ? chalk.green('✓') : chalk.red('✗')}`);
  console.log(`     嵌入: ${model.capabilities.embed ? chalk.green('✓') : chalk.red('✗')}`);
  console.log(`     工具: ${model.capabilities.tools ? chalk.green('✓') : chalk.red('✗')}`);
  console.log(`     思考: ${model.capabilities.thinking ? chalk.green('✓') : chalk.red('✗')}`);
  console.log(`     视觉: ${model.capabilities.vision ? chalk.green('✓') : chalk.red('✗')}`);

  console.log('\n');
  await waitForEnter();
}

export const aiModelsCommand = new Command('model')
  .description('模型管理');

aiModelsCommand
  .command('list')
  .description('列出所有可用模型（按价格排序）')
  .action(async () => {
    await configManager.init();
    await showAllModels();
  });

aiModelsCommand
  .command('info')
  .description('查看模型详细信息')
  .action(async () => {
    await configManager.init();
    await showModelInfo();
  });

export { showAllModels, showModelInfo };
