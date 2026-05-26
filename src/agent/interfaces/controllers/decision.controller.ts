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
import { JsonExperienceRepository } from '../../infrastructure/repositories/experience.repository';
import { ExperienceService } from '../../domain/services/experience.service';
import type { Experience } from '../../domain/models/experience.model';

export class DecisionController {
  private decisionService: DecisionApplicationService;
  private decisionRepository: JsonDecisionRepository;
  private experienceRepository: JsonExperienceRepository;

  constructor() {
    this.decisionRepository = new JsonDecisionRepository();
    this.experienceRepository = new JsonExperienceRepository();
    this.decisionService = new DecisionApplicationService(this.decisionRepository);
  }

  /**
   * 初始化决策系统
   */
  async initialize(): Promise<void> {
    await this.decisionService.initialize();
  }

  /**
   * 加载决策（向后兼容）
   */
  async loadDecisions(): Promise<void> {
    await this.initialize();
  }

  /**
   * 保存决策（向后兼容）
   */
  async saveDecisions(): Promise<void> {
    await this.saveAll();
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
   * 获取指定任务的决策（向后兼容）
   */
  async getDecisionsByTask(taskId: string): Promise<any[]> {
    const decisions = await this.decisionRepository.getDecisionsByTask(taskId);
    return decisions;
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

  /**
   * 添加经验记录（向后兼容）
   */
  async addExperience(experience: Experience): Promise<void> {
    await this.experienceRepository.addExperience(experience);
  }

  /**
   * 加载经验记录（向后兼容）
   */
  async loadExperiences(): Promise<Experience[]> {
    return this.experienceRepository.getAllExperiences();
  }

  /**
   * 获取经验记录数量（向后兼容）
   */
  async getExperienceCount(): Promise<number> {
    return this.experienceRepository.getExperienceCount();
  }
}
