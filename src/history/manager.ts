import 'reflect-metadata';
import { injectable } from 'tsyringe';
import { v4 as uuidv4 } from 'uuid';
import { historyStorage } from './storage.js';
import type { Session, Message, SessionSummary, HistoryConfig } from './types.js';
import { DEFAULT_HISTORY_CONFIG } from './types.js';
import { configManager } from '../config/manager.js';

/**
 * 历史记录管理器
 * 管理对话会话的历史记录
 */
@injectable()
export class HistoryManager {
  private config: HistoryConfig;
  private currentSession: Session | null = null;

  constructor() {
    this.config = DEFAULT_HISTORY_CONFIG;
  }

  async init(): Promise<void> {
    await historyStorage.init();
    const chatConfig = configManager.getChatConfig();
    this.config = {
      ...DEFAULT_HISTORY_CONFIG,
      enabled: chatConfig.saveHistory,
      maxMessagesPerSession: chatConfig.historyLimit,
    };
  }

  // 创建新会话
  createSession(title?: string): Session {
    const now = Date.now();
    const session: Session = {
      id: uuidv4(),
      title: title || '新会话',
      createdAt: now,
      updatedAt: now,
      messages: [],
      metadata: {
        totalTokens: 0,
        totalCost: 0,
        messageCount: 0,
      },
    };

    this.currentSession = session;
    return session;
  }

  // 加载已有会话
  async loadSession(sessionId: string): Promise<Session | null> {
    const session = await historyStorage.loadSession(sessionId);
    if (session) {
      this.currentSession = session;
    }
    return session;
  }

  // 添加消息到当前会话
  addMessage(message: Omit<Message, 'timestamp'>): void {
    if (!this.currentSession) {
      this.createSession();
    }

    if (!this.config.enabled || !this.currentSession) return;

    const fullMessage: Message = {
      ...message,
      timestamp: Date.now(),
    };

    this.currentSession.messages.push(fullMessage);
    this.currentSession.metadata.messageCount = this.currentSession.messages.length;

    // 更新Token和成本统计
    if (message.metadata?.tokens) {
      this.currentSession.metadata.totalTokens += message.metadata.tokens;
    }
    if (message.metadata?.cost) {
      this.currentSession.metadata.totalCost += message.metadata.cost;
    }

    // 限制消息数量
    if (this.currentSession.messages.length > this.config.maxMessagesPerSession) {
      // 保留系统消息和最近的消息
      const systemMessages = this.currentSession.messages.filter(m => m.role === 'system');
      const recentMessages = this.currentSession.messages.slice(-this.config.maxMessagesPerSession + systemMessages.length);
      this.currentSession.messages = [...systemMessages, ...recentMessages];
    }

    this.currentSession.updatedAt = Date.now();

    // 自动生成标题
    if (this.config.autoTitle && this.currentSession.title === '新会话' && message.role === 'user') {
      this.currentSession.title = this.generateTitle(message.content);
    }

    // 自动保存
    if (this.config.autoSave) {
      this.saveCurrentSession();
    }
  }

  // 保存当前会话
  async saveCurrentSession(): Promise<void> {
    if (this.currentSession && this.config.enabled) {
      await historyStorage.saveSession(this.currentSession);
      // 检查会话数量限制
      await this.enforceMaxSessions();
    }
  }

  // 强制执行会话数量上限
  private async enforceMaxSessions(): Promise<void> {
    if (!this.config.maxSessions || this.config.maxSessions <= 0) return;
    const sessions = await historyStorage.listSessions();
    if (sessions.length > this.config.maxSessions) {
      // 按更新时间排序，删除最旧的
      const toDelete = sessions
        .sort((a, b) => a.updatedAt - b.updatedAt)
        .slice(0, sessions.length - this.config.maxSessions);
      for (const session of toDelete) {
        await historyStorage.deleteSession(session.id);
      }
    }
  }

  // 获取当前会话
  getCurrentSession(): Session | null {
    return this.currentSession;
  }

  // 获取当前会话的消息（用于API调用）
  getMessagesForApi(): Array<{ role: string; content: string }> {
    if (!this.currentSession) return [];
    return this.currentSession.messages.map(m => ({
      role: m.role,
      content: m.content,
    }));
  }

  // 列出所有会话摘要
  async listSessions(): Promise<SessionSummary[]> {
    return historyStorage.listSessions();
  }

  // 删除会话
  async deleteSession(sessionId: string): Promise<void> {
    await historyStorage.deleteSession(sessionId);
    if (this.currentSession?.id === sessionId) {
      this.currentSession = null;
    }
  }

  // 清空所有历史
  async clearAllHistory(): Promise<void> {
    await historyStorage.clearAllSessions();
    this.currentSession = null;
  }

  // 设置会话标题
  async setSessionTitle(sessionId: string, title: string): Promise<void> {
    const session = await historyStorage.loadSession(sessionId);
    if (session) {
      session.title = title;
      session.updatedAt = Date.now();
      await historyStorage.saveSession(session);

      if (this.currentSession?.id === sessionId) {
        this.currentSession.title = title;
      }
    }
  }

  // 更新配置
  updateConfig(config: Partial<HistoryConfig>): void {
    this.config = { ...this.config, ...config };
  }

  // 获取配置
  getConfig(): HistoryConfig {
    return { ...this.config };
  }

  // 生成标题（基于第一条用户消息）
  private generateTitle(content: string): string {
    // 提取前20个字符作为标题
    const title = content.slice(0, 30).replace(/\n/g, ' ');
    return title + (content.length > 30 ? '...' : '');
  }
}

export const historyManager = new HistoryManager();
