/**
 * 决策系统应用服务
 * 协调领域服务和仓储
 */

import { DecisionService } from '../../domain/services/decision.service.js';
import type { DecisionRepository } from '../../domain/repositories/decision.repository.js';
import type {
  Decision,
  DecisionOutcome,
  Reflection,
  ImprovementSuggestion,
} from '../../domain/models/decision.model.js';
import type {
  DecisionRequest,
  DecisionResponse,
  RecordDecisionOutcomeRequest,
} from '../dtos/decision.dto.js';

export class DecisionApplicationService {
  constructor(
    private readonly decisionRepository: DecisionRepository,
    private readonly decisionService: typeof DecisionService = DecisionService
  ) {}

  /**
   * 初始化决策系统
   */
  async initialize(): Promise<void> {
    await this.decisionRepository.loadAll();
  }

  /**
   * 记录决策
   */
  async recordDecision(request: DecisionRequest): Promise<DecisionResponse> {
    const decision = this.decisionService.createDecision(
      request.taskId,
      request.description,
      request.context,
      request.alternatives,
      request.alternatives[0]?.id || '',
      '',
      request.confidence
    );

    await this.decisionRepository.saveDecision(decision);

    return {
      decisionId: decision.id,
      taskId: decision.taskId,
      chosenAlternativeId: decision.chosenAlternative,
      rationale: decision.rationale,
      confidence: decision.confidence,
      timestamp: decision.timestamp.toISOString(),
    };
  }

  /**
   * 记录决策结果
   */
  async recordOutcome(request: RecordDecisionOutcomeRequest): Promise<void> {
    const decision = await this.decisionRepository.getDecision(request.decisionId);
    if (!decision) {
      throw new Error(`Decision not found: ${request.decisionId}`);
    }

    const outcome: DecisionOutcome = {
      success: request.success,
      result: request.result,
      timestamp: new Date(),
      gapAnalysis: request.gapAnalysis,
      lessonsLearned: request.lessonsLearned,
    };

    decision.outcome = outcome;
    await this.decisionRepository.saveDecision(decision);
  }

  /**
   * 执行任务反思
   */
  async reflectOnTask(
    taskId: string,
    taskDescription: string,
    executionSummary: string
  ): Promise<Reflection> {
    const decisions = await this.decisionRepository.getDecisionsByTask(taskId);
    const { successes, failures, improvements } = this.decisionService.analyzeDecisions(
      decisions
    );
    const overallRating = this.decisionService.calculateOverallRating(
      decisions,
      successes,
      failures
    );

    const reflection: Reflection = {
      id: `reflection-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      taskId,
      taskDescription,
      executionSummary,
      decisions,
      successes,
      failures,
      improvements,
      overallRating,
      timestamp: new Date(),
    };

    await this.decisionRepository.saveReflection(reflection);

    return reflection;
  }

  /**
   * 获取决策统计
   */
  async getDecisionStats() {
    return this.decisionRepository.getStats();
  }

  /**
   * 生成改进报告
   */
  async generateImprovementReport(): Promise<string> {
    const stats = await this.getDecisionStats();
    const reflections: Array<{ improvements: ImprovementSuggestion[] }> = [];
    return this.decisionService.generateImprovementReport(stats, reflections);
  }

  /**
   * 从经验中学习
   */
  async learnFromExperience(taskId: string): Promise<string[]> {
    const decisions = await this.decisionRepository.getDecisionsByTask(taskId);
    return this.decisionService.learnFromDecisions(decisions);
  }

  /**
   * 保存所有数据
   */
  async saveAll(): Promise<void> {
    await this.decisionRepository.saveAll();
  }
}
