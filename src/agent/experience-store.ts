/**
 * 经验存储模块（向后兼容层）
 * @deprecated 使用 domain/services 和 infrastructure/repositories
 *
 * 持久化存储 Agent 的执行经验。
 */

import { JsonExperienceRepository } from './infrastructure/repositories/experience.repository.js';
import { ExperienceService } from './domain/services/experience.service.js';
import type { Experience } from './domain/models/experience.model.js';

export type { Experience, EmotionalTone, ExperienceDecision } from './domain/models/experience.model.js';

export class ExperienceStore {
  private repository: JsonExperienceRepository;
  private loaded = false;

  constructor(configDir?: string) {
    this.repository = new JsonExperienceRepository(configDir);
  }

  async load(): Promise<void> {
    if (this.loaded) return;
    this.loaded = true;
    await this.repository.loadAll();
  }

  async save(): Promise<void> {
    await this.repository.saveAll();
  }

  async addExperience(exp: Experience): Promise<void> {
    await this.repository.addExperience(exp);
    await this.save();
  }

  async getRelevantExperiences(taskType: string, limit: number = 10): Promise<Experience[]> {
    const all = await this.repository.getAllExperiences();
    return ExperienceService.getRelevantExperiences(all, taskType, limit);
  }

  async getPatterns(): Promise<{ successPatterns: string[]; failurePatterns: string[] }> {
    const all = await this.repository.getAllExperiences();
    return ExperienceService.extractPatterns(all);
  }

  async getLessons(): Promise<string[]> {
    const all = await this.repository.getAllExperiences();
    const lessonSet = new Set<string>();
    for (const exp of all) {
      for (const lesson of exp.lessons) {
        lessonSet.add(lesson);
      }
    }
    return Array.from(lessonSet);
  }

  async generateBehaviorGuidelines(): Promise<string> {
    return this.repository.generateBehaviorGuidelines();
  }

  getExperienceCount(): number {
    return this.repository.getExperienceCountSync();
  }
}
