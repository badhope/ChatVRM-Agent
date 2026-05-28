/**
 * 增强的情绪系统
 */

import type { Emotion, EmotionalEvent, EmotionalState, EmotionSuggestion } from '../models/emotion.model.js';
import { EMOTION_DESCRIPTION, EMOTION_PRIORITY, MOOD_DELTA } from '../models/emotion.model.js';

export interface EmotionTrigger {
  id: string;
  name: string;
  description: string;
  pattern: RegExp;
  targetEmotion: Emotion;
  intensity: number;
  confidence: number;
}

export interface MoodTrend {
  timestamp: string;
  mood: number;
  dominantEmotion?: Emotion;
}

export const EMOTION_TRIGGERS: EmotionTrigger[] = [
  {
    id: 'thank_you',
    name: '感谢',
    description: '用户表达感谢',
    pattern: /(谢谢|thanks?|thank you|awesome|great|perfect)/i,
    targetEmotion: 'excited',
    intensity: 0.6,
    confidence: 0.7,
  },
  {
    id: 'error_mentioned',
    name: '错误提及',
    description: '用户提到错误、问题',
    pattern: /(错误|bug|error|issue|problem|问题|不对)/i,
    targetEmotion: 'cautious',
    intensity: 0.5,
    confidence: 0.6,
  },
  {
    id: 'frustration',
    name: '挫败感',
    description: '用户表达不满或挫败',
    pattern: /(为什么|怎么回事|不工作|not working|broken|不对|糟糕)/i,
    targetEmotion: 'frustrated',
    intensity: 0.5,
    confidence: 0.65,
  },
  {
    id: 'new_idea',
    name: '新想法',
    description: '用户提出新想法或问题',
    pattern: /(如何|怎样|怎么|how to|how do|想|思考|想法|idea|创新)/i,
    targetEmotion: 'curious',
    intensity: 0.4,
    confidence: 0.5,
  },
  {
    id: 'complex_task',
    name: '复杂任务',
    description: '用户请求复杂或困难的任务',
    pattern: /(重构|重写|架构|design|architecture|refactor|复杂|difficult)/i,
    targetEmotion: 'focused',
    intensity: 0.7,
    confidence: 0.6,
  },
  {
    id: 'success_feedback',
    name: '成功反馈',
    description: '用户告知任务完成或成功',
    pattern: /(成功|完成|done|fixed|solve|work|好的)/i,
    targetEmotion: 'confident',
    intensity: 0.65,
    confidence: 0.55,
  },
];

export class EmotionServiceEnhanced {
  private static enhancedEmotionalState: EmotionalState = {
    current: 'neutral',
    intensity: 0,
    mood: 0,
    history: [],
    lastDecay: Date.now(),
  };

  private static moodHistory: MoodTrend[] = [];
  private static readonly MAX_MOOD_HISTORY = 1000;

  static clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }

  static createHistoryEntry(emotion: Emotion, intensity: number, reason: string): EmotionalEvent {
    return { emotion, intensity, timestamp: new Date().toISOString(), reason };
  }

  static getState(): EmotionalState {
    return { ...this.enhancedEmotionalState };
  }

  static setState(state: EmotionalState): void {
    this.enhancedEmotionalState = { ...state };
  }

  static applyDecay(): void {
    const now = Date.now();
    const timePassed = (now - this.enhancedEmotionalState.lastDecay) / 1000 / 60;

    if (timePassed > 1) {
      const decayFactor = Math.max(0, 1 - timePassed / 120);
      this.enhancedEmotionalState.intensity *= decayFactor;
      this.enhancedEmotionalState.mood *= decayFactor;
      this.enhancedEmotionalState.lastDecay = now;

      if (this.enhancedEmotionalState.intensity < 0.1) {
        this.enhancedEmotionalState.current = 'neutral';
      }
    }
  }

  static updateEmotion(
    emotion: Emotion,
    intensity: number,
    reason: string = 'unknown'
  ): void {
    this.applyDecay();

    const currentPriority = EMOTION_PRIORITY[this.enhancedEmotionalState.current];
    const newPriority = EMOTION_PRIORITY[emotion];

    if (newPriority > currentPriority || intensity > this.enhancedEmotionalState.intensity) {
      this.enhancedEmotionalState.current = emotion;
      this.enhancedEmotionalState.intensity = this.clamp(intensity, 0, 1);
    } else {
      const blendedIntensity =
        (this.enhancedEmotionalState.intensity * 0.7) + (intensity * 0.3);
      this.enhancedEmotionalState.intensity = this.clamp(blendedIntensity, 0, 1);
    }

    const moodDelta = MOOD_DELTA[emotion] || 0;
    this.enhancedEmotionalState.mood = this.clamp(
      this.enhancedEmotionalState.mood + moodDelta * intensity,
      -1,
      1
    );

    this.enhancedEmotionalState.history.push(this.createHistoryEntry(emotion, intensity, reason));
    if (this.enhancedEmotionalState.history.length > 200) {
      this.enhancedEmotionalState.history.shift();
    }

    this.recordMoodTrend();
  }

  static detectEmotionFromText(text: string): {
    emotion: Emotion;
    intensity: number;
    confidence: number;
    matchedTriggers: string[];
  } {
    const matched: EmotionTrigger[] = [];
    let highestConfidence = 0;
    let strongestTrigger: EmotionTrigger | null = null;

    for (const trigger of EMOTION_TRIGGERS) {
      if (trigger.pattern.test(text)) {
        matched.push(trigger);
        if (trigger.confidence > highestConfidence) {
          highestConfidence = trigger.confidence;
          strongestTrigger = trigger;
        }
      }
    }

    if (matched.length === 0) {
      return {
        emotion: 'neutral',
        intensity: 0.1,
        confidence: 0.3,
        matchedTriggers: [],
      };
    }

    const dominant = strongestTrigger!;
    let combinedIntensity = dominant.intensity;
    for (const t of matched) {
      if (t.targetEmotion === dominant.targetEmotion) {
        combinedIntensity = Math.min(1, combinedIntensity + t.intensity * 0.3);
      }
    }

    return {
      emotion: dominant.targetEmotion,
      intensity: combinedIntensity,
      confidence: Math.min(1, highestConfidence + (matched.length - 1) * 0.1),
      matchedTriggers: matched.map(t => t.id),
    };
  }

  static respondToUserMessage(text: string): {
    suggestedEmotion: Emotion;
    intensity: number;
    confidence: number;
    context: string;
  } {
    const detection = this.detectEmotionFromText(text);

    this.updateEmotion(
      detection.emotion,
      detection.intensity,
      `user_message: ${text.substring(0, 50)}`
    );

    const suggestions = this.getEnhancedBehaviorSuggestions(detection.emotion);

    return {
      suggestedEmotion: detection.emotion,
      intensity: detection.intensity,
      confidence: detection.confidence,
      context: suggestions.context,
    };
  }

  static getEnhancedBehaviorSuggestions(emotion: Emotion): {
    behavior: string;
    caution: string;
    context: string;
  } {
    const suggestions: Record<
      Emotion,
      { behavior: string; caution: string; context: string }
    > = {
      frustrated: {
        behavior: '更加谨慎，仔细检查每一步，避免急躁，提供更详细的验证',
        caution: '当前情绪较低，建议放慢节奏，先确认问题的准确性质',
        context: '表现出耐心和关怀，确保用户感到被理解',
      },
      excited: {
        behavior: '保持热情，但注意不要忽略细节，确保方案的周全性',
        caution: '兴奋时容易忽略细节，请保持警觉，进行必要的验证',
        context: '分享这份兴奋，但保持专业和准确',
      },
      tired: {
        behavior: '优先处理关键任务，适当简化非核心步骤，确保核心功能正确',
        caution: '疲劳可能影响判断质量，建议多做验证',
        context: '保持友好，但明确表示需要专注于质量',
      },
      cautious: {
        behavior: '多做验证，确保方案正确后再执行，提供完整的预览',
        caution: '谨慎是好的，但不要过度犹豫，也要保持进度',
        context: '展示你的思考过程，让用户了解你的谨慎',
      },
      confident: {
        behavior: '可以适当提高效率，信任已有的判断，但仍然保持验证',
        caution: '保持自信，但也要验证关键假设，不要过度自信',
        context: '展现专业和自信，同时保持开放接受反馈',
      },
      curious: {
        behavior: '积极探索新方案，但保持理性评估，全面考虑可能性',
        caution: '好奇心有助于发现新思路，但也要注重实用性',
        context: '展示你的探索过程和创新思维',
      },
      focused: {
        behavior: '保持专注，减少不必要的分支，深入当前问题',
        caution: '专注模式下注意不要忽略重要上下文',
        context: '展现深度思考和专业专注力',
      },
      neutral: {
        behavior: '',
        caution: '',
        context: '保持平衡和专业',
      },
    };
    return suggestions[emotion];
  }

  static getEmotionalContext(): string {
    const st = this.enhancedEmotionalState;
    if (st.current === 'neutral' && Math.abs(st.mood) < 0.1) return '';

    const parts: string[] = ['[当前情绪状态]'];
    parts.push(
      `情绪: ${EMOTION_DESCRIPTION[st.current]} (强度: ${Math.round(st.intensity * 100)}%)`
    );

    if (st.mood > 0.3) {
      parts.push('整体心情: 积极');
    } else if (st.mood < -0.3) {
      parts.push('整体心情: 消极');
    }

    const moodTrend = this.getMoodTrend();
    if (moodTrend !== 'stable') {
      parts.push(`心情趋势: ${moodTrend}`);
    }

    const suggest = this.getEnhancedBehaviorSuggestions(st.current);
    if (suggest.behavior) {
      parts.push(`行为建议: ${suggest.behavior}`);
    }
    if (suggest.context) {
      parts.push(`沟通建议: ${suggest.context}`);
    }

    return parts.join('\n');
  }

  static recordMoodTrend(): void {
    this.moodHistory.push({
      timestamp: new Date().toISOString(),
      mood: this.enhancedEmotionalState.mood,
      dominantEmotion: this.enhancedEmotionalState.current,
    });

    if (this.moodHistory.length > this.MAX_MOOD_HISTORY) {
      this.moodHistory.shift();
    }
  }

  static getMoodTrend(): 'improving' | 'deteriorating' | 'stable' {
    if (this.moodHistory.length < 10) {
      return 'stable';
    }

    const recent = this.moodHistory.slice(-10);
    const older = this.moodHistory.slice(-20, -10);

    if (older.length === 0) {
      return 'stable';
    }

    const recentAvg = recent.reduce((sum, t) => sum + t.mood, 0) / recent.length;
    const olderAvg = older.reduce((sum, t) => sum + t.mood, 0) / older.length;

    const diff = recentAvg - olderAvg;
    if (Math.abs(diff) < 0.05) {
      return 'stable';
    }
    return diff > 0 ? 'improving' : 'deteriorating';
  }

  static getMoodHistory(limit: number = 50): MoodTrend[] {
    return this.moodHistory.slice(-limit);
  }

  static getDominantEmotions(durationMinutes: number = 60): Array<{
    emotion: Emotion;
    count: number;
    totalIntensity: number;
  }> {
    const cutoff = Date.now() - durationMinutes * 60 * 1000;
    const recent = this.enhancedEmotionalState.history.filter(
      e => new Date(e.timestamp).getTime() > cutoff
    );

    const counts: Record<string, { count: number; totalIntensity: number }> = {};

    for (const e of recent) {
      if (!counts[e.emotion]) {
        counts[e.emotion] = { count: 0, totalIntensity: 0 };
      }
      counts[e.emotion].count++;
      counts[e.emotion].totalIntensity += e.intensity;
    }

    return Object.entries(counts)
      .map(([emotion, data]) => ({
        emotion: emotion as Emotion,
        count: data.count,
        totalIntensity: data.totalIntensity,
      }))
      .sort((a, b) => b.count - a.count);
  }

  static resetEmotionalState(): void {
    this.enhancedEmotionalState = {
      current: 'neutral',
      intensity: 0,
      mood: 0,
      history: [],
      lastDecay: Date.now(),
    };
    this.moodHistory = [];
  }

  static onUserPraise(reason: string = '用户表扬'): void {
    this.updateEmotion('confident', 0.8, reason);
  }

  static onUserCorrection(reason: string = '用户纠正'): void {
    this.updateEmotion('cautious', 0.6, reason);
  }

  static onNewChallenge(reason: string = '新挑战'): void {
    this.updateEmotion('curious', 0.5, reason);
  }

  static onTaskSuccess(reason: string = '任务成功'): void {
    this.updateEmotion('excited', 0.7, reason);
  }

  static onTaskFailure(reason: string = '任务失败'): void {
    this.updateEmotion('frustrated', 0.6, reason);
  }
}
