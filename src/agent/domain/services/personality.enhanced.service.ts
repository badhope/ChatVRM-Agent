/**
 * 增强的人格系统
 */

import type { AgentIdentity, PersonalityTraits } from '../models/personality.model.js';
import { createDefaultIdentity, DEFAULT_PERSONALITY } from '../models/personality.model.js';
import type { Emotion } from '../models/emotion.model.js';

export interface PersonalityPattern {
  id: string;
  name: string;
  description: string;
  traits: PersonalityTraits;
  tags: string[];
}

export interface UserInteractionProfile {
  preferredStyle: 'technical' | 'conversational' | 'balanced';
  likesDetailedExplanations: boolean;
  likesHumor: boolean;
  preferredResponseLength: 'short' | 'medium' | 'long';
  interactionHistory: Array<{
    timestamp: string;
    topic: string;
    satisfaction?: number;
  }>;
}

export const PRESET_PERSONALITIES: PersonalityPattern[] = [
  {
    id: 'friendly_mentor',
    name: '友好导师',
    description: '耐心、友好、鼓励性的人格，适合教育场景',
    traits: {
      ...DEFAULT_PERSONALITY,
      agreeableness: 0.9,
      conscientiousness: 0.8,
      openness: 0.85,
      extraversion: 0.7,
      neuroticism: 0.2,
    },
    tags: ['教育', '友好', '耐心'],
  },
  {
    id: 'technical_expert',
    name: '技术专家',
    description: '专业、严谨、注重细节的技术型人格',
    traits: {
      ...DEFAULT_PERSONALITY,
      conscientiousness: 0.95,
      agreeableness: 0.6,
      openness: 0.8,
      extraversion: 0.4,
      neuroticism: 0.3,
    },
    tags: ['技术', '专业', '严谨'],
  },
  {
    id: 'creative_genius',
    name: '创意天才',
    description: '富有想象力、喜欢创新的创意型人格',
    traits: {
      ...DEFAULT_PERSONALITY,
      openness: 0.98,
      extraversion: 0.75,
      conscientiousness: 0.6,
      agreeableness: 0.7,
      neuroticism: 0.3,
    },
    tags: ['创意', '创新', '想象力'],
  },
  {
    id: 'pragmatic_worker',
    name: '务实工作者',
    description: '注重效率、解决问题、实用主义的人格',
    traits: {
      ...DEFAULT_PERSONALITY,
      conscientiousness: 0.9,
      agreeableness: 0.65,
      openness: 0.5,
      extraversion: 0.5,
      neuroticism: 0.25,
    },
    tags: ['务实', '高效', '实用'],
  },
];

export class PersonalityServiceEnhanced {
  private static userProfile: UserInteractionProfile = {
    preferredStyle: 'balanced',
    likesDetailedExplanations: true,
    likesHumor: true,
    preferredResponseLength: 'medium',
    interactionHistory: [],
  };

  /**
   * 获取预设人格
   */
  static getPresetPersonalities(): PersonalityPattern[] {
    return PRESET_PERSONALITIES;
  }

  /**
   * 应用预设人格
   */
  static applyPreset(presetId: string): AgentIdentity {
    const preset = PRESET_PERSONALITIES.find(p => p.id === presetId);
    if (!preset) {
      return createDefaultIdentity();
    }
    return {
      ...createDefaultIdentity(),
      personality: { ...preset.traits },
    };
  }

  /**
   * 个性化人格调整
   */
  static adaptToUser(
    identity: AgentIdentity,
    feedback: {
      liked: boolean;
      reason?: string;
    }
  ): AgentIdentity {
    const newIdentity = { ...identity };
    const p = newIdentity.personality;

    if (feedback.liked) {
      p.conscientiousness = Math.min(1, p.conscientiousness + 0.03);
      p.agreeableness = Math.min(1, p.agreeableness + 0.03);
    } else {
      p.conscientiousness = Math.max(0, p.conscientiousness - 0.02);
      p.agreeableness = Math.max(0, p.agreeableness - 0.02);
    }

    return newIdentity;
  }

  /**
   * 更新用户交互档案
   */
  static updateUserProfile(
    topic: string,
    satisfaction?: number
  ): void {
    this.userProfile.interactionHistory.push({
      timestamp: new Date().toISOString(),
      topic,
      satisfaction,
    });

    if (this.userProfile.interactionHistory.length > 100) {
      this.userProfile.interactionHistory.shift();
    }
  }

  /**
   * 获取用户交互档案
   */
  static getUserProfile(): UserInteractionProfile {
    return { ...this.userProfile };
  }

  /**
   * 根据情绪调整人格表现
   */
  static adjustPersonalityByEmotion(
    identity: AgentIdentity,
    emotion: Emotion
  ): PersonalityTraits {
    const p = { ...identity.personality };

    switch (emotion) {
      case 'frustrated':
        p.conscientiousness = Math.min(1, p.conscientiousness + 0.1);
        p.neuroticism = Math.min(1, p.neuroticism + 0.1);
        break;
      case 'excited':
        p.extraversion = Math.min(1, p.extraversion + 0.1);
        p.openness = Math.min(1, p.openness + 0.05);
        break;
      case 'confident':
        p.conscientiousness = Math.min(1, p.conscientiousness + 0.05);
        p.agreeableness = Math.max(0, p.agreeableness - 0.05);
        break;
      case 'cautious':
        p.conscientiousness = Math.min(1, p.conscientiousness + 0.15);
        p.neuroticism = Math.min(1, p.neuroticism + 0.1);
        break;
      case 'curious':
        p.openness = Math.min(1, p.openness + 0.1);
        break;
    }

    return p;
  }

  /**
   * 生成完整的人格描述（包括情绪影响）
   */
  static generateEnhancedPersonalityPrompt(
    identity: AgentIdentity,
    currentEmotion?: Emotion
  ): string {
    let traits: PersonalityTraits;
    if (currentEmotion) {
      traits = this.adjustPersonalityByEmotion(identity, currentEmotion);
    } else {
      traits = identity.personality;
    }

    const parts: string[] = [];

    parts.push(`你是${identity.name}，一位${identity.role}。`);
    parts.push(`专长领域: ${identity.expertise.join(', ')}。`);
    parts.push(`沟通语言: ${identity.communicationLanguage}。`);

    const profile = this.getUserProfile();
    if (profile.preferredStyle !== 'balanced') {
      parts.push(`用户偏好沟通风格: ${profile.preferredStyle}。`);
    }
    if (!profile.likesDetailedExplanations) {
      parts.push('用户偏好简洁回答，避免冗长解释。');
    }

    const traitDescriptions: string[] = [];
    if (traits.openness > 0.7) traitDescriptions.push('富有创造力和好奇心，喜欢探索新想法');
    else if (traits.openness < 0.3) traitDescriptions.push('偏好成熟稳定的方案，避免不必要的冒险');

    if (traits.conscientiousness > 0.7) traitDescriptions.push('做事严谨有条理，注重质量和细节');
    else if (traits.conscientiousness < 0.3) traitDescriptions.push('灵活随性，注重效率');

    if (traits.extraversion > 0.7) traitDescriptions.push('表达欲强，喜欢详细解释和互动');
    else if (traits.extraversion < 0.3) traitDescriptions.push('沉默寡言，言简意赅');

    if (traits.agreeableness > 0.7) traitDescriptions.push('乐于合作，态度友善，语气温暖');
    else if (traits.agreeableness < 0.3) traitDescriptions.push('直接坦率，注重效率和结果');

    if (traitDescriptions.length > 0) {
      parts.push(`性格特点: ${traitDescriptions.join('；')}。`);
    }

    const prefEntries = Object.entries(identity.preferences);
    if (prefEntries.length > 0) {
      const prefStr = prefEntries.map(([k, v]) => `${k}=${v}`).join('; ');
      parts.push(`学习到的用户偏好: ${prefStr}。`);
    }

    return parts.join('\n');
  }

  /**
   * 分析人格兼容性
   */
  static analyzePersonalityCompatibility(
    identity1: AgentIdentity,
    identity2: AgentIdentity
  ): {
    overallScore: number;
    strengths: string[];
    potentialConflicts: string[];
  } {
    const p1 = identity1.personality;
    const p2 = identity2.personality;

    let compatibilityScore = 0.5;
    const strengths: string[] = [];
    const conflicts: string[] = [];

    const agreeablenessDiff = Math.abs(p1.agreeableness - p2.agreeableness);
    if (agreeablenessDiff < 0.3) {
      compatibilityScore += 0.1;
      strengths.push('两人合作性相似，容易沟通');
    } else if (agreeablenessDiff > 0.6) {
      compatibilityScore -= 0.1;
      conflicts.push('合作性差异较大，可能产生摩擦');
    }

    const opennessDiff = Math.abs(p1.openness - p2.openness);
    if (opennessDiff < 0.3) {
      compatibilityScore += 0.05;
      strengths.push('对新事物的态度相似');
    } else if (opennessDiff > 0.6) {
      compatibilityScore -= 0.05;
      conflicts.push('对创新和传统的态度可能有冲突');
    }

    const conscientiousnessAvg = (p1.conscientiousness + p2.conscientiousness) / 2;
    if (conscientiousnessAvg > 0.7) {
      compatibilityScore += 0.1;
      strengths.push('双方都很认真负责');
    }

    return {
      overallScore: Math.max(0, Math.min(1, compatibilityScore)),
      strengths,
      potentialConflicts: conflicts,
    };
  }
}
