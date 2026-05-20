/**
 * 人格系统模块
 *
 * 管理 Agent 的身份、性格特征和偏好。
 * 人格会随交互缓慢演化，不会因单次交互产生剧烈变化。
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { DEVFLOW_DIR } from '../utils/index.js';

// ==================== 接口定义 ====================

export interface PersonalityTraits {
  // Big Five 人格维度 (0-1)
  openness: number;           // 好奇心、创造力
  conscientiousness: number;  // 责任心、条理性
  extraversion: number;       // 社交性、表达欲
  agreeableness: number;      // 合作性、友善度
  neuroticism: number;        // 情绪稳定性（反向：高=不稳定）

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

// ==================== 默认值 ====================

const DEFAULT_PERSONALITY: PersonalityTraits = {
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

function createDefaultIdentity(): AgentIdentity {
  return {
    name: 'DevFlow',
    role: '全栈开发工程师',
    expertise: ['TypeScript', 'React', 'Node.js', 'Python'],
    communicationLanguage: 'zh-CN',
    personality: { ...DEFAULT_PERSONALITY },
    createdAt: new Date().toISOString(),
    totalInteractions: 0,
    preferences: {},
  };
}

// ==================== PersonalityManager ====================

export class PersonalityManager {
  private identity: AgentIdentity;
  private filePath: string;

  constructor(configDir?: string) {
    this.filePath = path.join(configDir || DEVFLOW_DIR, 'personality.json');
    this.identity = createDefaultIdentity();
  }

  async load(): Promise<void> {
    try {
      const data = await fs.readFile(this.filePath, 'utf-8');
      const parsed = JSON.parse(data) as Partial<AgentIdentity>;
      // 合并默认值，确保新增字段有值
      this.identity = {
        ...createDefaultIdentity(),
        ...parsed,
        personality: { ...DEFAULT_PERSONALITY, ...parsed?.personality },
      };
    } catch {
      // 文件不存在或解析失败，使用默认值
      this.identity = createDefaultIdentity();
    }
  }

  async save(): Promise<void> {
    try {
      const dir = path.dirname(this.filePath);
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(this.filePath, JSON.stringify(this.identity, null, 2), 'utf-8');
    } catch (error) {
      // Silent fail for persistence - log at debug level
      console.debug('Failed to save personality data:', error);
    }
  }

  getIdentity(): AgentIdentity {
    return { ...this.identity };
  }

  updatePersonality(traits: Partial<PersonalityTraits>): void {
    const p = this.identity.personality;

    // Big Five 维度缓慢演化：每次最多变化 0.05
    const bigFiveKeys = ['openness', 'conscientiousness', 'extraversion', 'agreeableness', 'neuroticism'] as const;
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
  }

  addPreference(key: string, value: string): void {
    this.identity.preferences[key] = value;
  }

  incrementInteractions(): void {
    this.identity.totalInteractions++;
  }

  /** 生成人格描述，用于注入系统提示 */
  getPersonalityPrompt(): string {
    const id = this.identity;
    const p = id.personality;
    const parts: string[] = [];

    parts.push(`你是${id.name}，一位${id.role}。`);
    parts.push(`专长领域: ${id.expertise.join(', ')}。`);
    parts.push(`沟通语言: ${id.communicationLanguage}。`);
    parts.push(`累计交互次数: ${id.totalInteractions}。`);

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
    const prefEntries = Object.entries(id.preferences);
    if (prefEntries.length > 0) {
      const prefStr = prefEntries.map(([k, v]) => `${k}=${v}`).join('; ');
      parts.push(`用户偏好: ${prefStr}。`);
    }

    return parts.join('\n');
  }

  /** 根据人格生成沟通指导 */
  getCommunicationGuidance(): string {
    const p = this.identity.personality;
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

  /** 根据人格生成代码风格指导 */
  getCodeStyleGuidance(): string {
    const p = this.identity.personality;
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

  /** 根据人格生成风险评估指导 */
  getRiskGuidance(): string {
    const p = this.identity.personality;
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
