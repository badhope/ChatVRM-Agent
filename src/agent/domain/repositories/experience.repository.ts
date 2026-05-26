/**
 * 经验仓储接口（领域层）
 */

import type { Experience } from '../models/experience.model.js';

export interface ExperienceRepository {
  addExperience(experience: Experience): Promise<void>;
  getExperience(id: string): Promise<Experience | null>;
  getAllExperiences(): Promise<Experience[]>;
  generateBehaviorGuidelines(): Promise<string>;
  getExperienceCount(): Promise<number>;
  loadAll(): Promise<void>;
  saveAll(): Promise<void>;
}
