import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ReflectStage } from '../../../stages/reflect.stage.js';
import { getEventBus, resetEventBus } from '../../../core/event-bus.js';
import type { PipelineContext } from '../../../core/types.js';

function createContext(
  metadata?: Record<string, unknown>,
): PipelineContext {
  return {
    taskId: 'task-001',
    input: 'test',
    errors: [],
    metadata: metadata ?? { startTime: Date.now() - 1000 },
    createdFiles: [],
    modifiedFiles: [],
    phaseHistory: [],
    shouldConfirm: false,
  };
}

describe('ReflectStage coverage', () => {
  let stage: ReflectStage;

  beforeEach(() => {
    resetEventBus();
    stage = new ReflectStage();
  });

  afterEach(() => {
    resetEventBus();
  });

  describe('error handling', () => {
    it('should handle error in reflection gracefully and not throw', async () => {
      const ctx = createContext();
      Object.defineProperty(ctx, 'plan', {
        get() {
          throw new Error('unexpected plan access error');
        },
        configurable: true,
      });

      const result = await stage.execute(ctx);

      expect(result).toBeDefined();
      expect(result.metadata.reflection).toBeDefined();
    });

    it('should include error message in reflection metadata on failure', async () => {
      const ctx = createContext();
      Object.defineProperty(ctx, 'plan', {
        get() {
          throw new Error('reflection computation failure');
        },
        configurable: true,
      });

      const result = await stage.execute(ctx);

      const reflection = result.metadata.reflection as Record<string, unknown>;
      expect(reflection.error).toBe('reflection computation failure');
    });

    it('should include timestamp in error reflection metadata', async () => {
      const ctx = createContext();
      Object.defineProperty(ctx, 'plan', {
        get() {
          throw new Error('test error');
        },
        configurable: true,
      });

      const result = await stage.execute(ctx);

      const reflection = result.metadata.reflection as Record<string, unknown>;
      expect(reflection.timestamp).toBeDefined();
      expect(typeof reflection.timestamp).toBe('number');
      expect(reflection.timestamp).toBeGreaterThan(0);
    });

    it('should emit output event with warning on reflection failure', async () => {
      const eventBus = getEventBus();
      const outputEvents: { text: string }[] = [];

      eventBus.on('output', (data) => outputEvents.push(data));

      const ctx = createContext();
      Object.defineProperty(ctx, 'plan', {
        get() {
          throw new Error('compute error');
        },
        configurable: true,
      });

      await stage.execute(ctx);

      const warningMessages = outputEvents.filter((e) => e.text.includes('Reflection warning'));
      expect(warningMessages.length).toBe(1);
      expect(warningMessages[0].text).toContain('compute error');
    });

    it('should convert non-Error throws to Error for reflection failure message', async () => {
      const eventBus = getEventBus();
      const outputEvents: { text: string }[] = [];

      eventBus.on('output', (data) => outputEvents.push(data));

      const ctx = createContext();
      Object.defineProperty(ctx, 'plan', {
        get() {
          throw 'string error';
        },
        configurable: true,
      });

      const result = await stage.execute(ctx);

      const reflection = result.metadata.reflection as Record<string, unknown>;
      expect(reflection.error).toBe('string error');
    });
  });

  describe('stage metadata', () => {
    it('should not be a required stage', () => {
      expect(stage.required).toBe(false);
    });

    it('should have name set to reflect', () => {
      expect(stage.name).toBe('reflect');
    });
  });
});