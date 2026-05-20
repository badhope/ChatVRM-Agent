import { Command, Option } from 'commander';
import chalk from 'chalk';
import { configManager } from '../../config/manager.js';
import { PROVIDER_INFO } from '../../types.js';
import { printSuccess, printError, printWarning, printInfo, createSpinner } from '../../ui/logo.js';
import { memoryManager } from '../../memory/manager.js';
import { resolveProvider, checkApiKey, createProviderInstance, getChatParams } from './helpers.js';
import { getErrorMessage } from '../../utils/error-handling.js';
import { createLogger } from '../../services/logger.js';

const logger = createLogger('ChatAsk');

export interface AskQuestionOptions {
  model?: string;
  provider?: string;
  stream?: boolean;
  fallback?: boolean;
  fallbackOrder?: string;
}

/**
 * 快速提问的核心函数
 * 可从 cli.ts 的顶层 ask 命令或 chat ask 子命令调用
 */
export async function askQuestion(message: string, options: AskQuestionOptions = {}): Promise<void> {
  const providerType = resolveProvider(options);
  if (!providerType) return;
  if (!checkApiKey(providerType)) return;

  const provider = createProviderInstance(providerType);
  const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [];
  const memoryConfig = configManager.getMemoryConfig();

  // 从记忆中召回相关内容，注入 system prompt（需要配置开启）
  if (memoryConfig.enabled && memoryConfig.autoRecall) {
    const memoryResults = await memoryManager.recall(message, 5);
    if (memoryResults.length > 0) {
      const memoryContext = memoryResults.map(r =>
        `[${new Date(r.interaction.timestamp).toLocaleString('zh-CN')}]\n用户: ${r.interaction.input}\nAI: ${r.interaction.output.slice(0, 300)}`
      ).join('\n---\n');
      messages.push({
        role: 'system',
        content: `以下是用户之前与你的对话记忆，请参考这些上下文来回答当前问题：\n\n${memoryContext}\n\n请基于以上记忆上下文回答用户的新问题。如果用户问到了之前提过的信息（如名字、偏好等），请直接使用记忆中的信息。`,
      });
    }
  }

  messages.push({ role: 'user', content: message });

  const platformModels = PROVIDER_INFO[providerType].models;
  const chatParams = getChatParams();
  const enableFallback = options.fallback || options.fallbackOrder;
  const stream = options.stream !== false; // 默认 true

  // 确定模型列表
  let modelList: string[];
  if (options.fallbackOrder) {
    modelList = options.fallbackOrder.split(',').map(m => m.trim());
  } else if (options.model) {
    const spinner = createSpinner(`搜索模型 "${options.model}"...`);
    const result = await provider.findModel(options.model);
    if (spinner) spinner.stop();

    if (result.exact) {
      if (result.exact !== options.model) {
        printInfo(`已匹配: ${options.model} → ${result.exact}`);
      }
      modelList = [result.exact];
    } else if (result.candidates.length > 0) {
      printWarning(`未找到精确匹配 "${options.model}"，找到 ${result.candidates.length} 个相似模型:`);
      result.candidates.forEach((c, i) => console.log(chalk.gray(`  ${i + 1}. ${c}`)));
      printInfo(`使用第一个: ${result.candidates[0]}，或用 --model 指定完整ID`);
      modelList = [result.candidates[0]];
    } else {
      printWarning(`平台未找到模型 "${options.model}"，将直接尝试调用`);
      printInfo('如果调用失败，可以用 devflow chat search <关键词> 搜索可用模型');
      modelList = [options.model];
    }
  } else {
    const providerConfig = configManager.getProviderConfig(providerType);
    modelList = [providerConfig.defaultModel || platformModels[0]?.id];
  }

  // fallback：添加备用模型
  if (enableFallback && modelList.length === 1) {
    const currentModel = modelList[0];
    const fallbackModels = platformModels
      .filter(m => m.id !== currentModel)
      .sort((a, b) => a.pricing.inputPerMillion - b.pricing.inputPerMillion)
      .map(m => m.id);
    modelList = [currentModel, ...fallbackModels];
  }

  // 尝试调用
  const errors: string[] = [];

  for (let i = 0; i < modelList.length; i++) {
    const modelId = modelList[i];
    const modelInfo = platformModels.find(m => m.id === modelId);

    if (i > 0) {
      printWarning(`模型 ${modelList[i - 1]} 失败，尝试切换到: ${modelInfo?.name || modelId}`);
    }

    if (stream) {
      if (i === 0) {
        process.stdout.write(chalk.green('AI: '));
      } else {
        // Clear previous model's output and show new model header
        process.stdout.write(chalk.yellow('\n[切换到备用模型]\n'));
        process.stdout.write(chalk.green(`AI [${modelInfo?.name || modelId}]: `));
      }

      try {
        const streamResult = provider.stream({
          messages,
          model: modelId,
          temperature: chatParams.temperature,
          maxTokens: chatParams.maxTokens,
        });
        for await (const chunk of streamResult) {
          if (!chunk.done) process.stdout.write(chunk.content);
        }
        console.log('\n');
        return;
      } catch (error: unknown) {
        console.log();
        errors.push(`${modelId}: ${getErrorMessage(error)}`);
        if (!enableFallback || i === modelList.length - 1) {
          printError(`请求失败: ${getErrorMessage(error)}`);
          return;
        }
      }
    } else {
      const spinner = createSpinner(`AI思考中 [${modelInfo?.name || modelId}]...`);
      try {
        const response = await provider.chat({
          messages,
          model: modelId,
          temperature: chatParams.temperature,
          maxTokens: chatParams.maxTokens,
        });

        if (spinner) spinner.stop();

        console.log(chalk.green(`\nAI [${modelInfo?.name || modelId}]:`));
        console.log(response.content);

        if (response.usage) {
          console.log(chalk.gray(
            `\n>> Token：${response.usage.totalTokens} ` +
            `| 成本：$${response.cost?.totalCost.toFixed(4) || '0.0000'}`
          ));
        }
        if (i > 0) {
          console.log(chalk.gray(`\n💡 提示: 使用 --model ${modelId} 可直接指定此模型`));
        }

        // 静默保存到记忆（需要配置开启）
        if (memoryConfig.enabled) {
          memoryManager.rememberChat({
            input: message,
            output: response.content,
            provider: providerType,
            model: modelId,
          }).catch((error) => {
            logger.debug({ error }, 'Failed to remember chat');
          });
        }

        return;
      } catch (error: unknown) {
        if (spinner) spinner.stop();
        errors.push(`${modelId}: ${getErrorMessage(error)}`);
        if (!enableFallback || i === modelList.length - 1) {
          printError(`请求失败: ${getErrorMessage(error)}`);
          if (errors.length > 1) {
            console.log(chalk.gray('\n尝试过的模型:'));
            errors.forEach((e, idx) => console.log(chalk.gray(`  ${idx + 1}. ${e}`)));
          }
          return;
        }
      }
    }
  }
}

export const chatAskCommand = new Command('ask')
  .alias('a')
  .description('快速提问（单轮对话）')
  .argument('<message>', '问题内容')
  .option('-p, --provider <provider>', '指定AI平台')
  .option('-m, --model <model>', '指定模型（支持模糊匹配）')
  .option('-s, --stream', '使用流式输出（默认开启）', true)
  .option('--no-stream', '禁用流式输出，等待完整响应')
  .option('-f, --fallback', '启用自动切换：模型失败时自动尝试下一个模型', false)
  .option('--fallback-order <models>', '自定义切换顺序（逗号分隔的模型ID）')
  .action(async (message: string, options: { provider?: string; model?: string; stream?: boolean; fallback?: boolean; fallbackOrder?: string }) => {
    await configManager.init();
    await askQuestion(message, options);
  });
