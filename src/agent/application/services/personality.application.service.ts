/**
 * 人格系统应用服务
 * 协调领域服务和仓储
 */

import type { AgentIdentity, PersonalityTraits } from '../../domain/models/personality.model';
import { PersonalityService } from '../../domain/services/personality.service';
import type { PersonalityRepository } from '../../domain/repositories/personality.repository';

export class PersonalityApplicationService {
  constructor(
    private readonly personalityRepository: PersonalityRepository,
    private readonly personalityService: typeof PersonalityService = PersonalityService
  ) {}

  /**
   * 初始化人格系统
   */
  async initialize(): Promise<AgentIdentity> {
    const existing = await this.personalityRepository.loadIdentity();
    if (existing) {
      return existing;
    }
    const newIdentity = this.personalityService.initializePersonality();
    await this.personalityRepository.saveIdentity(newIdentity);
    return newIdentity;
  }

  /**
   * 更新人格特质
   */
  async updatePersonality(
    identity: AgentIdentity,
    traits: Partial<PersonalityTraits>
  ): Promise<AgentIdentity> {
    const updated = this.personalityService.updatePersonality(identity, traits);
    await this.personalityRepository.saveIdentity(updated);
    return updated;
  }

  /**
   * 记录交互
   */
  async recordInteraction(identity: AgentIdentity): Promise<AgentIdentity> {
    const updated = this.personalityService.incrementInteractions(identity);
    await this.personalityRepository.saveIdentity(updated);
    return updated;
  }

  /**
   * 获取人格提示词
   */
  getPersonalityPrompt(identity: AgentIdentity): string {
    return this.personalityService.generatePersonalityPrompt(identity);
  }

  /**
   * 随机进化人格
   */
  async evolvePersonality(identity: AgentIdentity): Promise<AgentIdentity> {
    const updated = this.personalityService.randomEvolution(identity);
    await this.personalityRepository.saveIdentity(updated);
    return updated;
  }
}
