import type { Message } from '../types.js';
import { createLogger } from '../services/logger.js';

const contextLogger = createLogger('context-manager');

export interface ContextMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
  timestamp: number;
  importance?: number; // 0-1，用于智能截断
}

/**
 * 压缩结果（本地定义，避免循环依赖）
 */
interface CompressedSummary {
  summary: string;
  originalMessages: number;
  compressedMessages: number;
  tokensSaved: number;
}

export class ContextManager {
  private messages: ContextMessage[] = [];
  private maxTokens: number;
  private currentTokens: number = 0;
  private compressionAttempted: boolean = false;
  
  constructor(maxTokens: number = 8000) {
    this.maxTokens = maxTokens;
  }
  
  // 估算token数（简单估算：中文1字≈1token，英文1词≈1token）
  private estimateTokens(text: string): number {
    const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
    const englishWords = text.split(/\s+/).filter(w => /[a-zA-Z]/.test(w)).length;
    return chineseChars + englishWords + Math.ceil(text.length / 4);
  }
  
  async addMessage(message: Omit<ContextMessage, 'timestamp'>): Promise<void> {
    const msg: ContextMessage = {
      ...message,
      timestamp: Date.now(),
    };
    
    const tokens = this.estimateTokens(msg.content);
    
    // 如果单条消息就超过限制，进行截断
    if (tokens > this.maxTokens * 0.5) {
      msg.content = this.truncateContent(msg.content, Math.floor(this.maxTokens * 0.5));
    }
    
    this.messages.push(msg);
    this.currentTokens += this.estimateTokens(msg.content);
    
    // 触发窗口管理
    await this.enforceWindowLimit();
  }
  
  private truncateContent(content: string, maxTokens: number): string {
    // 保留开头和结尾，中间用省略号
    const halfTokens = Math.floor(maxTokens / 2);
    const chars = content.length;
    const ratio = halfTokens / this.estimateTokens(content);
    const halfChars = Math.floor(chars * ratio);
    
    if (halfChars < 100) return content.slice(0, maxTokens) + '...(已截断)';
    
    return content.slice(0, halfChars) + '\n...(中间内容已省略)...\n' + 
           content.slice(-halfChars);
  }
  
  /**
   * 尝试使用 CompressionService 压缩旧消息
   * 在丢弃消息之前先尝试 AI 摘要压缩
   */
  private async tryCompressMessages(): Promise<boolean> {
    if (this.compressionAttempted) return false;
    this.compressionAttempted = true;

    try {
      const { CompressionService } = await import('../services/compression-service.js');
      const { configManager } = await import('../config/manager.js');
      const { createProviderInstance } = await import('../commands/chat/helpers.js');

      const defaultProvider = configManager.getDefaultProvider();
      if (!defaultProvider) return false;

      const provider = createProviderInstance(defaultProvider);
      const adapterFactory = {
        getDefaultProvider: () => provider,
        getProvider: () => provider,
        listAvailableProviders: () => [defaultProvider],
        isProviderAvailable: () => true,
      };

      const compressionService = new CompressionService(
        adapterFactory as import('../services/interfaces.js').IProviderFactory,
        configManager as import('../services/interfaces.js').IConfigManager
      );

      const nonSystemMessages = this.messages.filter(m => m.role !== 'system');
      if (nonSystemMessages.length <= 4) return false;

      // === 上下文保护：识别并保留关键约束消息 ===
      const CRITICAL_PATTERNS = [
        /不要|不能|禁止|不允许|必须|只能|不要删除|不要修改|不要创建/,
        /no.*delete|no.*modify|no.*create|never|always|must not|must only/,
        /安全|危险|紧急|重要|critical|important|security|danger/,
      ];

      const protectedMessages: typeof nonSystemMessages = [];
      const compressibleMessages: typeof nonSystemMessages = [];

      for (const msg of nonSystemMessages) {
        const isCritical = CRITICAL_PATTERNS.some(p => p.test(msg.content || ''));

        if (isCritical && msg.role !== 'system') {
          protectedMessages.push(msg);
        } else {
          compressibleMessages.push(msg);
        }
      }

      // 优先保留受保护的消息
      const keepRecent = 4;
      const protectedCount = protectedMessages.length;
      const toCompress = compressibleMessages.slice(0, -keepRecent);
      const toKeep = [...protectedMessages, ...compressibleMessages.slice(-keepRecent)];

      // 构建压缩提示词时，告知LLM这些是关键约束不能丢失
      const compressionPrompt = `请简洁地总结以下对话历史的关键信息，同时特别注意：
1. 用户的关键约束和限制（如"不要删除文件"）
2. 重要的安全和权限要求
3. 任何被明确禁止的操作

关键约束（必须原样保留在摘要中）：
${protectedMessages.map(m => `[${m.role}]: ${m.content}`).join('\n')}

对话历史：
${toCompress.map(m => `[${m.role}]: ${m.content}`).join('\n')}

请用简洁的中文总结（不超过300字），确保摘要包含所有关键约束：`;

      // 使用 CompressionService 压缩消息
      const compressResult = await compressionService.compressMessages(
        [
          ...toCompress.map(m => ({ role: m.role, content: m.content })),
          { role: 'user', content: compressionPrompt }
        ],
        {
          keepRecent: 4,
          maxSummaryTokens: 300,
        }
      );

      const result: CompressedSummary = {
        summary: compressResult.summary,
        originalMessages: compressResult.originalMessages,
        compressedMessages: compressResult.compressedMessages,
        tokensSaved: compressResult.tokensSaved,
      };

      if (result.summary) {
        const systemMsgs = this.messages.filter(m => m.role === 'system');

        this.messages = [];
        this.currentTokens = 0;

        for (const msg of systemMsgs) {
          this.messages.push(msg);
          this.currentTokens += this.estimateTokens(msg.content);
        }

        const summaryMsg: ContextMessage = {
          role: 'system',
          content: `[对话历史摘要]\n${result.summary}`,
          timestamp: Date.now(),
          importance: 0.9,
        };
        this.messages.push(summaryMsg);
        this.currentTokens += this.estimateTokens(summaryMsg.content);

        // 保留受保护的消息和最近的消息
        for (const msg of toKeep) {
          this.messages.push(msg);
          this.currentTokens += this.estimateTokens(msg.content);
        }

        return true;
      }
    } catch (error) {
      contextLogger.debug({ error: error instanceof Error ? error.message : String(error) },
        'Compression failed, falling back to simple truncation');
    }

    return false;
  }

  private async enforceWindowLimit(): Promise<void> {
    // 先尝试 AI 压缩
    if (this.currentTokens > this.maxTokens && this.messages.length > 6 && !this.compressionAttempted) {
      this.compressionAttempted = true;
      try {
        const compressed = await this.tryCompressMessages();
        if (!compressed) {
          this.dropOldMessages();
        }
        // 压缩成功后重置标记，允许后续再次压缩
        this.compressionAttempted = false;
      } catch (error) {
        contextLogger.debug({ error: error instanceof Error ? error.message : String(error) },
          'Window limit enforcement failed, falling back to drop');
        this.dropOldMessages();
        this.compressionAttempted = false;
      }
      return;
    }

    // 已经尝试过压缩或消息太少，直接丢弃
    if (this.currentTokens > this.maxTokens && this.messages.length > 2) {
      this.dropOldMessages();
    }
  }

  /**
   * 丢弃旧消息（原始回退逻辑）
   */
  private dropOldMessages(): void {
    while (this.currentTokens > this.maxTokens && this.messages.length > 2) {
      // 优先移除最旧的非系统消息
      const removableIndex = this.messages.findIndex((m, i) => 
        i > 0 && m.role !== 'system' && (m.importance || 0.5) < 0.8
      );
      
      const indexToRemove = removableIndex !== -1 ? removableIndex : 1;
      const removed = this.messages.splice(indexToRemove, 1)[0];
      this.currentTokens -= this.estimateTokens(removed.content);
    }
  }
  
  getContext(): Message[] {
    return this.messages.map(m => ({
      role: m.role,
      content: m.content,
    }));
  }
  
  getTokenCount(): number {
    return this.currentTokens;
  }
  
  clear(): void {
    this.messages = [];
    this.currentTokens = 0;
    this.compressionAttempted = false;
  }
  
  // 添加工具执行结果，自动提取关键信息
  async addToolResult(toolName: string, result: string, success: boolean): Promise<void> {
    const importance = success ? 0.6 : 0.9; // 失败结果更重要
    const summary = result.length > 500 
      ? result.slice(0, 250) + '...(已截断)' + result.slice(-250)
      : result;
    
    await this.addMessage({
      role: 'system',
      content: `[工具执行: ${toolName}]\n${summary}`,
      importance,
    });
  }
}
