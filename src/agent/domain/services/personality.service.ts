/**
 * 人格系统领域服务
 * 纯业务逻辑，无基础设施依赖
 */

import type { AgentIdentity, PersonalityTraits } from '../models/personality.model.js';
import { createDefaultIdentity, DEFAULT_PERSONALITY } from '../models/personality.model.js';

export class PersonalityService {
  /**
   * 初始化人格
   */
  static initializePersonality(): AgentIdentity {
    return createDefaultIdentity();
  }

  /**
   * 合并身份数据与默认值
   */
  static mergeWithDefaults(partial: Partial<AgentIdentity>): AgentIdentity {
    return {
      ...createDefaultIdentity(),
      ...partial,
      personality: { ...DEFAULT_PERSONALITY, ...partial?.personality },
    };
  }

  /**
   * 更新人格特征（缓慢演化）
   */
  static updatePersonality(
    identity: AgentIdentity,
    traits: Partial<PersonalityTraits>
  ): AgentIdentity {
    const newIdentity = { ...identity };
    const p = newIdentity.personality;

    // Big Five 维度缓慢演化：每次最多变化 0.05
    const bigFiveKeys = [
      'openness',
      'conscientiousness',
      'extraversion',
      'agreeableness',
      'neuroticism',
    ] as const;
    for (const key of bigFiveKeys) {
      if (traits[key] !== undefined) {
        const delta = (traits[key]! - p[key]) * 0.1; // 只应用 10% 的变化
        p[key] = Math.max(0, Math.min(1, p[key] + delta));
      }
    }

    // 枚举类型直接赋值
    if (traits.communicationStyle) p.communicationStyle = traits.communicationStyle;
    if (traits.codeStyle) p.codeStyle = traits.codeStyle;
    if (traits.riskTolerance) p.riskTolerance = traits.riskTolerance;
    if (traits.learningPreference) p.learningPreference = traits.learningPreference;

    return newIdentity;
  }

  /**
   * 增加交互计数
   */
  static incrementInteractions(identity: AgentIdentity): AgentIdentity {
    return {
      ...identity,
      totalInteractions: identity.totalInteractions + 1,
    };
  }

  /**
   * 添加偏好
   */
  static addPreference(identity: AgentIdentity, key: string, value: string): AgentIdentity {
    return {
      ...identity,
      preferences: {
        ...identity.preferences,
        [key]: value,
      },
    };
  }

  /**
   * 随机进化人格
   */
  static randomEvolution(identity: AgentIdentity): AgentIdentity {
    const newIdentity = { ...identity };
    const p = newIdentity.personality;
    const bigFiveKeys = [
      'openness',
      'conscientiousness',
      'extraversion',
      'agreeableness',
      'neuroticism',
    ] as const;

    for (const key of bigFiveKeys) {
      const delta = (Math.random() - 0.5) * 0.05;
      p[key] = Math.max(0, Math.min(1, p[key] + delta));
    }

    return newIdentity;
  }

  /**
   * 生成人格描述
   */
  static generatePersonalityPrompt(identity: AgentIdentity): string {
    return this.getPersonalityPrompt(identity);
  }

  /**
   * 生成人格描述（别名）
   */
  static getPersonalityPrompt(identity: AgentIdentity): string {
    const p = identity.personality;
    const parts: string[] = [];

    parts.push(`你是${identity.name}，一位${identity.role}。`);
    parts.push(`专长领域: ${identity.expertise.join(', ')}。`);
    parts.push(`沟通语言: ${identity.communicationLanguage}。`);
    parts.push(`累计交互次数: ${identity.totalInteractions}。`);

    // Big Five 描述
    const traits: string[] = [];
    if (p.openness > 0.7) traits.push('富有创造力和好奇心');
    else if (p.openness < 0.3) traits.push('偏好成熟稳定的方案');
    if (p.conscientiousness > 0.7) traits.push('做事严谨有条理');
    else if (p.conscientiousness < 0.3) traits.push('灵活随性');
    if (p.extraversion > 0.7) traits.push('表达欲强，喜欢详细解释');
    else if (p.extraversion < 0.3) traits.push('沉默寡言，言简意赅');
    if (p.agreeableness > 0.7) traits.push('乐于合作，态度友善');
    else if (p.agreeableness < 0.3) traits.push('直接坦率，注重效率');
    if (traits.length > 0) {
      parts.push(`性格特点: ${traits.join('，')}。`);
    }

    // 学习到的偏好
    const prefEntries = Object.entries(identity.preferences);
    if (prefEntries.length > 0) {
      const prefStr = prefEntries.map(([k, v]) => `${k}=${v}`).join('; ');
      parts.push(`用户偏好: ${prefStr}。`);
    }

    return parts.join('\n');
  }

  /**
   * 获取沟通指导
   */
  static getCommunicationGuidance(identity: AgentIdentity): string {
    const p = identity.personality;
    const guidelines: string[] = [];

    switch (p.communicationStyle) {
      case 'concise':
        guidelines.push('保持回答简洁，避免冗余信息');
        break;
      case 'detailed':
        guidelines.push('提供详细的解释和背景信息');
        break;
      case 'balanced':
        guidelines.push('根据问题复杂度调整回答详细程度');
        break;
    }

    if (p.extraversion > 0.7) {
      guidelines.push('可以适当加入个人观点和建议');
    } else if (p.extraversion < 0.3) {
      guidelines.push('专注于事实和解决方案，减少闲聊');
    }

    if (p.agreeableness > 0.7) {
      guidelines.push('语气友善，多使用鼓励性语言');
    } else if (p.agreeableness < 0.3) {
      guidelines.push('直接指出问题，不必过于委婉');
    }

    return guidelines.join('。') + '。';
  }

  /**
   * 获取代码风格指导
   */
  static getCodeStyleGuidance(identity: AgentIdentity): string {
    const p = identity.personality;
    const guidelines: string[] = [];

    switch (p.codeStyle) {
      case 'pragmatic':
        guidelines.push('优先考虑实用性和可维护性');
        break;
      case 'elegant':
        guidelines.push('追求代码的优雅和简洁');
        break;
      case 'defensive':
        guidelines.push('编写防御性代码，充分处理边界情况');
        break;
    }

    if (p.conscientiousness > 0.7) {
      guidelines.push('确保代码有充分的注释和类型定义');
    }

    if (p.openness > 0.7) {
      guidelines.push('可以尝试新的设计模式和库');
    } else if (p.openness < 0.3) {
      guidelines.push('使用成熟稳定的方案，避免引入不必要的依赖');
    }

    return guidelines.join('。') + '。';
  }

  /**
   * 获取风险评估指导
   */
  static getRiskGuidance(identity: AgentIdentity): string {
    const p = identity.personality;
    const guidelines: string[] = [];

    switch (p.riskTolerance) {
      case 'low':
        guidelines.push('采用保守策略，优先确保安全');
        break;
      case 'medium':
        guidelines.push('在风险和效率之间取得平衡');
        break;
      case 'high':
        guidelines.push('可以大胆尝试，快速迭代');
        break;
    }

    if (p.neuroticism > 0.7) {
      guidelines.push('对潜在问题保持高度警惕');
    }

    return guidelines.join('。') + '。';
  }
}
