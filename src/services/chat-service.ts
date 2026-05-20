// ============================================================
// Chat 服务 - 处理 AI 对话相关逻辑
// ============================================================

import { BaseService } from './base.js';
import { injectable, inject } from 'tsyringe';
import { TOKENS } from '../di/tokens.js';
import type { IConfigManager, IProviderFactory } from './interfaces.js';

/**
 * 聊天消息
 */
export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

/**
 * 聊天选项
 */
export interface ChatOptions {
  /** 模型ID */
  model?: string;
  /** 温度参数 */
  temperature?: number;
  /** 最大Token数 */
  maxTokens?: number;
  /** 是否流式输出 */
  stream?: boolean;
}

/**
 * 聊天结果
 */
export interface ChatResult {
  /** 回复内容 */
  content: string;
  /** Token使用情况 */
  usage: {
    promptTokens: number;
    completionTokens: number;
  };
}

/**
 * Chat 服务
 * 封装与 AI 提供商的对话逻辑
 */
@injectable()
export class ChatService extends BaseService {
  constructor(
    @inject(TOKENS.ConfigManager) private config: IConfigManager,
    @inject(TOKENS.ProviderFactory) private providerFactory: IProviderFactory
  ) {
    super();
  }

  /**
   * 发送聊天请求
   * @param messages 消息列表
   * @param options 聊天选项
   * @returns 聊天结果
   */
  async chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResult> {
    return this.withErrorHandling('chat', async () => {
      const provider = this.providerFactory.getDefaultProvider();
      if (!provider) {
        throw new Error('没有可用的 AI 提供商，请先配置');
      }

      const defaultProvider = this.config.getDefaultProvider();
      const providerConfig = defaultProvider
        ? this.config.getProviderConfig(defaultProvider)
        : undefined;
      const defaultModel = providerConfig?.defaultModel;

      const response = await provider.chat({
        messages,
        model: options?.model || defaultModel || 'gpt-4',
        temperature: options?.temperature ?? 0.7,
        maxTokens: options?.maxTokens ?? 4000
      });

      return {
        content: response.content,
        usage: {
          promptTokens: response.usage?.promptTokens ?? 0,
          completionTokens: response.usage?.completionTokens ?? 0
        }
      };
    });
  }

  /**
   * 流式聊天请求
   * @param messages 消息列表
   * @param options 聊天选项
   * @returns 内容生成器
   */
  async *streamChat(messages: ChatMessage[], options?: ChatOptions): AsyncGenerator<string> {
    const provider = this.providerFactory.getDefaultProvider();
    if (!provider) {
      throw new Error('没有可用的 AI 提供商，请先配置');
    }

    const defaultProvider = this.config.getDefaultProvider();
    const providerConfig = defaultProvider
      ? this.config.getProviderConfig(defaultProvider)
      : undefined;
    const defaultModel = providerConfig?.defaultModel;

    const stream = provider.stream({
      messages,
      model: options?.model || defaultModel || 'gpt-4',
      temperature: options?.temperature ?? 0.7,
      maxTokens: options?.maxTokens ?? 4000
    });

    for await (const chunk of stream) {
      if (chunk.content) {
        yield chunk.content;
      }
    }
  }

  /**
   * 获取可用的提供商列表
   * @returns 提供商类型数组
   */
  listAvailableProviders(): string[] {
    return this.providerFactory.listAvailableProviders();
  }

  /**
   * 检查提供商是否可用
   * @param type 提供商类型
   * @returns 是否可用
   */
  isProviderAvailable(type: string): boolean {
    const validProviders = ['openai', 'anthropic', 'google', 'siliconflow', 'aliyun', 'zhipu', 'baidu', 'deepseek', 'ollama', 'lmstudio'];
    if (!validProviders.includes(type)) return false;
    return this.providerFactory.isProviderAvailable(type as import('../types.js').ProviderType);
  }
}
