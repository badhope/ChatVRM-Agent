/**
 * 情绪状态系统模块（向后兼容层）
 * @deprecated 使用 domain/models, domain/services 和 infrastructure/state-machines
 *
 * 使用 XState 状态机管理 Agent 的实时情绪状态。
 * 提供类型安全的状态转换和可预测的行为。
 */

import { createActor } from 'xstate';
import { emotionalMachine } from './infrastructure/state-machines/emotional.machine.js';
import { EmotionService } from './domain/services/emotion.service.js';
import {
  EMOTION_PRIORITY,
  EMOTION_DESCRIPTION,
  MOOD_DELTA,
} from './domain/models/emotion.model.js';

// 重新导出类型（保持向后兼容）
export type { Emotion, EmotionalEvent, EmotionalState, EmotionSuggestion } from './domain/models/emotion.model.js';
export { EMOTION_PRIORITY, EMOTION_DESCRIPTION, MOOD_DELTA };

// ==================== EmotionalStateManager（兼容层） ====================

export class EmotionalStateManager {
  private actor;

  constructor() {
    this.actor = createActor(emotionalMachine);
    this.actor.start();
  }

  onTaskSuccess(description: string): void {
    this.actor.send({ type: 'TASK_SUCCESS', reason: description });
  }
  onTaskFailure(description: string): void {
    this.actor.send({ type: 'TASK_FAILURE', reason: description });
  }
  onUserPraise(description: string): void {
    this.actor.send({ type: 'USER_PRAISE', reason: description });
  }
  onUserCorrection(description: string): void {
    this.actor.send({ type: 'USER_CORRECTION', reason: description });
  }
  onLongSession(): void {
    this.actor.send({ type: 'LONG_SESSION' });
  }
  onNewChallenge(description: string): void {
    this.actor.send({ type: 'NEW_CHALLENGE', reason: description });
  }

  getCurrentEmotion(): any {
    return this.actor.getSnapshot().value;
  }
  getMoodScore(): number {
    return this.actor.getSnapshot().context.mood;
  }

  getState(): any {
    const snapshot = this.actor.getSnapshot();
    return {
      current: snapshot.value,
      intensity: snapshot.context.intensity,
      history: snapshot.context.history,
      mood: snapshot.context.mood,
    };
  }

  getSuggestions(): any {
    return EmotionService.getBehaviorSuggestions(this.getCurrentEmotion());
  }

  getEmotionalContext(): string {
    const state = this.getState();
    return EmotionService.getEmotionalContext(state);
  }

  decay(): void {
    const snapshot = this.actor.getSnapshot();
    const newIntensity = Math.max(0.1, snapshot.context.intensity * 0.95);
    if (newIntensity < 0.15 && snapshot.value !== 'neutral') this.actor.send({ type: 'DECAY' });
  }

  reset(): void {
    this.actor.send({ type: 'RESET' });
  }
  stop(): void {
    this.actor.stop();
  }
}
