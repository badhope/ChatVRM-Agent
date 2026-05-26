/**
 * 人格系统模块（向后兼容）
 * @deprecated 使用 domain/models, domain/services 和 infrastructure/repositories
 *
 * 管理 Agent 的身份、性格特征和偏好。
 * 人格会随交互缓慢演化，不会因单次交互产生剧烈变化。
 */

import { JsonPersonalityRepository as PersonalityRepository } from './infrastructure/repositories/personality.repository.js';
import { PersonalityService } from './domain/services/personality.service.js';
import * as personalityModel from './domain/models/personality.model.js';

// 导出类型（保持向后兼容）
export type PersonalityTraits = personalityModel.PersonalityTraits;
export type AgentIdentity = personalityModel.AgentIdentity;
export const DEFAULT_PERSONALITY = personalityModel.DEFAULT_PERSONALITY;
export const createDefaultIdentity = personalityModel.createDefaultIdentity;

// ==================== PersonalityManager（兼容层）====================

export class PersonalityManager {
  private identity: AgentIdentity;
  private repository: PersonalityRepository;

  constructor(configDir?: string) {
    this.repository = new PersonalityRepository(configDir);
    this.identity = personalityModel.createDefaultIdentity();
  }

  async load(): Promise<void> {
    const existing = await this.repository.loadIdentity();
    if (existing) {
      this.identity = existing;
    }
  }

  async save(): Promise<void> {
    await this.repository.saveIdentity(this.identity);
  }

  getIdentity(): AgentIdentity {
    return { ...this.identity };
  }

  updatePersonality(traits: Partial<PersonalityTraits>): void {
    this.identity = PersonalityService.updatePersonality(this.identity, traits);
  }

  addPreference(key: string, value: string): void {
    this.identity = PersonalityService.addPreference(this.identity, key, value);
  }

  incrementInteractions(): void {
    this.identity = PersonalityService.incrementInteractions(this.identity);
  }

  /** 生成人格描述，用于注入系统提示 */
  getPersonalityPrompt(): string {
    return PersonalityService.getPersonalityPrompt(this.identity);
  }

  /** 根据人格生成沟通指导 */
  getCommunicationGuidance(): string {
    return PersonalityService.getCommunicationGuidance(this.identity);
  }

  /** 根据人格生成代码风格指导 */
  getCodeStyleGuidance(): string {
    return PersonalityService.getCodeStyleGuidance(this.identity);
  }

  /** 根据人格生成风险评估指导 */
  getRiskGuidance(): string {
    return PersonalityService.getRiskGuidance(this.identity);
  }
}

