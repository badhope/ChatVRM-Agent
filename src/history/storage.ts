import fs from 'fs/promises';
import path from 'path';
import { configManager } from '../config/manager.js';
import type { Session, SessionSummary } from './types.js';

export class HistoryStorage {
  private historyDir: string;

  constructor() {
    this.historyDir = '';
  }

  async init(): Promise<void> {
    const configPath = configManager.getConfigPath();
    this.historyDir = path.join(path.dirname(configPath), 'history');
    await fs.mkdir(this.historyDir, { recursive: true });
  }

  private getSessionPath(sessionId: string): string {
    return path.join(this.historyDir, `${sessionId}.json`);
  }

  async saveSession(session: Session): Promise<void> {
    const filePath = this.getSessionPath(session.id);
    await fs.writeFile(filePath, JSON.stringify(session, null, 2));
  }

  async loadSession(sessionId: string): Promise<Session | null> {
    try {
      const filePath = this.getSessionPath(sessionId);
      const data = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(data) as Session;
    } catch {
      return null;
    }
  }

  async deleteSession(sessionId: string): Promise<void> {
    try {
      const filePath = this.getSessionPath(sessionId);
      await fs.unlink(filePath);
    } catch {
      // 文件不存在，忽略错误
    }
  }

  async listSessions(): Promise<SessionSummary[]> {
    try {
      const files = await fs.readdir(this.historyDir);
      const jsonFiles = files.filter(f => f.endsWith('.json'));

      // 并发读取所有文件
      const results = await Promise.all(
        jsonFiles.map(async (file) => {
          const sessionId = file.replace('.json', '');
          try {
            const filePath = this.getSessionPath(sessionId);
            const data = await fs.readFile(filePath, 'utf-8');
            const session = JSON.parse(data) as Session;
            return {
              id: session.id,
              title: session.title,
              createdAt: session.createdAt,
              updatedAt: session.updatedAt,
              messageCount: session.metadata.messageCount,
              preview: this.generatePreview(session),
            } as SessionSummary;
          } catch {
            return null;
          }
        })
      );

      // 过滤无效结果，按更新时间排序
      return results
        .filter((s): s is SessionSummary => s !== null)
        .sort((a, b) => b.updatedAt - a.updatedAt);
    } catch {
      return [];
    }
  }

  async clearAllSessions(): Promise<void> {
    try {
      const files = await fs.readdir(this.historyDir);
      for (const file of files) {
        if (file.endsWith('.json')) {
          await fs.unlink(path.join(this.historyDir, file));
        }
      }
    } catch {
      // 忽略错误
    }
  }

  private generatePreview(session: Session): string {
    const firstUserMessage = session.messages.find(m => m.role === 'user');
    if (firstUserMessage) {
      return firstUserMessage.content.slice(0, 100) + (firstUserMessage.content.length > 100 ? '...' : '');
    }
    return '无预览';
  }
}

export const historyStorage = new HistoryStorage();
