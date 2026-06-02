import { describe, it, expect } from 'vitest';
import { EmotionService } from '../../../domain/personality/emotion.service.js';
import type { EmotionState } from '../../../domain/personality/emotion.service.js';

describe('EmotionService', () => {
  describe('should create default neutral emotion', () => {
    it('should return neutral with intensity 20', () => {
      const emotion = EmotionService.createDefaultEmotion();

      expect(emotion.name).toBe('neutral');
      expect(emotion.intensity).toBe(20);
    });

    it('should have empty triggers', () => {
      const emotion = EmotionService.createDefaultEmotion();

      expect(emotion.triggers).toEqual([]);
    });

    it('should have lastUpdated set', () => {
      const emotion = EmotionService.createDefaultEmotion();

      expect(emotion.lastUpdated).toBeDefined();
      expect(typeof emotion.lastUpdated).toBe('string');
    });
  });

  describe('should apply decay to reduce intensity', () => {
    it('should reduce intensity by decay rate', () => {
      const emotion: EmotionState = {
        name: 'confident',
        intensity: 50,
        lastUpdated: new Date().toISOString(),
        triggers: [],
      };

      const decayed = EmotionService.applyDecay(emotion);

      expect(decayed.intensity).toBe(40);
    });

    it('should reset to neutral when intensity drops to 5 or below', () => {
      const emotion: EmotionState = {
        name: 'confident',
        intensity: 10,
        lastUpdated: new Date().toISOString(),
        triggers: ['test'],
      };

      const decayed = EmotionService.applyDecay(emotion);

      expect(decayed.name).toBe('neutral');
      expect(decayed.intensity).toBe(0);
      expect(decayed.triggers).toEqual([]);
    });

    it('should use default emotion when none provided', () => {
      const decayed = EmotionService.applyDecay();

      expect(decayed.name).toBe('neutral');
      expect(decayed.intensity).toBe(10);
    });
  });

  describe('should shift to positive on task success', () => {
    it('should increase intensity and set confident', () => {
      const emotion = EmotionService.createDefaultEmotion();

      const result = EmotionService.onTaskSuccess('refactored code', emotion);

      expect(result.intensity).toBeGreaterThan(emotion.intensity);
      expect(['confident', 'excited']).toContain(result.name);
    });

    it('should become excited at high intensity', () => {
      const emotion: EmotionState = {
        name: 'confident',
        intensity: 60,
        lastUpdated: new Date().toISOString(),
        triggers: [],
      };

      const result = EmotionService.onTaskSuccess('major feature', emotion);

      expect(result.name).toBe('excited');
      expect(result.intensity).toBe(85);
    });

    it('should record task_success trigger', () => {
      const emotion = EmotionService.createDefaultEmotion();

      const result = EmotionService.onTaskSuccess('finished build', emotion);

      expect(result.triggers.some((t) => t.startsWith('task_success:'))).toBe(true);
    });
  });

  describe('should shift to negative on task failure', () => {
    it('should set frustrated on failure', () => {
      const emotion = EmotionService.createDefaultEmotion();

      const result = EmotionService.onTaskFailure('build failed', emotion);

      expect(result.name).toBe('frustrated');
      expect(result.intensity).toBeGreaterThan(emotion.intensity);
    });

    it('should record task_failure trigger', () => {
      const emotion = EmotionService.createDefaultEmotion();

      const result = EmotionService.onTaskFailure('compile error', emotion);

      expect(result.triggers.some((t) => t.startsWith('task_failure:'))).toBe(true);
    });
  });

  describe('should detect positive sentiment keywords', () => {
    it('should shift to confident for positive messages', async () => {
      const emotion = EmotionService.createDefaultEmotion();

      const result = await EmotionService.onUserInteraction('great job, this is amazing!', emotion);

      expect(['confident', 'excited']).toContain(result.name);
    });

    it('should increase intensity with multiple positive keywords', async () => {
      const emotion: EmotionState = {
        name: 'neutral',
        intensity: 30,
        lastUpdated: new Date().toISOString(),
        triggers: [],
      };

      const result = await EmotionService.onUserInteraction(
        'great awesome wonderful excellent fantastic',
        emotion,
      );

      expect(result.intensity).toBeGreaterThan(30);
    });
  });

  describe('should detect negative sentiment keywords', () => {
    it('should shift to frustrated for negative messages', async () => {
      const emotion = EmotionService.createDefaultEmotion();

      const result = await EmotionService.onUserInteraction('this is terrible and broken', emotion);

      expect(result.name).toBe('frustrated');
    });

    it('should decrease intensity for negative keywords', async () => {
      const emotion: EmotionState = {
        name: 'confident',
        intensity: 50,
        lastUpdated: new Date().toISOString(),
        triggers: [],
      };

      const result = await EmotionService.onUserInteraction(
        'bad wrong error fail broken',
        emotion,
      );

      expect(result.intensity).toBeLessThan(50);
    });
  });

  describe('should generate emotional context string', () => {
    it('should generate context for neutral emotion', () => {
      const context = EmotionService.getEmotionalContext();

      expect(context).toContain('balanced');
      expect(context).toContain('composed');
    });

    it('should generate context for excited emotion', () => {
      const emotion: EmotionState = {
        name: 'excited',
        intensity: 80,
        lastUpdated: new Date().toISOString(),
        triggers: ['great job'],
      };

      const context = EmotionService.getEmotionalContext(emotion);

      expect(context).toContain('enthusiastic');
      expect(context).toContain('strong feeling');
    });

    it('should include triggers in context', () => {
      const emotion: EmotionState = {
        name: 'confident',
        intensity: 50,
        lastUpdated: new Date().toISOString(),
        triggers: ['task_success:refactor', 'interaction'],
      };

      const context = EmotionService.getEmotionalContext(emotion);

      expect(context).toContain('task_success:refactor');
      expect(context).toContain('interaction');
    });

    it('should default when no state provided', () => {
      const context = EmotionService.getEmotionalContext();

      expect(context).toContain('none');
    });
  });
});