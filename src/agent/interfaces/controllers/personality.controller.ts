/**
 * 人格系统控制器
 * 接口层 - 暴露人格系统的公共 API
 */

import type { AgentIdentity, PersonalityTraits } from '../../domain/models/personality.model.js';
import { PersonalityApplicationService } from '../../application/services/personality.application.service.js';
import { JsonPersonalityRepository } from '../../infrastructure/repositories/personality.repository.js';
import { PersonalityService } from '../../domain/services/personality.service.js';

export class PersonalityController {
  private personalityService: PersonalityApplicationService;
  private repository: JsonPersonalityRepository;

  constructor() {
    this.repository = new JsonPersonalityRepository();
    this.personalityService = new PersonalityApplicationService(this.repository);
  }

  /**
   * 初始化人格系统
   */
  async initialize(): Promise<AgentIdentity> {
    return this.personalityService.initialize();
  }

  /**
   * 加载人格身份（向后兼容）
   */
  async loadIdentity(): Promise<AgentIdentity> {
    return this.initialize();
  }

  /**
   * 保存人格身份（向后兼容）
   */
  async saveIdentity(identity: AgentIdentity): Promise<void> {
    await this.repository.saveIdentity(identity);
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
   * 获取沟通风格指导
   */
  getCommunicationGuidance(identity: AgentIdentity): string {
    return PersonalityService.getCommunicationGuidance(identity);
  }

  /**
   * 获取代码风格指导
   */
  getCodeStyleGuidance(identity: AgentIdentity): string {
    return PersonalityService.getCodeStyleGuidance(identity);
  }

  /**
   * 获取风险评估指导
   */
  getRiskGuidance(identity: AgentIdentity): string {
    return PersonalityService.getRiskGuidance(identity);
  }

  /**
   * 增加交互计数
   */
  incrementInteractions(identity: AgentIdentity): AgentIdentity {
    return PersonalityService.incrementInteractions(identity);
  }

  /**
   * 随机进化人格
   */
  async evolvePersonality(identity: AgentIdentity): Promise<AgentIdentity> {
    return this.personalityService.evolvePersonality(identity);
  }
}
