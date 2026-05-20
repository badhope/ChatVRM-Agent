/**
 * 决策反思器模块
 *
 * 提供 Agent 决策的记录、反思和改进建议能力，包括：
 * 1. 决策记录 - 记录每次决策的上下文、备选方案和选择理由
 * 2. 结果追踪 - 追踪决策的实际执行结果
 * 3. 任务反思 - 对任务执行过程进行综合反思
 * 4. 改进建议 - 基于历史决策生成改进建议
 * 5. 持久化存储 - 跨会话保存决策历史
 */

import path from 'path';
import fs from 'fs/promises';
import { MEMORY_DIR } from '../utils/index.js';
import { createLogger } from '../services/logger.js';

const logger = createLogger('DecisionReflector');

import type {
  Decision,
  Alternative,
  DecisionOutcome,
  Reflection,
  ImprovementSuggestion,
  ReflectionQuery,
  DecisionStats,
} from './decision-types.js';

export type {
  Decision,
  Alternative,
  DecisionOutcome,
  Reflection,
  ImprovementSuggestion,
  ReflectionQuery,
  DecisionStats,
};

export class DecisionReflector {
  private decisions: Map<string, Decision> = new Map();
  private reflections: Map<string, Reflection> = new Map();
  private taskDecisions: Map<string, string[]> = new Map();
  private filePath: string;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private loaded = false;

  constructor(configDir?: string) {
    this.filePath = path.join(configDir || MEMORY_DIR, 'decisions.json');
  }

  /** 从磁盘加载持久化的决策数据（幂等，仅首次执行） */
  async load(): Promise<void> {
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
      // 首次运行，尚无数据 - 使用 debug 级别日志
      logger.debug({ error: error instanceof Error ? error.message : String(error) }, 'No existing decision data to load');
    }
  }

  /** 将当前所有内存数据持久化到磁盘 */
  async save(): Promise<void> {
    try {
      await fs.mkdir(path.dirname(this.filePath), { recursive: true });
      const data = {
        decisions: Array.from(this.decisions.entries()),
        reflections: Array.from(this.reflections.entries()),
        taskDecisions: Array.from(this.taskDecisions.entries()),
      };
      await fs.writeFile(this.filePath, JSON.stringify(data, null, 2));
    } catch (error) {
      // 持久化失败不应影响主流程，使用 debug 级别日志记录
      logger.debug({ error: error instanceof Error ? error.message : String(error) }, 'Failed to save decision reflector data');
    }
  }

  /** 防抖保存：最多每秒保存一次 */
  private debouncedSave(): void {
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      void this.save();
    }, 1000);
  }

  /** 递归恢复 JSON 中字符串形式的 Date 对象 */
  private reviveDates<T>(obj: T): T {
    if (obj === null || typeof obj !== 'object') return obj;
    if (obj instanceof Date) return obj as T;
    if (Array.isArray(obj)) {
      // Safe array mapping with proper type inference
      return obj.map(item => this.reviveDates(item)) as T;
    }
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      result[key] = (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value))
        ? new Date(value)
        : this.reviveDates(value);
    }
    return result as T;
  }

  async recordDecision(
    taskId: string,
    description: string,
    context: Record<string, unknown>,
    alternatives: Alternative[],
    chosenAlternativeId: string,
    rationale: string,
    confidence: number
  ): Promise<string> {
    const decision: Decision = {
      id: `decision-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      taskId,
      description,
      context,
      alternatives,
      chosenAlternative: chosenAlternativeId,
      rationale,
      confidence: Math.min(1, Math.max(0, confidence)),
      timestamp: new Date()
    };
    this.decisions.set(decision.id, decision);
    const taskDecisionIds = this.taskDecisions.get(taskId);
    if (taskDecisionIds) {
      taskDecisionIds.push(decision.id);
    } else {
      this.taskDecisions.set(taskId, [decision.id]);
    }
    this.debouncedSave();
    return decision.id;
  }

  async recordOutcome(decisionId: string, outcome: Omit<DecisionOutcome, 'timestamp'>): Promise<void> {
    const decision = this.decisions.get(decisionId);
    if (!decision) {
      throw new Error(`Decision not found: ${decisionId}`);
    }
    decision.outcome = { ...outcome, timestamp: new Date() };
    this.debouncedSave();
  }

  async reflectOnTask(
    taskId: string,
    taskDescription: string,
    executionSummary: string
  ): Promise<Reflection> {
    const decisionIds = this.taskDecisions.get(taskId) || [];
    const taskDecisions = decisionIds
      .map(id => this.decisions.get(id))
      .filter((d): d is Decision => d !== undefined);
    const { successes, failures, improvements } = this.analyzeDecisions(taskDecisions);
    const overallRating = this.calculateOverallRating(taskDecisions, successes, failures);
    const reflection: Reflection = {
      id: `reflection-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      taskId,
      taskDescription,
      executionSummary,
      decisions: taskDecisions,
      successes,
      failures,
      improvements,
      overallRating,
      timestamp: new Date()
    };
    this.reflections.set(reflection.id, reflection);
    this.debouncedSave();
    return reflection;
  }

  private analyzeDecisions(decisions: Decision[]): {
    successes: string[];
    failures: string[];
    improvements: ImprovementSuggestion[];
  } {
    const successes: string[] = [];
    const failures: string[] = [];
    const improvements: ImprovementSuggestion[] = [];
    for (const decision of decisions) {
      if (decision.outcome) {
        if (decision.outcome.success) {
          successes.push(`成功: ${decision.description}`);
        } else {
          failures.push(`失败: ${decision.description} - ${decision.outcome.gapAnalysis}`);
          improvements.push({
            id: `imp-${decision.id}`,
            category: this.inferCategory(decision),
            priority: 'high' as const,
            description: `决策 "${decision.description}" 未达到预期结果`,
            recommendation: this.generateRecommendation(decision),
            estimatedImpact: this.estimateImpact(decision)
          });
        }
      }
    }
    return { successes, failures, improvements };
  }

  private inferCategory(decision: Decision): ImprovementSuggestion['category'] {
    const keywords = decision.description.toLowerCase();
    if (keywords.includes('tool') || keywords.includes('工具')) return 'tool';
    if (keywords.includes('skill') || keywords.includes('技能')) return 'skill';
    if (keywords.includes('workflow') || keywords.includes('流程')) return 'workflow';
    if (keywords.includes('process') || keywords.includes('过程')) return 'process';
    return 'other';
  }

  private generateRecommendation(decision: Decision): string {
    if (!decision.outcome) return '监控决策执行结果以评估有效性';
    const issues: string[] = [];
    if (decision.confidence < 0.7) issues.push('提高决策前的信息收集质量');
    if (decision.alternatives.length < 3) issues.push('考虑更多备选方案');
    if (decision.outcome.gapAnalysis) issues.push(`解决: ${decision.outcome.gapAnalysis}`);
    return issues.length === 0 ? '决策执行良好，保持当前流程' : `建议改进: ${issues.join('; ')}`;
  }

  private estimateImpact(decision: Decision): number {
    if (!decision.outcome) return 0.5;
    const confidenceFactor = decision.confidence;
    const outcomeFactor = decision.outcome.success ? 0.3 : 0.7;
    const gapSeverity = decision.outcome.gapAnalysis.length > 50 ? 0.2 : 0;
    return Math.min(1, confidenceFactor * outcomeFactor + gapSeverity);
  }

  private calculateOverallRating(
    decisions: Decision[],
    successes: string[],
    failures: string[]
  ): number {
    if (decisions.length === 0) return 0;
    const avgConfidence = decisions.reduce((sum, d) => sum + d.confidence, 0) / decisions.length;
    const successRatio = successes.length / (successes.length + failures.length || 1);
    const outcomeScore = decisions.reduce((sum, d) => sum + (d.outcome?.success ? 1 : 0.5), 0) / decisions.length;
    return Math.round(((avgConfidence * 0.3) + (successRatio * 0.4) + (outcomeScore * 0.3)) * 10) / 10;
  }

  async getReflection(reflectionId: string): Promise<Reflection | undefined> {
    return this.reflections.get(reflectionId);
  }

  async getReflections(query?: ReflectionQuery): Promise<Reflection[]> {
    let results = Array.from(this.reflections.values());
    if (query?.taskId) {
      results = results.filter(r => r.taskId === query.taskId);
    }
    if (query?.dateRange && query.dateRange.start && query.dateRange.end) {
      results = results.filter(r =>
        r.timestamp >= (query.dateRange?.start ?? r.timestamp) && r.timestamp <= (query.dateRange?.end ?? r.timestamp)
      );
    }
    if (query?.successThreshold !== undefined) {
      results = results.filter(r => r.overallRating >= query.successThreshold!);
    }
    return results.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  async getDecision(decisionId: string): Promise<Decision | undefined> {
    return this.decisions.get(decisionId);
  }

  async getDecisionsByTask(taskId: string): Promise<Decision[]> {
    const decisionIds = this.taskDecisions.get(taskId) || [];
    return decisionIds.map(id => this.decisions.get(id)).filter((d): d is Decision => d !== undefined);
  }

  async getStats(): Promise<DecisionStats> {
    const decisions = Array.from(this.decisions.values());
    const completed = decisions.filter(d => d.outcome !== undefined);
    const successful = completed.filter(d => d.outcome?.success ?? false);
    const categoryCounts: Record<string, number> = {};
    for (const decision of decisions) {
      const category = this.inferCategory(decision);
      categoryCounts[category] = (categoryCounts[category] || 0) + 1;
    }
    const mostCommonCategories = Object.entries(categoryCounts)
      .sort((a, b) => b[1] - a[1]).slice(0, 3).map(([cat]) => cat);
    const improvementOpportunities = decisions.filter(d =>
      d.outcome?.success === false || d.confidence < 0.7
    ).length;
    return {
      totalDecisions: decisions.length,
      avgConfidence: decisions.length > 0
        ? decisions.reduce((sum, d) => sum + d.confidence, 0) / decisions.length : 0,
      successRate: completed.length > 0 ? successful.length / completed.length : 0,
      mostCommonCategories,
      improvementOpportunities
    };
  }

  /** 跨会话决策统计分析 */
  async getDecisionStats(): Promise<{
    total: number;
    successRate: number;
    avgConfidence: number;
    commonMistakes: string[];
    topTools: string[];
    improvementTrend: number[];
  }> {
    const decisions = Array.from(this.decisions.values());
    const completed = decisions.filter(d => d.outcome !== undefined);
    const successful = completed.filter(d => d.outcome?.success ?? false);
    const successRate = completed.length > 0 ? successful.length / completed.length : 0;
    const avgConfidence = decisions.length > 0
      ? decisions.reduce((sum, d) => sum + d.confidence, 0) / decisions.length : 0;
    const commonMistakes = decisions
      .filter(d => d.outcome && !d.outcome.success && d.outcome.gapAnalysis)
      .map(d => d.outcome?.gapAnalysis ?? '');
    const toolCounts: Record<string, number> = {};
    for (const d of decisions) {
      toolCounts[d.chosenAlternative] = (toolCounts[d.chosenAlternative] || 0) + 1;
    }
    const topTools = Object.entries(toolCounts)
      .sort((a, b) => b[1] - a[1]).slice(0, 5).map(([tool]) => tool);
    const reflections = Array.from(this.reflections.values())
      .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    const improvementTrend = reflections.map(r => r.overallRating);
    return { total: decisions.length, successRate, avgConfidence, commonMistakes, topTools, improvementTrend };
  }

  async generateImprovementReport(): Promise<string> {
    const stats = await this.getStats();
    const reflections = await this.getReflections();
    const highPriorityImprovements: ImprovementSuggestion[] = [];
    for (const reflection of reflections) {
      highPriorityImprovements.push(...reflection.improvements.filter(i => i.priority === 'high'));
    }
    highPriorityImprovements.sort((a, b) => b.estimatedImpact - a.estimatedImpact);
    let report = `# 决策改进报告\n\n`;
    report += `## 概览统计\n\n`;
    report += `- 总决策数: ${stats.totalDecisions}\n`;
    report += `- 平均置信度: ${stats.avgConfidence.toFixed(2)}\n`;
    report += `- 成功率: ${(stats.successRate * 100).toFixed(1)}%\n`;
    report += `- 改进机会: ${stats.improvementOpportunities}\n\n`;
    report += `## 高频决策类别\n\n`;
    for (const cat of stats.mostCommonCategories) report += `- ${cat}\n`;
    report += `\n## 高优先级改进建议\n\n`;
    for (const improvement of highPriorityImprovements.slice(0, 5)) {
      report += `### ${improvement.description}\n`;
      report += `- 类别: ${improvement.category}\n`;
      report += `- 建议: ${improvement.recommendation}\n`;
      report += `- 预估影响: ${(improvement.estimatedImpact * 100).toFixed(0)}%\n\n`;
    }
    return report;
  }

  async learnFromExperience(taskId: string): Promise<string[]> {
    const decisions = await this.getDecisionsByTask(taskId);
    const lessons: string[] = [];
    for (const decision of decisions) {
      if (decision.outcome) {
        if (decision.outcome.success) {
          lessons.push(`✅ 成功经验: ${decision.rationale}`);
        } else {
          lessons.push(`❌ 改进方向: ${decision.outcome.lessonsLearned.join('; ')}`);
        }
      }
    }
    this.debouncedSave();
    return lessons;
  }

  async clear(): Promise<void> {
    this.decisions.clear();
    this.reflections.clear();
    this.taskDecisions.clear();
    this.debouncedSave();
  }

  /**
   * 清理定时器，防止内存泄漏
   * 在不再使用 DecisionReflector 实例时调用
   */
  dispose(): void {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
  }
}

export const decisionReflector = new DecisionReflector();
