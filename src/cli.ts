#!/usr/bin/env node

// 必须先导入 reflect-metadata 以支持 TSyringe 装饰器
import 'reflect-metadata';

import { Command } from 'commander';
import { aiCommand } from './commands/ai.js';
import { configCommand } from './commands/config.js';
import { chatCommand } from './commands/chat.js';
import { historyCommand } from './commands/history.js';
import { reviewCommand } from './commands/review.js';
import { filesCommand } from './commands/files.js';
import { toolsCommand } from './commands/tools.js';
import { memoryCommand } from './commands/memory.js';
import { agentCommand } from './commands/agent.js';
import { gitCommand } from './commands/git.js';
import { testCommand } from './commands/test-cmd.js';
import { dataCommand } from './commands/data.js';
import { explainCommand } from './commands/explain.js';
import { snippetCommand } from './commands/snippet.js';
import { configManager } from './config/manager.js';
import { printHeader, printSuccess, printError, printInfo, printWarning } from './ui/logo.js';
import { showMainMenu } from './ui/menu.js';
import { handleMenuChoice } from './ui/menu-handler.js';
import { logger } from './services/logger.js';
import { generateStartupSuggestions } from './agent/startup-suggestions.js';
import { getErrorMessage } from './utils/error-handling.js';

// 注册 DI 容器服务（可选，用于未来的依赖注入迁移）
import { initializeContainer } from './di/index.js';
initializeContainer();

// 导入需要在清理时停止的服务
import path from 'path';
import fs from 'fs/promises';
import { syncManager } from './cloud/sync-manager.js';
import { DEVFLOW_DIR } from './utils/index.js';
import { decisionReflector } from './agent/decision-reflector.js';
import { SHUTDOWN_DELAY_MS } from './constants/index.js';

// 全局状态追踪
let currentSessionId: string | null = null;
let currentMessages: Array<{ role: string; content: string }> = [];

// 供 chat-start.ts 调用以追踪当前对话
export function setCurrentSession(
  sessionId: string,
  messages: Array<{ role: string; content: string }>
) {
  currentSessionId = sessionId;
  currentMessages = messages;
}

// 注册全局清理处理器
const cleanup = async () => {
  console.log('\n正在保存状态...');

  try {
    // 1. 停止所有自动同步
    syncManager.stopAutoSync();

    // 2. 保存当前对话（如果有）
    if (currentSessionId && currentMessages.length > 0) {
      const sessionFile = path.join(DEVFLOW_DIR, 'sessions', `${currentSessionId}.json`);
      await fs.mkdir(path.dirname(sessionFile), { recursive: true });
      await fs.writeFile(
        sessionFile,
        JSON.stringify(
          {
            id: currentSessionId,
            messages: currentMessages,
            savedAt: new Date().toISOString(),
            interrupted: true,
          },
          null,
          2
        )
      );
      console.log('✓ 对话已保存');
    }

    // 3. 保存决策历史
    await decisionReflector.save();
    console.log('✓ 决策历史已保存');

    // 4. 执行最后一次同步（非阻塞，最多等待 3 秒）
    await Promise.race([
      syncManager.sync().catch((error) => {
        logger.debug({ error }, 'Final sync failed during shutdown');
      }),
      new Promise((resolve) => setTimeout(resolve, SHUTDOWN_DELAY_MS)),
    ]);

    console.log('✓ 状态保存完成');
  } catch (error: unknown) {
    logger.error({ error: getErrorMessage(error) }, 'Error saving state');
  }
};

// 同步版本用于 exit 事件
const cleanupSync = () => {
  // exit 事件中无法执行异步操作，但可以触发
  cleanup().catch((error) => {
    logger.debug({ error }, 'Cleanup failed during exit');
  });
};

process.on('exit', cleanupSync);
process.on('SIGINT', async () => {
  await cleanup();
  console.log('\n再见！');
  process.exit(0);
});
process.on('SIGTERM', async () => {
  await cleanup();
  process.exit(0);
});

const program = new Command();

program
  .name('personal-assistant')
  .description('Personal-Assistant Agent CLI - 可靠、诚实、可控的AI开发助手')
  .version('0.1.0');

program.addCommand(aiCommand);
program.addCommand(configCommand);
program.addCommand(chatCommand);
program.addCommand(historyCommand);
program.addCommand(reviewCommand);
program.addCommand(filesCommand);
program.addCommand(toolsCommand);
program.addCommand(memoryCommand);
program.addCommand(agentCommand);
program.addCommand(gitCommand);
program.addCommand(testCommand);
program.addCommand(dataCommand);
program.addCommand(explainCommand);
program.addCommand(snippetCommand);

// 快捷命令：personal-assistant ask（等同于 personal-assistant chat ask）
program
  .command('ask <question>')
  .description('快速提问（等同于 chat ask）')
  .option('-m, --model <model>', '指定模型')
  .option('-p, --provider <provider>', '指定平台')
  .option('-s, --stream', '流式输出', true)
  .action(async (question, options) => {
    await configManager.init();
    const { askQuestion } = await import('./commands/chat/chat-ask.js');
    await askQuestion(question, {
      model: options.model,
      provider: options.provider,
      stream: options.stream,
    });
  });

program
  .command('help-interactive')
  .alias('help')
  .description('打开交互式帮助中心')
  .action(async () => {
    await configManager.init();
    const { interactiveHelp } = await import('./ui/help.js');
    await interactiveHelp();
  });

process.on('uncaughtException', (error) => {
  console.log();
  logger.error({ error: error.message, stack: error.stack }, 'Uncaught exception');
  printError(`程序异常: ${error.message}`);
  printInfo('请尝试重新运行，如果问题持续请提交 Issue');
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  console.log();
  logger.error({ reason }, 'Unhandled promise rejection');
  printError(`未处理的Promise异常: ${reason}`);
  process.exit(1);
});

if (process.argv.length === 2) {
  (async () => {
    logger.info('Starting Personal-Assistant Agent in interactive mode');
    try {
      await configManager.init();
      logger.debug('Configuration initialized successfully');

      // 首次运行检测和引导
      const hasApiKey =
        configManager.getProviderConfig('openai')?.apiKey ||
        configManager.getProviderConfig('anthropic')?.apiKey ||
        process.env.OPENAI_API_KEY ||
        process.env.ANTHROPIC_API_KEY;

      if (!hasApiKey) {
        console.log();
        printWarning('⚠️  检测到首次运行：尚未配置 API Key');
        printInfo('Personal-Assistant Agent 需要 AI 提供商的 API Key 才能工作');
        console.log();
        console.log('  快速配置方式：');
        console.log(
          '    1. 运行 personal-assistant config set-provider --provider openai --api-key YOUR_KEY'
        );
        console.log('    2. 设置环境变量: export OPENAI_API_KEY=your_key');
        console.log('    3. 在交互菜单中选择 "⚙️ 配置管理" → "设置AI提供商"');
        console.log();
        printInfo('支持 OpenAI、Anthropic、阿里云百炼 等提供商');
        console.log();
      }

      // 运行启动健康检查（非阻塞，仅提示）
      try {
        const healthResult = await generateStartupSuggestions(process.cwd());
        if (healthResult.healthStatus !== 'healthy') {
          console.log();
          if (healthResult.healthStatus === 'critical') {
            printWarning(`项目健康检查: ${healthResult.summary}`);
          } else {
            printInfo(`项目健康检查: ${healthResult.summary}`);
          }
          // 显示前 3 条建议
          for (const suggestion of healthResult.suggestions.slice(0, 3)) {
            console.log(`    ${suggestion}`);
          }
          console.log();
        }
      } catch (error) {
        logger.debug({ error }, 'Health check failed');
      }
    } catch (error: unknown) {
      const errMsg = getErrorMessage(error);
      logger.error({ error: errMsg }, 'Configuration initialization failed');
      printError(`配置初始化失败: ${errMsg}`);
      printInfo('请检查 .personal-assistant 目录权限');
      process.exit(1);
    }

    let running = true;
    while (running) {
      try {
        const choice = await showMainMenu();

        if (choice === null || choice === 'exit') {
          running = false;
          printHeader();
          printSuccess('感谢使用 Personal-Assistant Agent，再见！');
          logger.info('Personal-Assistant Agent exited normally');
          process.exit(0);
        }

        await handleMenuChoice(choice);
      } catch (error: unknown) {
        const errMsg = getErrorMessage(error);
        logger.error({ error: errMsg }, 'Operation failed in main loop');
        printError(`操作失败: ${errMsg}`);
        printInfo('返回主菜单...');
      }
    }
  })();
} else {
  program.parse();
}
