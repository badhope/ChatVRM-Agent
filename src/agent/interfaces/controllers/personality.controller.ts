/**
 * 人格系统控制器
 * 接口层 - 暴露人格系统的公共 API
 */

import type { AgentIdentity, PersonalityTraits } from '../../domain/models/personality.model';
import { PersonalityApplicationService } from '../../application/services/personality.application.service';
import { JsonPersonalityRepository } from '../../infrastructure/repositories/personality.repository';

export class PersonalityController {
  private personalityService: PersonalityApplicationService;

  constructor() {
    const repository = new JsonPersonalityRepository();
    this.personalityService = new PersonalityApplicationService(repository);
  }

  /**
   * 初始化人格系统
   */
  async initialize(): Promise<AgentIdentity> {
    return this.personalityService.initialize();
  }

  /**
   * 更新人格特质
   */
  async updatePersonality(
    identity: AgentIdentity,
    traits: Partial<PersonalityTraits>
  ): Promise<AgentIdentity> {
    return this.personalityService.updatePersonality(identity, traits);
  }

  /**
   * 记录交互
   */
  async recordInteraction(identity: AgentIdentity): Promise<AgentIdentity> {
    return this.personalityService.recordInteraction(identity);
  }

  /**
   * 获取人格提示词
   */
  getPersonalityPrompt(identity: AgentIdentity): string {
    return this.personalityService.getPersonalityPrompt(identity);
  }

  /**
   * 随机进化人格
   */
  async evolvePersonality(identity: AgentIdentity): Promise<AgentIdentity> {
    return this.personalityService.evolvePersonality(identity);
  }
}
