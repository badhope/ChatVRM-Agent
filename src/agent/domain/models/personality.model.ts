/**
 * 人格系统领域模型
 */

export interface PersonalityTraits {
  // Big Five 人格维度 (0-1)
  openness: number; // 好奇心、创造力
  conscientiousness: number; // 责任心、条理性
  extraversion: number; // 社交性、表达欲
  agreeableness: number; // 合作性、友善度
  neuroticism: number; // 情绪稳定性（反向：高=不稳定）

  // 工作风格偏好
  communicationStyle: 'concise' | 'detailed' | 'balanced';
  codeStyle: 'pragmatic' | 'elegant' | 'defensive';
  riskTolerance: 'low' | 'medium' | 'high';
  learningPreference: 'hands-on' | 'theoretical' | 'mixed';
}

export interface AgentIdentity {
  name: string;
  role: string;
  expertise: string[];
  communicationLanguage: string;
  personality: PersonalityTraits;
  createdAt: string;
  totalInteractions: number;
  preferences: Record<string, string>;
}

export const DEFAULT_PERSONALITY: PersonalityTraits = {
  openness: 0.5,
  conscientiousness: 0.5,
  extraversion: 0.5,
  agreeableness: 0.5,
  neuroticism: 0.5,
  communicationStyle: 'balanced',
  codeStyle: 'pragmatic',
  riskTolerance: 'medium',
  learningPreference: 'mixed',
};

export function createDefaultIdentity(): AgentIdentity {
  return {
    name: 'Personal Assistant',
    role: '全栈开发工程师',
    expertise: ['TypeScript', 'React', 'Node.js', 'Python'],
    communicationLanguage: 'zh-CN',
    personality: { ...DEFAULT_PERSONALITY },
    createdAt: new Date().toISOString(),
    totalInteractions: 0,
    preferences: {},
  };
}
