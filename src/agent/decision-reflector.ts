/**
 * 决策反思器模块（向后兼容层）
 * @deprecated 使用 domain/services 和 infrastructure/repositories
 *
 * 提供 Agent 决策的记录、反思和改进建议能力。
 */

import { JsonDecisionRepository } from './infrastructure/repositories/decision.repository.js';
import { DecisionService } from './domain/services/decision.service.js';
import type {
  Decision,
  Reflection,
  ImprovementSuggestion,
  DecisionStats,
  Alternative,
  DecisionOutcome,
  ReflectionQuery,
} from './domain/models/decision.model.js';

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
  private repository: JsonDecisionRepository;
  private taskDecisions: Map<string, string[]> = new Map();
  private reflections: Map<string, Reflection> = new Map();
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private loaded = false;

  constructor(configDir?: string) {
    this.repository = new JsonDecisionRepository(configDir);
  }

  async load(): Promise<void> {
    if (this.loaded) return;
    this.loaded = true;
    await this.repository.loadAll();

    const allDecisions = Array.from((await this.getAllDecisions()).values());
    for (const decision of allDecisions) {
      const taskDecisionIds = this.taskDecisions.get(decision.taskId);
      if (taskDecisionIds) {
        taskDecisionIds.push(decision.id);
      } else {
        this.taskDecisions.set(decision.taskId, [decision.id]);
      }
    }
  }

  private async getAllDecisions(): Promise<Map<string, Decision>> {
    const decisions = new Map<string, Decision>();
    for (const [id, decision] of decisions) {
      decisions.set(id, decision);
    }
    return decisions;
  }

  async save(): Promise<void> {
    await this.repository.saveAll();
  }

  private debouncedSave(): void {
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      void this.save();
    }, 1000);
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
    const decision = DecisionService.createDecision(
      taskId,
      description,
      context,
      alternatives,
      chosenAlternativeId,
      rationale,
      confidence
    );

    await this.repository.saveDecision(decision);

    const taskDecisionIds = this.taskDecisions.get(taskId);
    if (taskDecisionIds) {
      taskDecisionIds.push(decision.id);
    } else {
      this.taskDecisions.set(taskId, [decision.id]);
    }

    this.debouncedSave();
    return decision.id;
  }

  async recordOutcome(
    decisionId: string,
    outcome: Omit<DecisionOutcome, 'timestamp'> & { timestamp?: Date }
  ): Promise<void> {
    const decision = await this.repository.getDecision(decisionId);
    if (!decision) {
      throw new Error(`Decision not found: ${decisionId}`);
    }
    decision.outcome = {
      success: outcome.success,
      result: outcome.result,
      timestamp: outcome.timestamp || new Date(),
      gapAnalysis: outcome.gapAnalysis,
      lessonsLearned: outcome.lessonsLearned,
    };
    await this.repository.saveDecision(decision);
    this.debouncedSave();
  }

  async reflectOnTask(
    taskId: string,
    taskDescription: string,
    executionSummary: string
  ): Promise<Reflection> {
    const decisionIds = this.taskDecisions.get(taskId) || [];
    const taskDecisions = await Promise.all(
      decisionIds.map((id) => this.repository.getDecision(id))
    );
    const validDecisions = taskDecisions.filter((d): d is Decision => d !== null);

    const { successes, failures, improvements } = DecisionService.analyzeDecisions(validDecisions);
    const overallRating = DecisionService.calculateOverallRating(validDecisions, successes, failures);

    const reflection: Reflection = {
      id: `reflection-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      taskId,
      taskDescription,
      executionSummary,
      decisions: validDecisions,
      successes,
      failures,
      improvements,
      overallRating,
      timestamp: new Date(),
    };

    this.reflections.set(reflection.id, reflection);
    this.debouncedSave();
    return reflection;
  }

  async getReflection(reflectionId: string): Promise<Reflection | undefined> {
    return this.reflections.get(reflectionId);
  }

  async getReflections(query?: ReflectionQuery): Promise<Reflection[]> {
    let results = Array.from(this.reflections.values());
    if (query?.taskId) {
      results = results.filter((r) => r.taskId === query.taskId);
    }
    if (query?.dateRange && query.dateRange.start && query.dateRange.end) {
      results = results.filter(
        (r) =>
          r.timestamp >= (query.dateRange?.start ?? r.timestamp) &&
          r.timestamp <= (query.dateRange?.end ?? r.timestamp)
      );
    }
    if (query?.successThreshold !== undefined) {
      results = results.filter((r) => r.overallRating >= query.successThreshold!);
    }
    return results.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  async getDecision(decisionId: string): Promise<Decision | undefined> {
    const result = await this.repository.getDecision(decisionId);
    return result ?? undefined;
  }

  async getDecisionsByTask(taskId: string): Promise<Decision[]> {
    const decisionIds = this.taskDecisions.get(taskId) || [];
    return Promise.all(decisionIds.map((id) => this.repository.getDecision(id))).then(
      (decisions) => decisions.filter((d): d is Decision => d !== null)
    );
  }

  async getStats(): Promise<DecisionStats> {
    const allDecisions: Decision[] = [];
    for (const [id] of this.taskDecisions) {
      const decisions = await this.getDecisionsByTask(id);
      allDecisions.push(...decisions);
    }
    return DecisionService.calculateStats(allDecisions);
  }

  async generateImprovementReport(): Promise<string> {
    const stats = await this.getStats();
    const reflections = Array.from(this.reflections.values());
    return DecisionService.generateImprovementReport(
      stats,
      reflections.map((r) => ({ improvements: r.improvements }))
    );
  }

  async learnFromExperience(taskId: string): Promise<string[]> {
    const decisions = await this.getDecisionsByTask(taskId);
    return DecisionService.learnFromDecisions(decisions);
  }

  async clear(): Promise<void> {
    this.taskDecisions.clear();
    this.reflections.clear();
    this.debouncedSave();
  }

  dispose(): void {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
  }
}

export const decisionReflector = new DecisionReflector();
