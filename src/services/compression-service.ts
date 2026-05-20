// ============================================================
// 压缩服务 - 使用 LLM 智能压缩对话历史
// ============================================================

import { BaseService } from './base.js';
import { injectable } from 'tsyringe';
import type { IProviderFactory, IConfigManager } from './interfaces.js';

/**
 * 压缩结果
 */
export interface CompressionResult {
  /** 压缩后的摘要 */
  summary: string;
  /** 原始消息数 */
  originalMessages: number;
  /** 压缩后消息数 */
  compressedMessages: number;
  /** 节省的 token 数（估算） */
  tokensSaved: number;
}

/**
 * 压缩服务
 * 使用 LLM 对旧对话消息进行智能摘要压缩
 */
@injectable()
export class CompressionService extends BaseService {
  private providerFactory: IProviderFactory;
  private config: IConfigManager;

  constructor();
  constructor(providerFactory: IProviderFactory, config: IConfigManager);
  constructor(providerFactory?: IProviderFactory, config?: IConfigManager) {
    super();
    this.providerFactory = providerFactory!;
    this.config = config!;
  }

  /**
   * 使用 LLM 对旧对话消息进行摘要压缩
   * @param messages 消息列表
   * @param options 压缩选项
   * @returns 压缩结果
   */
  async compressMessages(
    messages: Array<{ role: string; content: string }>,
    options?: { keepRecent?: number; maxSummaryTokens?: number }
  ): Promise<CompressionResult> {
    const keepRecent = options?.keepRecent ?? 4;
    const maxSummaryTokens = options?.maxSummaryTokens ?? 500;

    if (messages.length <= keepRecent + 1) {
      return {
        summary: '',
        originalMessages: messages.length,
        compressedMessages: messages.length,
        tokensSaved: 0,
      };
    }

    const toCompress = messages.slice(0, -keepRecent);
    const toKeep = messages.slice(-keepRecent);

    // 构建压缩提示词
    const compressionPrompt = `请简洁地总结以下对话历史的关键信息，保留：
1. 用户的主要需求和意图
2. 重要的决策和结论
3. 已完成的操作和待办事项
4. 关键的技术细节和参数

对话历史：
${toCompress.map(m => `[${m.role}]: ${m.content}`).join('\n')}

请用简洁的中文总结（不超过${maxSummaryTokens}字）：`;

    const provider = this.providerFactory.getDefaultProvider();
    if (!provider) {
      throw new Error('没有可用的 AI 提供商');
    }

    const defaultProvider = this.config.getDefaultProvider();
    const providerConfig = defaultProvider
      ? this.config.getProviderConfig(defaultProvider)
      : undefined;
    const defaultModel = providerConfig?.defaultModel || 'gpt-4';

    try {
      const response = await provider.chat({
        messages: [{ role: 'user', content: compressionPrompt }],
        model: defaultModel,
        temperature: 0.3,
        maxTokens: maxSummaryTokens,
      });

      return {
        summary: response.content,
        originalMessages: messages.length,
        compressedMessages: keepRecent + 1,
        tokensSaved: Math.round(
          toCompress.reduce((sum, m) => sum + m.content.length / 4, 0)
        ),
      };
    } catch (error) {
      // LLM 压缩失败时，使用简单截断作为降级方案
      const fallbackSummary = toCompress
        .map(m => `[${m.role}]: ${(m.content || '').substring(0, 100)}`)
        .join('\n');

      return {
        summary: `[压缩降级] 以下为截断的早期对话摘要:\n${fallbackSummary}`,
        originalMessages: messages.length,
        compressedMessages: keepRecent + 1,
        tokensSaved: Math.round(
          toCompress.reduce((sum, m) => sum + m.content.length / 4, 0) * 0.7
        ),
      };
    }
  }

  /**
   * 根据估算的 token 数判断是否需要压缩
   * @param messages 消息列表
   * @param threshold token 阈值（默认 6000）
   * @returns 是否需要压缩
   */
  shouldCompress(
    messages: Array<{ role: string; content: string }>,
    threshold?: number
  ): boolean {
    const totalTokens = messages.reduce(
      (sum, m) => sum + m.content.length / 4,
      0
    );
    return totalTokens > (threshold || 6000);
  }
}
