/**
 * 决策仓储基础设施实现
 * 使用 JSON 文件系统进行持久化
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { MEMORY_DIR } from '../../../utils/index.js';
import type { DecisionRepository } from '../../domain/repositories/decision.repository.js';
import type { Decision, Reflection, DecisionStats } from '../../domain/models/decision.model.js';

export class JsonDecisionRepository implements DecisionRepository {
  private decisions: Map<string, Decision> = new Map();
  private reflections: Map<string, Reflection> = new Map();
  private taskDecisions: Map<string, string[]> = new Map();
  private filePath: string;
  private loaded = false;

  constructor(configDir?: string) {
    this.filePath = path.join(configDir || MEMORY_DIR, 'decisions.json');
  }

  async loadAll(): Promise<void> {
    if (this.loaded) return;
    this.loaded = true;

    try {
      const raw = await fs.readFile(this.filePath, 'utf-8');
      const data = JSON.parse(raw);

      this.decisions = new Map(
        (data.decisions || []).map(([k, v]: [string, Decision]) => [k, this.reviveDates(v)])
      );
      this.reflections = new Map(
        (data.reflections || []).map(([k, v]: [string, Reflection]) => [k, this.reviveDates(v)])
      );
      this.taskDecisions = new Map(data.taskDecisions || []);
    } catch (error) {
      // 首次运行，尚无数据
    }
  }

  async saveAll(): Promise<void> {
    try {
      await fs.mkdir(path.dirname(this.filePath), { recursive: true });
      const data = {
        decisions: Array.from(this.decisions.entries()),
        reflections: Array.from(this.reflections.entries()),
        taskDecisions: Array.from(this.taskDecisions.entries()),
      };
      await fs.writeFile(this.filePath, JSON.stringify(data, null, 2));
    } catch (error) {
      // 持久化失败不应影响主流程
    }
  }

  private reviveDates<T>(obj: T): T {
    if (obj === null || typeof obj !== 'object') return obj;
    if (obj instanceof Date) return obj as T;
    if (Array.isArray(obj)) {
      return obj.map((item) => this.reviveDates(item)) as T;
    }
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      result[key] =
        typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value)
          ? new Date(value)
          : this.reviveDates(value);
    }
    return result as T;
  }

  async saveDecision(decision: Decision): Promise<void> {
    this.decisions.set(decision.id, decision);
    const taskDecisionIds = this.taskDecisions.get(decision.taskId);
    if (taskDecisionIds) {
      taskDecisionIds.push(decision.id);
    } else {
      this.taskDecisions.set(decision.taskId, [decision.id]);
    }
  }

  async getDecision(id: string): Promise<Decision | null> {
    return this.decisions.get(id) || null;
  }

  async getDecisionsByTask(taskId: string): Promise<Decision[]> {
    const decisionIds = this.taskDecisions.get(taskId) || [];
    return decisionIds
      .map((id) => this.decisions.get(id))
      .filter((d): d is Decision => d !== undefined);
  }

  async saveReflection(reflection: Reflection): Promise<void> {
    this.reflections.set(reflection.id, reflection);
  }

  async getReflection(id: string): Promise<Reflection | null> {
    return this.reflections.get(id) || null;
  }

  async getReflectionsByTask(taskId: string): Promise<Reflection[]> {
    return Array.from(this.reflections.values()).filter((r) => r.taskId === taskId);
  }

  async getStats(): Promise<DecisionStats> {
    const decisions = Array.from(this.decisions.values());
    const completed = decisions.filter((d) => d.outcome !== undefined);
    const successful = completed.filter((d) => d.outcome?.success ?? false);
    const categoryCounts: Record<string, number> = {};

    for (const decision of decisions) {
      const category = this.inferCategory(decision);
      categoryCounts[category] = (categoryCounts[category] || 0) + 1;
    }

    const topPatterns = Object.entries(categoryCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([pattern, count]) => ({ pattern, count }));

    return {
      totalDecisions: decisions.length,
      successRate: completed.length > 0 ? successful.length / completed.length : 0,
      averageConfidence:
        decisions.length > 0
          ? decisions.reduce((sum, d) => sum + d.confidence, 0) / decisions.length
          : 0,
      topPatterns,
    };
  }

  private inferCategory(decision: Decision): string {
    const keywords = decision.description.toLowerCase();
    if (keywords.includes('tool') || keywords.includes('工具')) return 'tool';
    if (keywords.includes('skill') || keywords.includes('技能')) return 'skill';
    if (keywords.includes('workflow') || keywords.includes('流程')) return 'workflow';
    if (keywords.includes('process') || keywords.includes('过程')) return 'process';
    return 'other';
  }
}
