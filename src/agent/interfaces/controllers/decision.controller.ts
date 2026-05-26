/**
 * 决策系统控制器
 * 接口层 - 暴露决策系统的公共 API
 */

import type {
  DecisionRequest,
  DecisionResponse,
  RecordDecisionOutcomeRequest,
} from '../../application/dtos/decision.dto';
import { DecisionApplicationService } from '../../application/services/decision.application.service';
import { JsonDecisionRepository } from '../../infrastructure/repositories/decision.repository';

export class DecisionController {
  private decisionService: DecisionApplicationService;

  constructor() {
    const repository = new JsonDecisionRepository();
    this.decisionService = new DecisionApplicationService(repository);
  }

  /**
   * 初始化决策系统
   */
  async initialize(): Promise<void> {
    await this.decisionService.initialize();
  }

  /**
   * 记录决策
   */
  async recordDecision(request: DecisionRequest): Promise<DecisionResponse> {
    return this.decisionService.recordDecision(request);
  }

  /**
   * 记录决策结果
   */
  async recordOutcome(request: RecordDecisionOutcomeRequest): Promise<void> {
    return this.decisionService.recordOutcome(request);
  }

  /**
   * 执行任务反思
   */
  async reflectOnTask(
    taskId: string,
    taskDescription: string,
    executionSummary: string
  ) {
    return this.decisionService.reflectOnTask(taskId, taskDescription, executionSummary);
  }

  /**
   * 获取决策统计
   */
  async getDecisionStats() {
    return this.decisionService.getDecisionStats();
  }

  /**
   * 生成改进报告
   */
  async generateImprovementReport(): Promise<string> {
    return this.decisionService.generateImprovementReport();
  }

  /**
   * 从经验中学习
   */
  async learnFromExperience(taskId: string): Promise<string[]> {
    return this.decisionService.learnFromExperience(taskId);
  }

  /**
   * 保存所有数据
   */
  async saveAll(): Promise<void> {
    return this.decisionService.saveAll();
  }
}
