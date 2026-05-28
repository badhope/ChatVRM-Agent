import 'reflect-metadata';
import { injectable } from 'tsyringe';
import { MEMORY_DIR } from '../utils/index.js';
import { ragModule } from './rag.js';
import {
  MemoryConsolidator,
  type ConsolidationConfig,
  type ConsolidationResult,
} from './consolidation.js';
import fs from 'fs/promises';
import path from 'path';
import type {
  MemoryInteraction,
  MemoryRecord,
  MemoryStats,
} from './memory-types.js';
import { AsyncLock } from '../utils/async-lock.js';
import { createLogger } from '../services/logger.js';
import { CACHE_TTL_MS } from '../constants/index.js';
import { getErrorMessage } from '../utils/error-handling.js';
import { configManager } from '../config/manager.js';

const logger = createLogger('memory');

// Re-export 类型
export type { MemoryInteraction, MemoryRecord, MemoryStats };
export type { ConsolidationConfig, ConsolidationResult };

/**
 * 统一记忆管理器
 * 基于文件系统的对话记忆存储
 */
@injectable()
export class MemoryManager {
  private storagePath: string;
  private initialized = false;
  private ragEnabled: boolean = false;
  private ragInitialized: boolean = false;
  private consolidator: MemoryConsolidator;
  private recordCache: MemoryInteraction[] | null = null;
  private cacheTimestamp: number = 0;
  private initLock = new AsyncLock();
  private cacheLock = new AsyncLock();
  private writeLock = new AsyncLock();

  constructor(consolidationConfig?: Partial<ConsolidationConfig>) {
    this.storagePath = MEMORY_DIR;
    this.consolidator = new MemoryConsolidator(consolidationConfig);
  }

  async init(): Promise<void> {
    await this.initLock.acquire(async () => {
      if (this.initialized) return;
      await fs.mkdir(this.storagePath, { recursive: true });
      this.initialized = true;
    });
  }

  /**
   * 初始化 RAG 模块
   */
  async initRAG(apiKey?: string): Promise<boolean> {
    try {
      // 优先使用传入的 apiKey，其次从当前默认 provider 配置中获取
      const key =
        apiKey ||
        (() => {
          const defaultProvider = configManager.getDefaultProvider();
          if (defaultProvider) {
            const providerConfig = configManager.getProviderConfig(defaultProvider);
            if (providerConfig.apiKey) return providerConfig.apiKey;
          }
          // 向后兼容：仍然检查环境变量
          return process.env.ALIYUN_API_KEY || process.env.DASHSCOPE_API_KEY;
        })();
      if (!key) {
        logger.warn('RAG disabled: no API Key configured for default provider');
        return false;
      }
      await ragModule.init(key);
      this.ragInitialized = true;
      this.ragEnabled = true;
      return true;
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : String(error) },
        'RAG initialization failed'
      );
      return false;
    }
  }

  /**
   * 启用/禁用 RAG 功能
   */
  setRAGEnabled(enabled: boolean): void {
    if (enabled && !this.ragInitialized) {
      logger.warn('RAG not initialized, call initRAG() first');
      return;
    }
    this.ragEnabled = enabled;
  }

  /**
   * 检查 RAG 是否启用
   */
  isRAGEnabled(): boolean {
    return this.ragEnabled && this.ragInitialized;
  }

  /**
   * 记录一次对话交互
   */
  async rememberChat(params: {
    input: string;
    output: string;
    provider: string;
    model: string;
    taskId?: string;
    tags?: string[];
  }): Promise<void> {
    await this.writeLock.acquire(async () => {
      await this.init();

      const id = crypto.randomUUID();
      const record: MemoryInteraction = {
        id,
        taskId: params.taskId || `chat-${Date.now()}`,
        input: params.input,
        output: params.output,
        skillUsed: `chat:${params.provider}:${params.model}`,
        context: { provider: params.provider, model: params.model },
        tags: params.tags || ['chat', params.provider, params.model],
        timestamp: new Date(),
      };

      const filePath = path.join(this.storagePath, `${id}.json`);
      await fs.writeFile(filePath, JSON.stringify(record, null, 2));

      this.recordCache = null; // 使缓存失效

      // 自动索引到 RAG（如果启用）
      if (this.ragEnabled && this.ragInitialized) {
        const text = `${params.input} ${params.output || ''}`;
        await ragModule.addDocument(id, text).catch((err) => {
          logger.warn(
            { error: err instanceof Error ? err.message : String(err) },
            'RAG indexing failed'
          );
        });
      }
    });
  }

  /**
   * 获取所有记忆记录
   */
  async loadAllRecords(): Promise<MemoryInteraction[]> {
    await this.init();
    try {
      const files = await fs.readdir(this.storagePath);
      const jsonFiles = files.filter((f) => f.endsWith('.json'));

      const CONCURRENCY = 50;
      const records: MemoryInteraction[] = [];

      for (let i = 0; i < jsonFiles.length; i += CONCURRENCY) {
        const batch = jsonFiles.slice(i, i + CONCURRENCY);
        const batchResults = await Promise.all(
          batch.map(async (file) => {
            try {
              const data = await fs.readFile(path.join(this.storagePath, file), 'utf-8');
              const record = JSON.parse(data);
              // 验证记录有效性
              if (record.id && record.timestamp && (record.input || record.output)) {
                return record;
              } else {
                // 删除无效记录文件
                await fs.unlink(path.join(this.storagePath, file)).catch((error) => {
                  logger.debug({ error }, 'Failed to delete invalid record file');
                });
                return null;
              }
            } catch (error) {
              logger.debug({ error }, 'Failed to parse record file');
              return null;
            }
          })
        );
        records.push(...(batchResults.filter(Boolean) as MemoryInteraction[]));
      }

      // 应用遗忘曲线衰减重要性
      this.consolidator.applyForgettingCurve(
        records.map((r) => ({
          id: r.id,
          importance: r.importance ?? 0.5,
          createdAt: r.timestamp,
          stability: r.stability,
          accessCount: r.accessCount,
        }))
      );

      // 自动整合：记忆数量超过上限时触发
      const config = this.consolidator.getConfig();
      if (config.autoConsolidateOnLoad && records.length > config.maxShortTermMemories) {
        // 使用 IIFE 正确处理异步错误
        void (async () => {
          try {
            await this.consolidator.runConsolidationCycle(this.storagePath);
          } catch (error: unknown) {
            logger.warn({ error: getErrorMessage(error) }, 'Auto consolidation failed');
          }
        })();
      }

      return records.sort(
        (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );
    } catch (error) {
      logger.debug({ error }, 'Failed to load records');
      return [];
    }
  }

  /**
   * 获取缓存记录（带 TTL）
   */
  private async getCachedRecords(): Promise<MemoryInteraction[]> {
    return this.cacheLock.acquire(async () => {
      const now = Date.now();
      if (this.recordCache && now - this.cacheTimestamp < CACHE_TTL_MS) {
        return this.recordCache;
      }
      this.recordCache = await this.loadAllRecords();
      this.cacheTimestamp = now;
      return this.recordCache;
    });
  }

  /**
   * 根据上下文搜索相关记忆（关键词匹配 + 中文分词 + 语义搜索）
   */
  async recall(context: string, limit = 10): Promise<MemoryRecord[]> {
    const records = await this.getCachedRecords();
    if (!context) {
      return records.slice(0, limit).map((r) => ({ interaction: r, relevance: 1 }));
    }

    // 1. 关键词匹配（始终执行）
    const keywords = this.tokenize(context);
    const keywordScores: Map<string, number> = new Map();

    for (const record of records) {
      const text = `${record.input} ${record.output}`.toLowerCase();
      let score = 0;
      for (const kw of keywords) {
        if (kw.length < 2) continue;
        const occurrences = text.split(kw).length - 1;
        if (occurrences > 0) score += occurrences * (kw.length >= 4 ? 2 : 1);
      }
      keywordScores.set(record.id, score);
    }

    // 2. 语义搜索（如果启用）
    const semanticScores: Map<string, number> = new Map();
    if (this.ragEnabled && this.ragInitialized && ragModule.size() > 0) {
      try {
        const results = await ragModule.search(context, limit * 2);
        for (const result of results) {
          semanticScores.set(result.id, result.score * 10); // 归一化到与关键词分数相近
        }
      } catch (error) {
        logger.warn(
          { error: error instanceof Error ? error.message : String(error) },
          'Semantic search failed, falling back to keyword search'
        );
      }
    }

    // 3. 混合评分
    const MAX_AGE_DAYS = 90; // 超过90天的记忆权重降低

    const scored: MemoryRecord[] = records.map((record) => {
      const keywordScore = keywordScores.get(record.id) || 0;
      const semanticScore = semanticScores.get(record.id) || 0;

      // 混合公式：关键词分数 + 语义分数 * 权重
      // 如果只有关键词，使用关键词分数
      // 如果只有语义，使用语义分数
      // 如果两者都有，加权合并
      let relevance =
        semanticScores.size > 0
          ? keywordScore * 0.4 + semanticScore * 0.6 // 混合模式
          : keywordScore; // 纯关键词模式

      // 添加时间衰减因子（记忆新鲜度检查）
      const ageInDays = this.calculateAgeDays(record.timestamp);
      let freshnessMultiplier = 1;
      if (ageInDays > MAX_AGE_DAYS) {
        freshnessMultiplier = 0.3; // 旧记忆权重降低70%
      } else if (ageInDays > 30) {
        freshnessMultiplier = 0.6; // 30-90天的记忆权重降低40%
      } else if (ageInDays > 7) {
        freshnessMultiplier = 0.8; // 7-30天的记忆权重降低20%
      }

      // 应用新鲜度因子
      relevance = relevance * freshnessMultiplier;

      return { interaction: record, relevance };
    });

    const results = scored
      .filter((r) => r.relevance > 0)
      .sort((a, b) => b.relevance - a.relevance)
      .slice(0, limit);

    // 强化被访问的记忆（模拟复习效果）
    for (const result of results) {
      this.consolidator.reinforceMemory({
        id: result.interaction.id,
        importance: result.interaction.importance ?? result.relevance,
        createdAt: result.interaction.timestamp,
        stability: result.interaction.stability,
        accessCount: result.interaction.accessCount,
      });
    }

    return results;
  }

  /**
   * 运行记忆整合周期
   */
  async consolidate(): Promise<ConsolidationResult> {
    await this.init();
    return this.consolidator.runConsolidationCycle(this.storagePath);
  }

  /**
   * 获取整合器配置
   */
  getConsolidationConfig(): ConsolidationConfig {
    return this.consolidator.getConfig();
  }

  /**
   * 计算年龄天数，带日期验证
   */
  private calculateAgeDays(timestamp: Date | string): number {
    const date = typeof timestamp === 'string' ? new Date(timestamp) : timestamp;
    if (isNaN(date.getTime())) {
      return 0; // 无效日期返回0
    }
    return Math.max(0, (Date.now() - date.getTime()) / 86400000);
  }

  /**
   * 简单分词：英文按空格，中文提取 2-4 字子串
   */
  private tokenize(text: string): string[] {
    const tokens: string[] = [];
    // 英文词
    const englishWords = text.match(/[a-zA-Z0-9]+/g);
    if (englishWords) tokens.push(...englishWords.map((w) => w.toLowerCase()));
    // 中文字符提取 2-4 字子串
    const chineseChars = text.match(/[\u4e00-\u9fa5]+/g);
    if (chineseChars) {
      for (const segment of chineseChars) {
        if (segment.length >= 2) tokens.push(segment); // 整段
        if (segment.length >= 4) {
          // 2字窗口
          for (let i = 0; i <= segment.length - 2; i++) {
            tokens.push(segment.substring(i, i + 2));
          }
        }
      }
    }
    return tokens;
  }

  /**
   * 获取最近对话
   */
  async getRecent(limit = 10): Promise<
    Array<{
      input: string;
      output: string;
      time: string;
      skill: string;
    }>
  > {
    const records = await this.loadAllRecords();
    return records.slice(0, limit).map((r: MemoryInteraction) => ({
      input: r.input || '',
      output: (r.output || '').slice(0, 200),
      time: new Date(r.timestamp).toLocaleString('zh-CN'),
      skill: r.skillUsed,
    }));
  }

  /**
   * 获取记忆统计
   */
  async getStats(): Promise<MemoryStats> {
    const records = await this.loadAllRecords();
    const skillUsage: Record<string, number> = {};
    const today = new Date().toDateString();
    const yesterday = new Date(Date.now() - 86400000).toDateString();
    const uniqueTasks = new Set<string>();
    const skillsUsed = new Set<string>();

    for (const r of records) {
      skillUsage[r.skillUsed] = (skillUsage[r.skillUsed] || 0) + 1;
      if (r.taskId) uniqueTasks.add(r.taskId);
      skillsUsed.add(r.skillUsed);
    }

    return {
      totalInteractions: records.length,
      uniqueTasks: uniqueTasks.size,
      interactionsToday: records.filter((r) => new Date(r.timestamp).toDateString() === today)
        .length,
      interactionsYesterday: records.filter(
        (r) => new Date(r.timestamp).toDateString() === yesterday
      ).length,
      indexSize: Object.keys(skillUsage).length,
      skillUsage,
      skillsUsed: Array.from(skillsUsed),
    };
  }

  /**
   * 清空所有记忆
   */
  async clear(): Promise<void> {
    await this.writeLock.acquire(async () => {
      await this.init();
      this.recordCache = null;
      try {
        const files = await fs.readdir(this.storagePath);
        for (const file of files) {
          if (file.endsWith('.json')) {
            await fs.unlink(path.join(this.storagePath, file));
          }
        }
      } catch (error) {
        logger.debug({ error }, 'Failed to delete some files during clear');
      }
    });
  }
}

// 全局单例
export const memoryManager = new MemoryManager();
