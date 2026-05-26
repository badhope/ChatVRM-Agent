/**
 * 情绪状态领域服务
 * 纯业务逻辑，无基础设施依赖
 */

import type { Emotion, EmotionalEvent, EmotionalState, EmotionSuggestion } from '../models/emotion.model.js';
import { EMOTION_DESCRIPTION, EMOTION_PRIORITY, MOOD_DELTA } from '../models/emotion.model.js';

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
  static createHistoryEntry(emotion: Emotion, intensity: number, reason: string): EmotionalEvent {
    return createHistoryEntry(emotion, intensity, reason);
  }

  static clamp(value: number, min: number, max: number): number {
    return clamp(value, min, max);
  }

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

  static getEmotionalContext(state: EmotionalState): string {
    if (state.current === 'neutral' && Math.abs(state.mood) < 0.1) return '';
    const parts: string[] = ['[当前情绪状态]'];
    parts.push(
      `情绪: ${EMOTION_DESCRIPTION[state.current]} (强度: ${Math.round(state.intensity * 100)}%)`
    );
    if (state.mood > 0.2) parts.push('整体心情: 积极');
    else if (state.mood < -0.2) parts.push('整体心情: 消极');
    const suggestions = this.getBehaviorSuggestions(state.current);
    if (suggestions.behavior) parts.push(`行为建议: ${suggestions.behavior}`);
    return parts.join('\n');
  }
}
