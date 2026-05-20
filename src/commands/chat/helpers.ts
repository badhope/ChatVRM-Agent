import { configManager } from '../../config/manager.js';
import { createProvider } from '../../providers/index.js';
import { PROVIDER_INFO, PROVIDER_TYPE_LIST, type ProviderType } from '../../types.js';
import { printError, printInfo } from '../../ui/logo.js';

/** 解析平台：从选项或默认配置中确定使用哪个平台 */
export function resolveProvider(options: { provider?: string }): ProviderType | null {
  if (options.provider) {
    if (!PROVIDER_TYPE_LIST.includes(options.provider as ProviderType)) {
      printError(`未知的平台: ${options.provider}`);
      return null;
    }
    return options.provider as ProviderType;
  }
  const defaultProvider = configManager.getDefaultProvider();
  if (!defaultProvider) {
    printError('未设置默认平台，请使用 --provider 指定');
    return null;
  }
  return defaultProvider;
}

/** 检查 API Key 是否已配置，未配置则打印错误并返回 false */
export function checkApiKey(providerType: ProviderType): boolean {
  const providerConfig = configManager.getProviderConfig(providerType);
  if (!providerConfig.apiKey && PROVIDER_INFO[providerType].requiresApiKey) {
    printError(`${PROVIDER_INFO[providerType].displayName} 需要配置API密钥`);
    printInfo(`运行: devflow config set-key ${providerType} <apiKey>`);
    return false;
  }
  return true;
}

/** 创建 provider 实例 */
export function createProviderInstance(providerType: ProviderType, timeout = 30000, maxRetries = 2) {
  const providerConfig = configManager.getProviderConfig(providerType);
  return createProvider(providerType, {
    apiKey: providerConfig.apiKey,
    baseUrl: providerConfig.baseUrl,
    timeout,
    maxRetries,
  });
}

/** 获取聊天配置（缓存单次调用） */
export function getChatParams() {
  const chatConfig = configManager.getChatConfig();
  return {
    temperature: chatConfig.defaultTemperature,
    maxTokens: chatConfig.defaultMaxTokens,
    historyLimit: chatConfig.historyLimit,
  };
}

/** 格式化上下文窗口大小 */
export function formatContext(tokens: number): string {
  if (tokens >= 1000000) return (tokens / 1000000).toFixed(1) + 'M';
  if (tokens >= 1000) return (tokens / 1000).toFixed(0) + 'K';
  return String(tokens);
}
