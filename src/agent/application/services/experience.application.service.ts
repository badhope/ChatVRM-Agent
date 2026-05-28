/**
 * 经验系统应用服务
 * 协调领域服务和仓储
 */

import { ExperienceService } from '../../domain/services/experience.service.js';
import type { ExperienceRepository } from '../../domain/repositories/experience.repository.js';
import type { Experience, EmotionalTone } from '../../domain/models/experience.model.js';

export class ExperienceApplicationService {
  constructor(
    private readonly experienceRepository: ExperienceRepository,
    private readonly experienceService: typeof ExperienceService = ExperienceService
  ) {}

  /**
   * 初始化经验系统
   */
  async initialize(): Promise<void> {
    await this.experienceRepository.loadAll();
  }

  /**
   * 添加新经验
   */
  async addExperience(
    taskId: string,
    taskDescription: string,
    decisions: Experience['decisions'],
    lessons: string[],
    improvements: string[],
    patterns: string[],
    emotionalTone: EmotionalTone
  ): Promise<Experience> {
    const taskType = this.experienceService.inferTaskType(taskDescription);
    const experience = this.experienceService.createExperience(
      taskId,
      taskType,
      taskDescription,
      decisions,
      lessons,
      improvements,
      patterns,
      emotionalTone
    );

    await this.experienceRepository.addExperience(experience);
    await this.experienceRepository.saveAll();

    return experience;
  }

  /**
   * 获取相关经验
   */
  async getRelevantExperiences(taskType: string, limit: number = 10): Promise<Experience[]> {
    const allExperiences = await this.experienceRepository.getAllExperiences();
    return this.experienceService.getRelevantExperiences(allExperiences, taskType, limit);
  }

  /**
   * 获取成功和失败模式
   */
  async getPatterns(): Promise<{ successPatterns: string[]; failurePatterns: string[] }> {
    const allExperiences = await this.experienceRepository.getAllExperiences();
    return this.experienceService.extractPatterns(allExperiences);
  }

  /**
   * 获取所有教训
   */
  async getLessons(): Promise<string[]> {
    const allExperiences = await this.experienceRepository.getAllExperiences();
    const lessonSet = new Set<string>();
    for (const exp of allExperiences) {
      for (const lesson of exp.lessons) {
        lessonSet.add(lesson);
      }
    }
    return Array.from(lessonSet);
  }

  /**
   * 生成行为指导
   */
  async generateBehaviorGuidelines(): Promise<string> {
    return this.experienceRepository.generateBehaviorGuidelines();
  }

  /**
   * 获取经验计数
   */
  async getExperienceCount(): Promise<number> {
    return this.experienceRepository.getExperienceCount();
  }

  /**
   * 保存所有数据
   */
  async saveAll(): Promise<void> {
    await this.experienceRepository.saveAll();
  }
}
