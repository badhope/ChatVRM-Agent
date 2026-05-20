import { Command } from 'commander';
import inquirer from 'inquirer';
import chalk from 'chalk';
import { configManager } from '../../config/manager.js';
import { printHeader, printSection, printSuccess, printError } from '../../ui/logo.js';

export const chatConfigCommand = new Command('chat')
  .description('聊天参数设置');

// 设置聊天参数
chatConfigCommand
  .command('set-chat')
  .description('设置聊天参数')
  .option('--temperature <n>', '默认温度 (0-2)')
  .option('--max-tokens <n>', '默认最大Token数')
  .option('--save-history', '是否保存聊天历史')
  .option('--history-limit <n>', '历史记录保存条数')
  .action(async (options: { temperature?: string; maxTokens?: string; saveHistory?: string; historyLimit?: string }) => {
    await configManager.init();
    const currentConfig = configManager.getChatConfig();

    // 如果有命令行参数，直接使用
    const hasCliArgs = options.temperature || options.maxTokens || options.saveHistory || options.historyLimit;

    if (hasCliArgs) {
      const updates: Partial<typeof currentConfig> = {};
      if (options.temperature !== undefined) {
        const temp = parseFloat(options.temperature);
        if (isNaN(temp) || temp < 0 || temp > 2) {
          printError('温度必须在 0-2 之间');
          return;
        }
        updates.defaultTemperature = temp;
      }
      if (options.maxTokens !== undefined) {
        const tokens = parseInt(options.maxTokens, 10);
        if (isNaN(tokens) || tokens <= 0) {
          printError('最大Token数必须大于0');
          return;
        }
        updates.defaultMaxTokens = tokens;
      }
      if (options.saveHistory !== undefined) {
        updates.saveHistory = options.saveHistory === 'true';
      }
      if (options.historyLimit !== undefined) {
        const limit = parseInt(options.historyLimit, 10);
        if (isNaN(limit) || limit <= 0) {
          printError('历史记录条数必须大于0');
          return;
        }
        updates.historyLimit = limit;
      }

      await configManager.updateChatConfig(updates);
      printSuccess('聊天参数已更新');
      console.log(chalk.gray(`  温度: ${updates.defaultTemperature ?? currentConfig.defaultTemperature}`));
      console.log(chalk.gray(`  最大Token: ${updates.defaultMaxTokens ?? currentConfig.defaultMaxTokens}`));
      console.log(chalk.gray(`  保存历史: ${updates.saveHistory ?? currentConfig.saveHistory}`));
      console.log(chalk.gray(`  历史条数: ${updates.historyLimit ?? currentConfig.historyLimit}`));
      return;
    }

    // 交互式模式
    if (!process.stdin.isTTY) {
      printError('非交互模式请使用 --temperature/--max-tokens 等参数');
      return;
    }

    printHeader();
    printSection('设置聊天参数');

    const answers = await inquirer.prompt([
      {
        type: 'number',
        name: 'defaultTemperature',
        message: '默认温度 (0-2):',
        default: currentConfig.defaultTemperature,
        validate: (input: number) => (input >= 0 && input <= 2) || '温度必须在 0-2 之间'
      },
      {
        type: 'number',
        name: 'defaultMaxTokens',
        message: '默认最大Token数:',
        default: currentConfig.defaultMaxTokens,
        validate: (input: number) => input > 0 || '必须大于0'
      },
      {
        type: 'confirm',
        name: 'saveHistory',
        message: '是否保存聊天历史?',
        default: currentConfig.saveHistory
      },
      {
        type: 'number',
        name: 'historyLimit',
        message: '历史记录保存条数:',
        default: currentConfig.historyLimit,
        when: (answers) => answers.saveHistory,
        validate: (input: number) => input > 0 || '必须大于0'
      }
    ]);

    await configManager.updateChatConfig(answers);
    printSuccess('聊天参数已更新');
  });
