/**
 * 情绪状态领域服务
 * 纯业务逻辑，无基础设施依赖
 */

import type { Emotion, EmotionalEvent, EmotionalState, EmotionSuggestion } from '../models/emotion.model.js';
import { EMOTION_DESCRIPTION, EMOTION_PRIORITY, MOOD_DELTA } from '../models/emotion.model.js';

// 全局情绪状态
let globalEmotionalState: EmotionalState = {
  current: 'neutral',
  intensity: 0,
  mood: 0,
  history: [],
  lastDecay: Date.now(),
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function getEventReason(event: unknown): string {
  if (event && typeof event === 'object' && 'reason' in event) {
    return (event as { reason: string }).reason;
  }
  return 'unknown';
}

function createHistoryEntry(emotion: Emotion, intensity: number, reason: string): EmotionalEvent {
  return { emotion, intensity, timestamp: new Date().toISOString(), reason };
}

export class EmotionService {
  /**
   * 创建历史记录
   */
  static createHistoryEntry(emotion: Emotion, intensity: number, reason: string): EmotionalEvent {
    return createHistoryEntry(emotion, intensity, reason);
  }

  /**
   * 数值限制
   */
  static clamp(value: number, min: number, max: number): number {
    return clamp(value, min, max);
  }

  /**
   * 获取行为建议
   */
  static getBehaviorSuggestions(emotion: Emotion): EmotionSuggestion {
    const suggestions: Record<Emotion, EmotionSuggestion> = {
      frustrated: {
        behavior: '更加谨慎，仔细检查每一步，避免急躁',
        caution: '当前情绪较低，建议放慢节奏',
      },
      excited: {
        behavior: '保持热情，但注意不要忽略细节',
        caution: '兴奋时容易忽略细节，请保持警觉',
      },
      tired: { behavior: '优先处理关键任务，适当简化非核心步骤', caution: '疲劳可能影响判断质量' },
      cautious: {
        behavior: '多做验证，确保方案正确后再执行',
        caution: '谨慎是好的，但不要过度犹豫',
      },
      confident: {
        behavior: '可以适当提高效率，信任已有的判断',
        caution: '保持自信，但也要验证关键假设',
      },
      curious: { behavior: '积极探索新方案，但保持理性评估', caution: '好奇心有助于发现新思路' },
      focused: {
        behavior: '保持专注，减少不必要的分支',
        caution: '专注模式下注意不要忽略重要上下文',
      },
      neutral: { behavior: '', caution: '' },
    };
    return suggestions[emotion];
  }

  /**
   * 获取情绪上下文
   */
  static getEmotionalContext(state?: EmotionalState): string {
    const st = state || globalEmotionalState;
    if (st.current === 'neutral' && Math.abs(st.mood) < 0.1) return '';
    const parts: string[] = ['[当前情绪状态]'];
    parts.push(
      `情绪: ${EMOTION_DESCRIPTION[st.current]} (强度: ${Math.round(st.intensity * 100)}%)`
    );
    if (st.mood > 0.2) parts.push('整体心情: 积极');
    else if (st.mood < -0.2) parts.push('整体心情: 消极');
    const suggest = this.getBehaviorSuggestions(st.current);
    if (suggest.behavior) parts.push(`行为建议: ${suggest.behavior}`);
    return parts.join('\n');
  }

  /**
   * 获取当前情绪状态
   */
  static getState(): EmotionalState {
    return { ...globalEmotionalState };
  }

  /**
   * 设置情绪状态
   */
  static setState(state: EmotionalState): void {
    globalEmotionalState = { ...state };
  }

  /**
   * 情绪衰减
   */
  static applyDecay(): void {
    const now = Date.now();
    const timePassed = (now - globalEmotionalState.lastDecay) / 1000 / 60; // 分钟

    if (timePassed > 1) {
      const decayFactor = Math.max(0, 1 - timePassed / 60); // 1小时完全衰减
      globalEmotionalState.intensity *= decayFactor;
      globalEmotionalState.mood *= decayFactor;
      globalEmotionalState.lastDecay = now;

      if (globalEmotionalState.intensity < 0.1) {
        globalEmotionalState.current = 'neutral';
      }
    }
  }

  /**
   * 更新情绪（通用方法）
   */
  static updateEmotion(emotion: Emotion, intensity: number, reason: string = 'unknown'): void {
    // 情绪衰减
    this.applyDecay();

    // 立即设置情绪
    globalEmotionalState.current = emotion;
    globalEmotionalState.intensity = clamp(intensity, 0, 1);

    // 更新心情
    const moodDelta = MOOD_DELTA[emotion] || 0;
    globalEmotionalState.mood = clamp(globalEmotionalState.mood + moodDelta * intensity, -1, 1);

    // 记录历史
    globalEmotionalState.history.push(createHistoryEntry(emotion, intensity, reason));
    if (globalEmotionalState.history.length > 100) {
      globalEmotionalState.history.shift();
    }
  }

  /**
   * 用户表扬
   */
  static onUserPraise(reason: string = '用户表扬'): void {
    this.updateEmotion('confident', 0.8, reason);
  }

  /**
   * 用户纠正
   */
  static onUserCorrection(reason: string = '用户纠正'): void {
    this.updateEmotion('cautious', 0.6, reason);
  }

  /**
   * 新挑战
   */
  static onNewChallenge(reason: string = '新挑战'): void {
    this.updateEmotion('curious', 0.5, reason);
  }

  /**
   * 任务成功
   */
  static onTaskSuccess(reason: string = '任务成功'): void {
    this.updateEmotion('excited', 0.7, reason);
  }

  /**
   * 任务失败
   */
  static onTaskFailure(reason: string = '任务失败'): void {
    this.updateEmotion('frustrated', 0.6, reason);
  }
}
