import type { ProviderType, ProviderConfig } from '../types.js';
import type { BaseProvider } from '../base.js';
import { OpenAIProvider } from './openai.js';
import { AnthropicProvider } from './anthropic.js';
import { GoogleProvider } from './google.js';
import { DeepSeekProvider } from './deepseek.js';
import { SiliconFlowProvider } from './siliconflow.js';
import { AliyunProvider } from './aliyun.js';
import { ZhipuProvider } from './zhipu.js';
import { BaiduProvider } from './baidu.js';
import { OllamaProvider } from './ollama.js';
import { LMStudioProvider } from './lmstudio.js';

export function createProvider(type: ProviderType, config: ProviderConfig): BaseProvider {
  switch (type) {
    case 'openai':
      return new OpenAIProvider('openai', config);
    case 'anthropic':
      return new AnthropicProvider(config);
    case 'google':
      return new GoogleProvider(config);
    case 'deepseek':
      return new DeepSeekProvider(config);
    case 'siliconflow':
      return new SiliconFlowProvider(config);
    case 'aliyun':
      return new AliyunProvider(config);
    case 'zhipu':
      return new ZhipuProvider(config);
    case 'baidu':
      return new BaiduProvider(config);
    case 'ollama':
      return new OllamaProvider(config);
    case 'lmstudio':
      return new LMStudioProvider(config);
    default:
      throw new Error(`未知的提供商类型: ${type}`);
  }
}

// 显式命名导出（避免 barrel export 问题）
export { OpenAIProvider } from './openai.js';
export { AnthropicProvider } from './anthropic.js';
export { GoogleProvider } from './google.js';
export { DeepSeekProvider } from './deepseek.js';
export { SiliconFlowProvider } from './siliconflow.js';
export { AliyunProvider } from './aliyun.js';
export { ZhipuProvider } from './zhipu.js';
export { BaiduProvider } from './baidu.js';
export { OllamaProvider } from './ollama.js';
export { LMStudioProvider } from './lmstudio.js';
