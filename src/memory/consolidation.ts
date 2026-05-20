import * as fs from 'fs/promises';
import * as path from 'path';
import { createLogger } from '../services/logger.js';

const logger = createLogger('MemoryConsolidation');

// ============================================================
// 记忆整合与遗忘曲线系统
// 基于 Ebbinghaus 遗忘曲线: retention = e^(-t/S)
// ============================================================

/** Get error message safely from unknown error */
function getErrorMsg(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export interface ConsolidationConfig {
  enabled: boolean;
  decayFactor: number;              // 每天重要性衰减系数 (0-1, 默认 0.95)
  consolidationThreshold: number;   // 低于此重要性的记忆被整合 (默认 0.3)
  maxShortTermMemories: number;     // 强制整合的记忆数量上限 (默认 500)
  autoConsolidateOnLoad: boolean;   // 加载记忆时自动整合 (默认 true)
}

export interface ConsolidationResult {
  memoriesConsolidated: number;
  memoriesRemoved: number;
  summariesCreated: number;
  patternsExtracted: number;
}

/** 带遗忘曲线属性的记忆条目 */
export interface DecayableMemory {
  id: string;
  importance: number;
  createdAt: Date | string;
  stability?: number;       // 记忆稳定性 S，越高衰减越慢
  accessCount?: number;     // 被访问次数
  lastAccessedAt?: Date | string;
}

const DEFAULT_CONFIG: ConsolidationConfig = {
  enabled: true,
  decayFactor: 0.95,
  consolidationThreshold: 0.3,
  maxShortTermMemories: 500,
  autoConsolidateOnLoad: true,
};

export class MemoryConsolidator {
  private config: ConsolidationConfig;

  constructor(config?: Partial<ConsolidationConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  getConfig(): ConsolidationConfig {
    return { ...this.config };
  }

  /**
   * 应用 Ebbinghaus 遗忘曲线衰减记忆重要性
   * retention = e^(-t/S), 其中 t = 距今天数, S = stability
   * importance = initialImportance * retention
   * 每次访问会增加 stability，使记忆衰减更慢
   */
  applyForgettingCurve(memories: DecayableMemory[]): void {
    if (!this.config.enabled) return;

    const now = Date.now();
    for (const memory of memories) {
      const created = new Date(memory.createdAt).getTime();
      const daysSinceCreation = Math.max(0, (now - created) / 86400000);
      const stability = Math.max(1, memory.stability ?? 7); // 默认稳定性 7 天
      const retention = Math.exp(-daysSinceCreation / stability);
      memory.importance = Math.max(0, Math.min(1, memory.importance * retention));
    }
  }

  /**
   * 强化记忆（被访问时调用）
   * 增加 stability 和 importance，模拟复习效果
   */
  reinforceMemory(memory: DecayableMemory): void {
    const prevStability = memory.stability ?? 7;
    memory.stability = Math.min(365, prevStability * 1.5); // 稳定性增长 50%
    memory.importance = Math.min(1, memory.importance + 0.1);
    memory.accessCount = (memory.accessCount ?? 0) + 1;
    memory.lastAccessedAt = new Date().toISOString();
  }

  /**
   * 整合低重要性记忆为摘要
   * 将相关记忆分组，生成摘要，移除原始记忆
   */
  async consolidate(
    memories: DecayableMemory[],
    memoryManager: { removeMemory: (id: string) => Promise<void>; addSummary: (summary: string, sourceIds: string[]) => Promise<void> },
  ): Promise<ConsolidationResult> {
    const result: ConsolidationResult = {
      memoriesConsolidated: 0,
      memoriesRemoved: 0,
      summariesCreated: 0,
      patternsExtracted: 0,
    };

    // 先应用遗忘曲线
    this.applyForgettingCurve(memories);

    // 找出低重要性记忆
    const lowImportance = memories.filter(
      m => m.importance < this.config.consolidationThreshold,
    );

    if (lowImportance.length === 0) return result;

    // 按标签/类型分组（简单按 id 前缀分组）
    const groups = this.groupMemories(lowImportance);

    for (const group of groups) {
      if (group.length < 2) continue;

      result.memoriesConsolidated += group.length;
      const ids = group.map(m => m.id);

      // 生成摘要
      const summary = this.generateSummary(group);
      await memoryManager.addSummary(summary, ids);
      result.summariesCreated++;

      // 移除原始记忆
      for (const id of ids) {
        await memoryManager.removeMemory(id);
        result.memoriesRemoved++;
      }
    }

    // 提取模式
    const patterns = this.extractPatterns(memories);
    result.patternsExtracted = patterns.length;

    return result;
  }

  /**
   * 从记忆中提取模式
   */
  extractPatterns(memories: DecayableMemory[]): string[] {
    const patterns: string[] = [];
    const tagCounts: Record<string, number> = {};

    for (const memory of memories) {
      // 统计访问频率模式
      if ((memory.accessCount ?? 0) > 3) {
        patterns.push(`高频访问记忆: ${memory.id}`);
      }
      // 统计高稳定性记忆
      if ((memory.stability ?? 0) > 30) {
        patterns.push(`长期稳定记忆: ${memory.id}`);
      }
    }

    // 去重
    return [...new Set(patterns)];
  }

  /**
   * 执行完整整合周期
   */
  async runConsolidationCycle(memoryDir: string): Promise<ConsolidationResult> {
    const emptyResult: ConsolidationResult = {
      memoriesConsolidated: 0, memoriesRemoved: 0,
      summariesCreated: 0, patternsExtracted: 0,
    };

    try {
      const files = await fs.readdir(memoryDir);
      const jsonFiles = files.filter(f => f.endsWith('.json'));

      // 检查是否需要整合
      if (jsonFiles.length < this.config.maxShortTermMemories) {
        return emptyResult;
      }

      // 读取所有记忆
      const memories: DecayableMemory[] = [];
      for (const file of jsonFiles) {
        try {
          const data = await fs.readFile(path.join(memoryDir, file), 'utf-8');
          const record = JSON.parse(data);
          if (record.id && record.timestamp) {
            memories.push({
              id: record.id,
              importance: record.importance ?? 0.5,
              createdAt: record.timestamp,
              stability: record.stability ?? 7,
              accessCount: record.accessCount ?? 0,
              lastAccessedAt: record.lastAccessedAt,
            });
          }
        } catch (error: unknown) {
          logger.warn({ error }, '文件搜索失败');
        }
      }

      // 应用遗忘曲线并过滤
      this.applyForgettingCurve(memories);
      const toRemove = memories.filter(m => m.importance < 0.05);

      // 移除已衰减的记忆
      for (const memory of toRemove) {
        try {
          await fs.unlink(path.join(memoryDir, `${memory.id}.json`));
        } catch (error: unknown) {
          logger.warn({ error }, '模式计数失败');
        }
      }

      return {
        memoriesConsolidated: 0,
        memoriesRemoved: toRemove.length,
        summariesCreated: 0,
        patternsExtracted: this.extractPatterns(memories).length,
      };
    } catch (error: unknown) {
      logger.warn({ error }, '大文件查找失败');
      return emptyResult;
    }
  }

  /** 按简单规则分组记忆 */
  private groupMemories(memories: DecayableMemory[]): DecayableMemory[][] {
    const groups: Map<string, DecayableMemory[]> = new Map();
    // 按创建时间分组（7天为一个周期）
    const WEEK_MS = 7 * 86400000;
    for (const m of memories) {
      const created = new Date(m.createdAt).getTime();
      const weekKey = `week-${Math.floor(created / WEEK_MS)}`;
      const group = groups.get(weekKey) || [];
      group.push(m);
      groups.set(weekKey, group);
    }
    return [...groups.values()].filter(g => g.length >= 2);
  }

  /** 生成记忆摘要 */
  private generateSummary(memories: DecayableMemory[]): string {
    const count = memories.length;
    const avgImportance = memories.reduce((s, m) => s + m.importance, 0) / count;
    const oldest = new Date(Math.min(...memories.map(m => new Date(m.createdAt).getTime())));
    return `[整合摘要] ${count}条记忆, 平均重要性:${avgImportance.toFixed(2)}, 最早:${oldest.toISOString().split('T')[0]}`;
  }
}
