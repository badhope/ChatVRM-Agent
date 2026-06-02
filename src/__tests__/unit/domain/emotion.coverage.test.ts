import { describe, it, expect } from 'vitest';
import { EmotionService } from '../../../domain/personality/emotion.service.js';
import type { EmotionState } from '../../../domain/personality/emotion.service.js';

describe('EmotionService onUserInteraction coverage', () => {
  describe('negative keyword detection', () => {
    it('should detect "bad" as negative keyword', async () => {
      const emotion = EmotionService.createDefaultEmotion();

      const result = await EmotionService.onUserInteraction('this is bad', emotion);

      expect(result.name).toBe('frustrated');
    });

    it('should detect "terrible" as negative keyword', async () => {
      const emotion = EmotionService.createDefaultEmotion();

      const result = await EmotionService.onUserInteraction('that is terrible', emotion);

      expect(result.name).toBe('frustrated');
    });

    it('should detect "hate" as negative keyword', async () => {
      const emotion = EmotionService.createDefaultEmotion();

      const result = await EmotionService.onUserInteraction('I hate this bug', emotion);

      expect(result.name).toBe('frustrated');
    });

    it('should detect "disappointed" as negative keyword', async () => {
      const emotion = EmotionService.createDefaultEmotion();

      const result = await EmotionService.onUserInteraction('I am disappointed with the result', emotion);

      expect(result.name).toBe('frustrated');
    });

    it('should detect "error" and "fail" in same message', async () => {
      const emotion: EmotionState = {
        name: 'confident',
        intensity: 50,
        lastUpdated: new Date().toISOString(),
        triggers: [],
      };

      const result = await EmotionService.onUserInteraction('an error caused the build to fail', emotion);

      expect(result.name).toBe('frustrated');
    });

    it('should detect "broken" and "wrong" in same message', async () => {
      const emotion = EmotionService.createDefaultEmotion();

      const result = await EmotionService.onUserInteraction('everything is broken and wrong', emotion);

      expect(result.name).toBe('frustrated');
    });

    it('should detect "awful" as negative keyword', async () => {
      const emotion = EmotionService.createDefaultEmotion();

      const result = await EmotionService.onUserInteraction('this is awful', emotion);

      expect(result.name).toBe('frustrated');
    });

    it('should detect "stupid" as negative keyword', async () => {
      const emotion = EmotionService.createDefaultEmotion();

      const result = await EmotionService.onUserInteraction('this is so stupid', emotion);

      expect(result.name).toBe('frustrated');
    });

    it('should detect "useless" as negative keyword', async () => {
      const emotion = EmotionService.createDefaultEmotion();

      const result = await EmotionService.onUserInteraction('this tool is useless', emotion);

      expect(result.name).toBe('frustrated');
    });

    it('should detect "frustrating" as negative keyword', async () => {
      const emotion = EmotionService.createDefaultEmotion();

      const result = await EmotionService.onUserInteraction('debugging is frustrating', emotion);

      expect(result.name).toBe('frustrated');
    });

    it('should detect "annoying" as negative keyword', async () => {
      const emotion = EmotionService.createDefaultEmotion();

      const result = await EmotionService.onUserInteraction('these errors are annoying', emotion);

      expect(result.name).toBe('frustrated');
    });

    it('should detect "not working" as negative keyword', async () => {
      const emotion = EmotionService.createDefaultEmotion();

      const result = await EmotionService.onUserInteraction('the server is not working', emotion);

      expect(result.name).toBe('frustrated');
    });

    it('should detect "incorrect" as negative keyword', async () => {
      const emotion = EmotionService.createDefaultEmotion();

      const result = await EmotionService.onUserInteraction('the output is incorrect', emotion);

      expect(result.name).toBe('frustrated');
    });
  });

  describe('negative message should shift toward negative emotion', () => {
    it('should decrease intensity with negative keywords from confident state', async () => {
      const emotion: EmotionState = {
        name: 'confident',
        intensity: 50,
        lastUpdated: new Date().toISOString(),
        triggers: [],
      };

      const result = await EmotionService.onUserInteraction('bad terrible awful hate', emotion);

      expect(result.name).toBe('frustrated');
      expect(result.intensity).toBeLessThan(50);
    });

    it('should change to frustrated with negative keywords', async () => {
      const emotion = EmotionService.createDefaultEmotion();

      const result = await EmotionService.onUserInteraction(
        'this is terrible and frustrating',
        emotion,
      );

      expect(result.name).toBe('frustrated');
    });

    it('should record interaction trigger on negative message', async () => {
      const emotion = EmotionService.createDefaultEmotion();

      const result = await EmotionService.onUserInteraction('this is bad and broken', emotion);

      expect(result.triggers.some((t: string) => t.startsWith('interaction'))).toBe(true);
    });
  });

  describe('neutral message should keep current emotion', () => {
    it('should keep neutral name when message has no keywords', async () => {
      const emotion = EmotionService.createDefaultEmotion();

      const result = await EmotionService.onUserInteraction('what is the weather today', emotion);

      expect(result.name).toBe('neutral');
    });

    it('should not change intensity significantly for neutral message', async () => {
      const emotion = EmotionService.createDefaultEmotion();
      const originalIntensity = emotion.intensity;

      const result = await EmotionService.onUserInteraction('hello world', emotion);

      expect(Math.abs(result.intensity - originalIntensity)).toBeLessThanOrEqual(10);
    });

    it('should preserve confident name when message has no keywords', async () => {
      const emotion: EmotionState = {
        name: 'confident',
        intensity: 45,
        lastUpdated: new Date().toISOString(),
        triggers: [],
      };

      const result = await EmotionService.onUserInteraction('let me think about it', emotion);

      expect(result.name).toBe('confident');
    });
  });

  describe('mixed positive and negative keywords', () => {
    it('should handle both positive and negative keywords', async () => {
      const emotion = EmotionService.createDefaultEmotion();

      const result = await EmotionService.onUserInteraction(
        'great job but this is still broken and bad',
        emotion,
      );

      expect(result.intensity).toBeDefined();
    });

    it('should shift to frustrated when negative keywords outweigh positive', async () => {
      const emotion = EmotionService.createDefaultEmotion();

      const result = await EmotionService.onUserInteraction(
        'great but terrible broken awful bad error fail',
        emotion,
      );

      expect(result.name).toBe('frustrated');
    });

    it('should shift to confident when positive keywords outweigh negative', async () => {
      const emotion = EmotionService.createDefaultEmotion();

      const result = await EmotionService.onUserInteraction(
        'great awesome amazing wonderful excellent bad',
        emotion,
      );

      expect(result.name).toBe('confident');
    });
  });

  describe('empty string input', () => {
    it('should not change state with empty string', async () => {
      const emotion = EmotionService.createDefaultEmotion();

      const result = await EmotionService.onUserInteraction('', emotion);

      expect(result.name).toBe('neutral');
      expect(result.intensity).toBe(emotion.intensity);
    });

    it('should not change state with whitespace-only string', async () => {
      const emotion = EmotionService.createDefaultEmotion();

      const result = await EmotionService.onUserInteraction('   ', emotion);

      expect(result.name).toBe('neutral');
      expect(result.intensity).toBe(emotion.intensity);
    });
  });

  describe('null or undefined input', () => {
    it('should use default emotion when current is undefined', async () => {
      const result = await EmotionService.onUserInteraction('great awesome amazing wonderful');

      expect(result).toBeDefined();
      expect(result.name).toBe('confident');
    });

    it('should return neutral for no-keyword message with default emotion', async () => {
      const result = await EmotionService.onUserInteraction('hello');

      expect(result).toBeDefined();
      expect(result.name).toBe('neutral');
    });
  });
});