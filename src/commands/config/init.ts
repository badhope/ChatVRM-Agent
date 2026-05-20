import { Command } from 'commander';
import inquirer from 'inquirer';
import chalk from 'chalk';
import { configManager } from '../../config/manager.js';
import { PROVIDER_INFO, PROVIDER_TYPE_LIST, type ProviderType } from '../../types.js';
import { printHeader, printSection, printSuccess, printError, printInfo } from '../../ui/logo.js';

export const initConfigCommand = new Command('init')
  .description('初始化配置与查看');

// 初始化配置向导
initConfigCommand
  .command('init')
  .description('交互式初始化配置')
  .action(async () => {
    await configManager.init();

    printHeader();
    printSection('初始化配置向导');

    printInfo('本向导将帮助您配置 DevFlow Agent\n');

    // 选择要配置的平台
    const { providers } = await inquirer.prompt([{
      type: 'checkbox',
      name: 'providers',
      message: '选择要配置的平台（可多选）:',
      choices: PROVIDER_TYPE_LIST.map(type => ({
        name: `${PROVIDER_INFO[type].displayName} (${type})`,
        value: type,
        checked: !!configManager.getApiKey(type)
      }))
    }]);

    // 为每个选中的平台配置API密钥
    for (const type of providers as ProviderType[]) {
      const info = PROVIDER_INFO[type];
      const currentKey = configManager.getApiKey(type);

      console.log(chalk.bold(`\n  🔧 配置 ${info.displayName}`));

      if (currentKey) {
        const { update } = await inquirer.prompt([{
          type: 'confirm',
          name: 'update',
          message: '已配置API密钥，是否更新?',
          default: false
        }]);

        if (!update) continue;
      }

      const { apiKey } = await inquirer.prompt([{
        type: 'password',
        name: 'apiKey',
        message: `请输入 ${info.displayName} API密钥:`,
        mask: '*',
        validate: (input: string) => input.trim() !== '' || 'API密钥不能为空'
      }]);

      await configManager.setApiKey(type, apiKey);
      printSuccess(`${info.displayName} API密钥已保存`);
    }

    // 设置默认平台
    const configuredProviders = PROVIDER_TYPE_LIST.filter(type =>
      configManager.getApiKey(type)
    );

    if (configuredProviders.length > 0) {
      const { defaultProvider } = await inquirer.prompt([{
        type: 'list',
        name: 'defaultProvider',
        message: '选择默认平台:',
        choices: [
          { name: '不设置', value: null },
          ...configuredProviders.map(type => ({
            name: PROVIDER_INFO[type].displayName,
            value: type
          }))
        ]
      }]);

      if (defaultProvider) {
        await configManager.setDefaultProvider(defaultProvider as ProviderType);
        printSuccess(`默认平台已设置为: ${PROVIDER_INFO[defaultProvider as ProviderType].displayName}`);
      }
    }

    printSuccess('\n配置完成！');
    printInfo('使用 devflow config list 查看当前配置');
    printInfo('使用 devflow config test 测试连接');
  });

// 查看所有配置
initConfigCommand
  .command('list')
  .alias('ls')
  .description('列出所有配置')
  .action(async () => {
    await configManager.init();
    const config = configManager.getAllConfig();

    printHeader();
    printSection('当前配置');

    console.log(chalk.bold('\n  📍 配置文件路径:'));
    console.log(`     ${configManager.getConfigPath()}`);

    console.log(chalk.bold('\n  🤖 AI平台配置:\n'));

    PROVIDER_TYPE_LIST.forEach(type => {
      const info = PROVIDER_INFO[type];
      const providerConfig = config.providers[type];
      // 本地平台不需要 API Key
      const isLocalProvider = !info.requiresApiKey;
      const hasApiKey = isLocalProvider || !!providerConfig?.apiKey;

      if (hasApiKey) {
        printSuccess(`${info.displayName} [已配置]`);
        if (isLocalProvider) {
          console.log(`     ${chalk.green('✓ 本地运行，无需API Key')}`);
        } else if (providerConfig?.apiKey) {
          const maskedKey = providerConfig.apiKey.substring(0, 8) + '...' + providerConfig.apiKey.substring(providerConfig.apiKey.length - 4);
          console.log(`     API Key: ${maskedKey}`);
        }
      } else {
        printError(`${info.displayName} [未配置]`);
      }

      if (providerConfig?.baseUrl) {
        console.log(`     自定义端点: ${providerConfig.baseUrl}`);
      }

      if (providerConfig?.defaultModel) {
        console.log(`     默认模型: ${providerConfig.defaultModel}`);
      }

      console.log();
    });

    console.log(chalk.bold('  ⚙️  聊天设置:'));
    console.log(`     默认温度: ${config.chat.defaultTemperature}`);
    console.log(`     默认最大Token: ${config.chat.defaultMaxTokens}`);
    console.log(`     保存历史: ${config.chat.saveHistory ? '是' : '否'}`);
    console.log(`     历史限制: ${config.chat.historyLimit} 条`);

    if (config.defaultProvider) {
      console.log(chalk.bold('\n  ⭐ 默认平台:'));
      console.log(`     ${PROVIDER_INFO[config.defaultProvider].displayName}`);
    }

    console.log();
  });
