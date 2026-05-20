// ============================================================
// Memory 服务 - 处理记忆存储和检索
// ============================================================

import { BaseService } from './base.js';
import { injectable, inject } from 'tsyringe';
import { TOKENS } from '../di/tokens.js';
import type { IMemoryManager } from './interfaces.js';

/**
 * 记忆条目
 */
export interface MemoryEntry {
  /** 输入内容 */
  input: string;
  /** 输出内容 */
  output: string;
  /** 提供商 */
  provider: string;
  /** 模型 */
  model: string;
  /** 任务ID（可选） */
  taskId?: string;
  /** 标签（可选） */
  tags?: string[];
}

/**
 * 记忆搜索结果
 */
export interface MemorySearchResult {
  /** 输入内容 */
  input: string;
  /** 输出内容 */
  output: string;
  /** 时间 */
  time: string;
  /** 技能 */
  skill: string;
}

/**
 * Memory 服务
 * 封装记忆存储和检索逻辑
 */
@injectable()
export class MemoryService extends BaseService {
  constructor(
    @inject(TOKENS.MemoryManager) private memory: IMemoryManager
  ) {
    super();
  }

  /**
   * 保存记忆条目
   * @param entry 记忆条目
   */
  async save(entry: MemoryEntry): Promise<void> {
    return this.withErrorHandling('save', async () => {
      await this.memory.rememberChat({
        input: entry.input,
        output: entry.output,
        provider: entry.provider,
        model: entry.model,
        taskId: entry.taskId,
        tags: entry.tags
      });
    });
  }

  /**
   * 搜索记忆
   * @param query 搜索查询
   * @param limit 返回结果数量限制
   * @returns 记忆条目列表
   */
  async search(query: string, limit: number = 10): Promise<MemoryEntry[]> {
    return this.withErrorHandling('search', async () => {
      const records = await this.memory.recall(query, limit);
      return records.map(record => ({
        input: record.interaction.input || '',
        output: record.interaction.output || '',
        provider: record.interaction.skillUsed || 'unknown',
        model: 'unknown'
      }));
    });
  }

  /**
   * 获取最近的记忆
   * @param limit 返回结果数量限制
   * @returns 最近记忆条目列表
   */
  async getRecent(limit: number = 10): Promise<MemorySearchResult[]> {
    return this.withErrorHandling('getRecent', async () => {
      return this.memory.getRecent(limit);
    });
  }

  /**
   * 获取所有记忆记录
   * @returns 所有记忆记录
   */
  async getAll(): Promise<MemoryEntry[]> {
    return this.withErrorHandling('getAll', async () => {
      const records = await this.memory.loadAllRecords();
      return records.map(record => ({
        input: record.input,
        output: record.output,
        provider: record.skillUsed || 'unknown',
        model: 'unknown'
      }));
    });
  }

  /**
   * 清空所有记忆
   */
  async clear(): Promise<void> {
    return this.withErrorHandling('clear', async () => {
      await this.memory.clear();
    });
  }

  /**
   * 获取记忆统计信息
   * @returns 记忆统计
   */
  async getStats(): Promise<{ total: number; size: number }> {
    return this.withErrorHandling('getStats', async () => {
      const stats = await this.memory.getStats();
      return {
        total: stats.totalInteractions,
        size: stats.indexSize
      };
    });
  }
}
