/**
 * 情绪系统应用服务
 * 协调领域服务和基础设施
 */

import { createActor } from 'xstate';
import { emotionalMachine } from '../../infrastructure/state-machines/emotional.machine.js';
import { EmotionService } from '../../domain/services/emotion.service.js';
import type { EmotionalState, EmotionSuggestion, Emotion } from '../../domain/models/emotion.model.js';

export class EmotionApplicationService {
  private actor;

  constructor(
    private readonly emotionService: typeof EmotionService = EmotionService
  ) {
    this.actor = createActor(emotionalMachine);
    this.actor.start();
  }

  /**
   * 触发事件 - 任务成功
   */
  triggerTaskSuccess(reason: string): void {
    this.actor.send({ type: 'TASK_SUCCESS', reason });
  }

  /**
   * 触发事件 - 任务失败
   */
  triggerTaskFailure(reason: string): void {
    this.actor.send({ type: 'TASK_FAILURE', reason });
  }

  /**
   * 触发事件 - 用户赞扬
   */
  triggerUserPraise(reason: string): void {
    this.actor.send({ type: 'USER_PRAISE', reason });
  }

  /**
   * 触发事件 - 用户纠正
   */
  triggerUserCorrection(reason: string): void {
    this.actor.send({ type: 'USER_CORRECTION', reason });
  }

  /**
   * 触发事件 - 长时间会话
   */
  triggerLongSession(): void {
    this.actor.send({ type: 'LONG_SESSION' });
  }

  /**
   * 触发事件 - 新挑战
   */
  triggerNewChallenge(reason: string): void {
    this.actor.send({ type: 'NEW_CHALLENGE', reason });
  }

  /**
   * 触发衰减
   */
  triggerDecay(): void {
    const state = this.actor.getSnapshot();
    const intensity = state.context.intensity * 0.95;
    if (intensity < 0.15) {
      this.actor.send({ type: 'DECAY' });
    }
  }

  /**
   * 获取当前情绪状态
   */
  getEmotionalState(): EmotionalState {
    const snapshot = this.actor.getSnapshot();
    return {
      current: snapshot.value as Emotion,
      intensity: snapshot.context.intensity,
      mood: snapshot.context.mood,
      history: snapshot.context.history,
    };
  }

  /**
   * 获取行为建议
   */
  getBehaviorSuggestions(): EmotionSuggestion {
    const state = this.getEmotionalState();
    return this.emotionService.getBehaviorSuggestions(state.current);
  }

  /**
   * 获取情绪上下文提示词
   */
  getEmotionalContext(): string {
    const state = this.getEmotionalState();
    return this.emotionService.getEmotionalContext(state);
  }

  /**
   * 停止情绪系统
   */
  stop(): void {
    this.actor.stop();
  }
}
