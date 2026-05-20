import { Command } from 'commander';
import inquirer from 'inquirer';
import chalk from 'chalk';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { configManager } from '../../config/manager.js';
import { projectConfigLoader } from '../../config/project-config.js';
import { PROVIDER_INFO, PROVIDER_TYPE_LIST, type ProviderType } from '../../types.js';
import { printHeader, printSection, printSuccess, printError, printInfo } from '../../ui/logo.js';
import { memoryManager } from '../../memory/manager.js';
import { checkApiKey, createProviderInstance, getChatParams } from './helpers.js';
import { executeSlashCommand } from '../slash-commands.js';
import { PersonalityManager } from '../../agent/personality.js';
import { EmotionalStateManager } from '../../agent/emotional-state.js';
import { setCurrentSession } from '../../cli.js';
import type { IProviderFactory, IConfigManager } from '../../services/interfaces.js';
import type { BaseProvider } from '../../base.js';
import { getErrorMessage } from '../../utils/error-handling.js';
import { createLogger } from '../../services/logger.js';

const logger = createLogger('ChatStart');

const execFileAsync = promisify(execFile);

export interface StartChatOptions {
  provider?: string;
  model?: string;
  resumeMessages?: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
}

interface ChatContext {
  providerType: ProviderType;
  modelId: string;
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  sessionId: string;
  personalityManager: PersonalityManager;
  emotionalState: EmotionalStateManager;
  provider: BaseProvider;
  chatParams: ReturnType<typeof getChatParams>;
  memoryConfig: ReturnType<typeof configManager.getMemoryConfig>;
}

/**
 * 启动交互式对话的核心函数
 * 可从 chat start 命令或 chat-resume.ts 调用
 */
export async function startInteractiveChat(options: StartChatOptions = {}): Promise<void> {
  printHeader();
  printSection(options.resumeMessages ? '恢复对话' : '开始对话');

  const providerType = await selectProvider(options.provider);
  if (!providerType) return;

  if (!checkApiKey(providerType)) return;

  const modelId = await selectModel(providerType, options.model);
  if (!modelId) return;

  printSuccess(`使用 ${PROVIDER_INFO[providerType].displayName} / ${modelId}`);
  console.log(chalk.gray('  提示: 输入 /help 查看命令，! 执行 shell 命令，Ctrl+C 退出（自动保存）\n'));

  const context = await initializeChatContext(providerType, modelId, options.resumeMessages);
  await runChatLoop(context);
  await cleanupChat(context);
}

/**
 * 选择 AI 平台
 */
async function selectProvider(providerOption?: string): Promise<ProviderType | null> {
  if (providerOption) {
    if (!PROVIDER_TYPE_LIST.includes(providerOption as ProviderType)) {
      printError(`未知的平台: ${providerOption}`);
      return null;
    }
    return providerOption as ProviderType;
  }

  const defaultProvider = configManager.getDefaultProvider();
  const configuredProviders = PROVIDER_TYPE_LIST.filter(type =>
    !PROVIDER_INFO[type].requiresApiKey || configManager.getApiKey(type)
  );

  if (configuredProviders.length === 0) {
    printError('没有已配置的平台');
    printInfo('请先运行: devflow config init');
    return null;
  }

  if (defaultProvider && configuredProviders.includes(defaultProvider)) {
    printInfo(`使用默认平台: ${PROVIDER_INFO[defaultProvider].displayName}`);
    return defaultProvider;
  }

  if (process.stdin.isTTY) {
    const answer = await inquirer.prompt([{
      type: 'list',
      name: 'provider',
      message: '选择AI平台:',
      choices: configuredProviders.map(type => ({
        name: `${PROVIDER_INFO[type].displayName} (${type})`,
        value: type
      }))
    }]);
    return answer.provider;
  }

  printError('未设置默认平台，请使用 --provider 指定平台');
  return null;
}

/**
 * 选择模型
 */
async function selectModel(providerType: ProviderType, modelOption?: string): Promise<string | null> {
  const providerConfig = configManager.getProviderConfig(providerType);
  const info = PROVIDER_INFO[providerType];
  const defaultModel = providerConfig.defaultModel || info.models[0]?.id;

  if (modelOption) return modelOption;
  if (defaultModel) return defaultModel;

  if (!process.stdin.isTTY) {
    return info.models[0]?.id || 'unknown';
  }

  const { model } = await inquirer.prompt([{
    type: 'list',
    name: 'model',
    message: '选择模型:',
    default: defaultModel,
    choices: info.models.map(m => ({
      name: `${m.name} ($${m.pricing.inputPerMillion}/M tokens)`,
      value: m.id
    }))
  }]);

  return model;
}

/**
 * 初始化对话上下文
 */
async function initializeChatContext(
  providerType: ProviderType,
  modelId: string,
  resumeMessages?: StartChatOptions['resumeMessages']
): Promise<ChatContext> {
  const provider = createProviderInstance(providerType);
  const messages: ChatContext['messages'] = resumeMessages || [];
  const chatParams = getChatParams();
  const memoryConfig = configManager.getMemoryConfig();

  // 加载项目配置
  try {
    const projectConfig = await projectConfigLoader.load(process.cwd());
    if (projectConfig.instructions) {
      console.log(chalk.dim('  已加载项目配置 (DEVFLOW.md)'));
    }
  } catch {
    // 项目配置加载失败不影响主流程
  }

  // 生成会话 ID
  const sessionId = `session-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  setCurrentSession(sessionId, messages);

  // 初始化人格和情绪系统
  const personalityManager = new PersonalityManager();
  const emotionalState = new EmotionalStateManager();
  await personalityManager.load();
  personalityManager.incrementInteractions();

  // 注入人格 system prompt
  if (!resumeMessages) {
    injectPersonalityPrompt(messages, personalityManager);
  }

  return {
    providerType,
    modelId,
    messages,
    sessionId,
    personalityManager,
    emotionalState,
    provider,
    chatParams,
    memoryConfig,
  };
}

/**
 * 注入人格提示
 */
function injectPersonalityPrompt(
  messages: ChatContext['messages'],
  personalityManager: PersonalityManager
): void {
  const personalityPrompt = personalityManager.getPersonalityPrompt();
  const commGuidance = personalityManager.getCommunicationGuidance();
  const codeGuidance = personalityManager.getCodeStyleGuidance();
  const riskGuidance = personalityManager.getRiskGuidance();

  if (personalityPrompt) {
    messages.push({
      role: 'system',
      content: `${personalityPrompt}\n\n沟通风格指导: ${commGuidance}\n代码风格指导: ${codeGuidance}\n风险评估指导: ${riskGuidance}`,
    });
  }
}

/**
 * 运行对话循环
 */
async function runChatLoop(context: ChatContext): Promise<void> {
  const { messages, sessionId, emotionalState, provider, modelId, chatParams, memoryConfig, providerType } = context;

  try {
    while (true) {
      if (!process.stdin.isTTY) {
        printInfo('非交互模式，请使用 chat ask 命令');
        return;
      }

      const userInput = await getUserInput();

      // 处理斜杠命令
      if (userInput.startsWith('/')) {
        const shouldContinue = await handleSlashCommand(userInput, context);
        if (!shouldContinue) break;
        continue;
      }

      // 处理 Bash 命令
      if (userInput.startsWith('!')) {
        await handleBashCommand(userInput, messages);
        continue;
      }

      // 处理用户输入
      await processUserInput(userInput, context);
    }
  } finally {
    setCurrentSession('', []);
  }
}

/**
 * 获取用户输入
 */
async function getUserInput(): Promise<string> {
  const { input } = await inquirer.prompt([{
    type: 'input',
    name: 'input',
    message: chalk.cyan('你:'),
    validate: (v: string) => v.trim() !== '' || '请输入内容'
  }]);
  return input.trim();
}

/**
 * 处理斜杠命令
 */
async function handleSlashCommand(userInput: string, context: ChatContext): Promise<boolean> {
  const { messages, modelId, providerType } = context;

  const result = await executeSlashCommand(userInput, {
    args: '',
    messages,
    modelId,
    providerType,
    setModel: (newModel: string) => { context.modelId = newModel; },
    setProvider: () => {},
  });

  if (result) {
    if (result.message) console.log(result.message);
    if (result.exit) {
      printSuccess('对话已结束');
      return false;
    }
  }
  return true;
}

/**
 * 处理 Bash 命令
 */
async function handleBashCommand(
  userInput: string,
  messages: ChatContext['messages']
): Promise<void> {
  const command = userInput.slice(1).trim();
  if (!command) {
    console.log(chalk.dim('用法: !<shell命令>  例如: !ls -la'));
    return;
  }

  try {
    const parts = command.split(/\s+/);
    const cmd = parts[0];
    const args = parts.slice(1);

    const { stdout, stderr } = await execFileAsync(cmd, args, {
      cwd: process.cwd(),
      timeout: 30000,
      maxBuffer: 10 * 1024 * 1024,
    });

    if (stdout) console.log(stdout);
    if (stderr) console.log(chalk.dim(stderr));

    messages.push(
      { role: 'user', content: `![bash] ${command}` },
      { role: 'assistant', content: `[命令执行结果]\n${stdout || '(无输出)'}${stderr ? '\n' + stderr : ''}` }
    );
  } catch (error: unknown) {
    console.log(chalk.red(`命令执行失败: ${getErrorMessage(error)}`));
  }
}

/**
 * 处理用户输入
 */
async function processUserInput(userInput: string, context: ChatContext): Promise<void> {
  const { messages, sessionId, emotionalState, provider, modelId, chatParams, memoryConfig, providerType } = context;

  // 记忆召回
  if (memoryConfig.enabled && memoryConfig.autoRecall) {
    await injectMemoryContext(messages, userInput);
  }

  messages.push({ role: 'user', content: userInput });
  setCurrentSession(sessionId, messages);

  // 更新情绪状态
  updateEmotionalState(emotionalState, userInput);
  injectEmotionalContext(messages, emotionalState);

  try {
    const fullContent = await streamAIResponse(provider, messages, modelId, chatParams);
    messages.push({ role: 'assistant', content: fullContent });
    setCurrentSession(sessionId, messages);

    // 显示保存提示
    const nonSystemCount = messages.filter(m => m.role !== 'system').length;
    if (nonSystemCount % 10 === 0 && nonSystemCount > 0) {
      console.log(chalk.dim('  💾 对话已自动保存'));
    }

    // 压缩检查
    if (messages.length > chatParams.historyLimit * 2) {
      await compressMessagesIfNeeded(messages, provider, providerType);
    }

    // 保存记忆
    if (memoryConfig.enabled) {
      memoryManager.rememberChat({
        input: userInput,
        output: fullContent,
        provider: providerType,
        model: modelId,
      }).catch((error) => {
        logger.debug({ error }, 'Failed to remember chat');
      });
    }
  } catch (error: unknown) {
    handleAIError(error);
    messages.pop();
  }
}

/**
 * 注入记忆上下文
 */
async function injectMemoryContext(
  messages: ChatContext['messages'],
  userInput: string
): Promise<void> {
  const memoryResults = await memoryManager.recall(userInput, 5);
  if (memoryResults.length === 0) return;

  const memoryContext = memoryResults.map(r =>
    `[${new Date(r.interaction.timestamp).toLocaleString('zh-CN')}]\n用户: ${r.interaction.input}\nAI: ${r.interaction.output.slice(0, 300)}`
  ).join('\n---\n');

  // 移除旧记忆
  const memorySysIdx = messages.findIndex(m =>
    m.role === 'system' && m.content.startsWith('以下是用户之前与你的对话记忆')
  );
  if (memorySysIdx !== -1) messages.splice(memorySysIdx, 1);

  messages.push({
    role: 'system',
    content: `以下是用户之前与你的对话记忆，请参考这些上下文来回答当前问题：\n\n${memoryContext}\n\n请基于以上记忆上下文回答用户的新问题。如果用户问到了之前提过的信息（如名字、偏好等），请直接使用记忆中的信息。`,
  });
}

/**
 * 更新情绪状态
 */
function updateEmotionalState(emotionalState: EmotionalStateManager, userInput: string): void {
  if (/谢谢|感谢|厉害|不错|好的|很好|棒|perfect|great|thanks/i.test(userInput)) {
    emotionalState.onUserPraise(userInput);
  } else if (/不对|错了|不是这样|纠正|修正|wrong|incorrect/i.test(userInput)) {
    emotionalState.onUserCorrection(userInput);
  } else if (/新|挑战|试试|尝试|从零|novel|challenge/i.test(userInput)) {
    emotionalState.onNewChallenge(userInput);
  }
  emotionalState.decay();
}

/**
 * 注入情绪上下文
 */
function injectEmotionalContext(
  messages: ChatContext['messages'],
  emotionalState: EmotionalStateManager
): void {
  const emotionalContext = emotionalState.getEmotionalContext();
  if (!emotionalContext) return;

  const emotionSysIdx = messages.findIndex(m =>
    m.role === 'system' && m.content.startsWith('[当前情绪状态]')
  );
  if (emotionSysIdx !== -1) messages.splice(emotionSysIdx, 1);

  messages.push({ role: 'system', content: emotionalContext });
}

/**
 * 流式获取 AI 响应
 */
async function streamAIResponse(
  provider: BaseProvider,
  messages: ChatContext['messages'],
  modelId: string,
  chatParams: ChatContext['chatParams']
): Promise<string> {
  process.stdout.write(chalk.green('  AI: '));
  let fullContent = '';

  const stream = provider.stream({
    messages,
    model: modelId,
    temperature: chatParams.temperature,
    maxTokens: chatParams.maxTokens,
  });

  for await (const chunk of stream) {
    if (chunk.done) break;
    if (chunk.content) {
      process.stdout.write(chunk.content);
      fullContent += chunk.content;
    }
  }

  console.log('\n');
  return fullContent;
}

/**
 * 处理 AI 错误
 */
function handleAIError(error: unknown): void {
  const errMsg = getErrorMessage(error);
  printError(`\n  请求失败: ${errMsg}`);
  if (errMsg.includes('401')) printInfo('  API Key 可能无效，请运行: devflow config set-key <平台> <apiKey>');
  else if (errMsg.includes('429')) printInfo('  请求频率过高，请稍后重试');
  else if (errMsg.includes('timeout')) printInfo('  请求超时，请检查网络');
  console.log();
}

/**
 * 压缩消息（如果需要）
 */
async function compressMessagesIfNeeded(
  messages: ChatContext['messages'],
  provider: BaseProvider,
  providerType: ProviderType
): Promise<void> {
  try {
    const { CompressionService } = await import('../../services/compression-service.js');
    const adapterFactory: IProviderFactory = {
      getDefaultProvider: () => provider as unknown as import('../../services/interfaces.js').ILLMProvider,
      getProvider: () => provider as unknown as import('../../services/interfaces.js').ILLMProvider,
      listAvailableProviders: () => [providerType],
      isProviderAvailable: () => true,
    };
    const compressionService = new CompressionService(
      adapterFactory,
      configManager as IConfigManager
    );

    if (!compressionService.shouldCompress(messages)) return;

    const nonSystemMessages = messages.filter(m => m.role !== 'system');
    const result = await compressionService.compressMessages(nonSystemMessages);

    if (!result.summary) return;

    const systemMsgs = messages.filter(m => m.role === 'system');
    const recentMsgs = messages.filter(m => m.role !== 'system').slice(-4);

    messages.length = 0;
    messages.push(...systemMsgs);
    messages.push({
      role: 'system',
      content: `[对话历史摘要]\n${result.summary}`,
    });
    messages.push(...recentMsgs);

    console.log(chalk.dim(
      `\n  对话已自动压缩 (${result.originalMessages}条→${messages.length}条, 节省~${result.tokensSaved} tokens)\n`
    ));
  } catch (error) {
    console.log(chalk.dim('  ⚠️ 自动压缩失败，回退到简单截断'));
    console.warn('对话压缩失败:', error instanceof Error ? error.message : String(error));
    messages.splice(0, 2);
  }
}

/**
 * 清理对话资源
 */
async function cleanupChat(context: ChatContext): Promise<void> {
  await context.personalityManager.save().catch((error) => {
    logger.debug({ error }, 'Failed to save personality');
  });
}

export const chatStartCommand = new Command('start')
  .alias('s')
  .description('开始新的对话')
  .option('-p, --provider <provider>', '指定AI平台')
  .option('-m, --model <model>', '指定模型')
  .action(async (options: { provider?: string; model?: string }) => {
    await configManager.init();
    await startInteractiveChat(options);
  });
