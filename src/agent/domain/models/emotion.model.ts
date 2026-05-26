/**
 * 情绪状态领域模型
 */

export type Emotion =
  | 'focused'
  | 'confident'
  | 'cautious'
  | 'curious'
  | 'frustrated'
  | 'excited'
  | 'tired'
  | 'neutral';

export interface EmotionalEvent {
  emotion: Emotion;
  intensity: number;
  timestamp: string;
  reason: string;
}

export interface EmotionalState {
  current: Emotion;
  intensity: number;
  history: EmotionalEvent[];
  mood: number;
  lastDecay: number;
}

/** 情绪建议接口 */
export interface EmotionSuggestion {
  behavior: string;
  caution: string;
}

/** 情绪优先级（数值越大优先级越高） */
export const EMOTION_PRIORITY: Record<Emotion, number> = {
  frustrated: 8,
  excited: 7,
  tired: 6,
  cautious: 5,
  confident: 4,
  curious: 3,
  focused: 2,
  neutral: 0,
};

/** 情绪描述映射 */
export const EMOTION_DESCRIPTION: Record<Emotion, string> = {
  focused: '专注',
  confident: '自信',
  cautious: '谨慎',
  curious: '好奇',
  frustrated: '有些挫败',
  excited: '兴奋',
  tired: '有些疲劳',
  neutral: '平静',
};

/** 情绪对心情的影响 */
export const MOOD_DELTA: Record<Emotion, number> = {
  frustrated: -0.25,
  excited: 0.3,
  tired: -0.1,
  cautious: -0.15,
  confident: 0.15,
  curious: 0.1,
  focused: 0.05,
  neutral: 0,
};
