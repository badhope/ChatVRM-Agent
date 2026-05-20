import { MEMORY_DIR } from '../utils/index.js';
import { MemoryManager } from './manager.js';
import fs from 'fs/promises';
import path from 'path';
import type { MemoryInsight, ReflectionReport } from './reflection-rules.js';
import { ReflectionEngine } from './reflection-rules.js';
import { MAX_INSIGHTS_COUNT } from '../constants/index.js';

// Re-export 类型
export type { MemoryInsight, ReflectionReport };

/**
 * 记忆摘要与反思模块
 * 定期从记忆中提炼高层次认知，减少噪音
 */
export class MemoryReflector {
  private storagePath: string;
  private insights: MemoryInsight[] = [];
  private reports: ReflectionReport[] = [];
  private memoryManager: MemoryManager;

  constructor(memoryManager: MemoryManager) {
    this.storagePath = MEMORY_DIR;
    this.memoryManager = memoryManager;
  }

  async init(): Promise<void> {
    await fs.mkdir(this.storagePath, { recursive: true });
    await this.load();
  }

  private async load(): Promise<void> {
    try {
      const data = await fs.readFile(path.join(this.storagePath, 'insights.json'), 'utf-8');
      const parsed = JSON.parse(data);
      this.insights = parsed.insights || [];
      this.reports = parsed.reports || [];
    } catch (error) {
      // First time use - no insights file yet
    }
  }

  private async save(): Promise<void> {
    await fs.writeFile(
      path.join(this.storagePath, 'insights.json'),
      JSON.stringify({ insights: this.insights, reports: this.reports }, null, 2)
    );
  }

  /**
   * 执行反思：从所有记忆中提炼洞察
   */
  async reflect(): Promise<ReflectionReport> {
    await this.init();

    // 加载所有记忆
    const records = await this.memoryManager.loadAllRecords();
    if (records.length === 0) {
      return {
        id: crypto.randomUUID(),
        createdAt: Date.now(),
        totalMemories: 0,
        insightsGenerated: 0,
        insights: [],
      };
    }

    // 生成新洞察
    const memories = records.map(r => ({
      id: r.id,
      input: r.input,
      output: r.output,
      timestamp: new Date(r.timestamp).toLocaleString('zh-CN'),
    }));

    const engine = new ReflectionEngine();
    const newInsights = engine.reflectWithStats(memories);

    // 去重：与已有洞察比较，相似内容不重复添加
    for (const insight of newInsights) {
      const isDuplicate = this.insights.some(existing =>
        existing.type === insight.type &&
        existing.content === insight.content
      );
      if (!isDuplicate) {
        this.insights.push(insight);
      }
    }

    // 更新访问计数
    for (const insight of this.insights) {
      for (const newInsight of newInsights) {
        if (newInsight.sourceIds.some(id => insight.sourceIds.includes(id))) {
          insight.accessCount++;
          insight.accessedAt = Date.now();
        }
      }
    }

    // 保留最近 MAX_INSIGHTS_COUNT 条洞察
    if (this.insights.length > MAX_INSIGHTS_COUNT) {
      this.insights.sort((a, b) => b.createdAt - a.createdAt);
      this.insights = this.insights.slice(0, MAX_INSIGHTS_COUNT);
    }

    const report: ReflectionReport = {
      id: crypto.randomUUID(),
      createdAt: Date.now(),
      totalMemories: records.length,
      insightsGenerated: newInsights.length,
      insights: newInsights,
    };

    this.reports.push(report);
    // 保留最近 20 份报告
    if (this.reports.length > 20) {
      this.reports = this.reports.slice(-20);
    }

    await this.save();
    return report;
  }

  /**
   * 获取所有洞察
   */
  getInsights(type?: string): MemoryInsight[] {
    if (!type) return this.insights;
    return this.insights.filter(i => i.type === type);
  }

  /**
   * 获取上下文摘要（用于注入 system prompt）
   */
  async getContextSummary(): Promise<string> {
    await this.init();
    if (this.insights.length === 0) return '';

    // 按类型优先级排序：fact > preference > pattern > summary
    const priority = { fact: 0, preference: 1, pattern: 2, summary: 3 };
    const sorted = [...this.insights].sort((a, b) =>
      (priority[a.type] || 9) - (priority[b.type] || 9)
    );

    const lines = sorted.slice(0, 10).map(i => i.content);
    return lines.join('\n');
  }

  /**
   * 获取反思报告
   */
  getReports(): ReflectionReport[] {
    return this.reports;
  }

  /**
   * 清空所有洞察
   */
  async clear(): Promise<void> {
    this.insights = [];
    this.reports = [];
    await this.save();
  }
}
