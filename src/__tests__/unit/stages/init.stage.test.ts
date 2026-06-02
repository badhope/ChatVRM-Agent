import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { InitStage } from '../../../stages/init.stage.js';
import { resetEventBus } from '../../../core/event-bus.js';
import type { PipelineContext } from '../../../core/types.js';

function createContext(input: string): PipelineContext {
  return {
    taskId: 'task-001',
    input,
    errors: [],
    metadata: {},
    createdFiles: [],
    modifiedFiles: [],
    phaseHistory: [],
    shouldConfirm: false,
  };
}

describe('InitStage', () => {
  let stage: InitStage;

  beforeEach(() => {
    resetEventBus();
    stage = new InitStage();
  });

  afterEach(() => {
    resetEventBus();
  });

  describe('should initialize and set metadata', () => {
    it('should set startTime in metadata', async () => {
      const ctx = createContext('build a web app');

      const result = await stage.execute(ctx);

      expect(result.metadata).toHaveProperty('startTime');
      expect(typeof result.metadata.startTime).toBe('number');
      expect(result.metadata.startTime).toBeGreaterThan(0);
    });

    it('should preserve existing metadata', async () => {
      const ctx = createContext('test');
      ctx.metadata = { existingKey: 'value' };

      const result = await stage.execute(ctx);

      expect(result.metadata.existingKey).toBe('value');
      expect(result.metadata).toHaveProperty('startTime');
    });

    it('should return a new context object', async () => {
      const ctx = createContext('test');

      const result = await stage.execute(ctx);

      expect(result).not.toBe(ctx);
    });

    it('should keep input unchanged', async () => {
      const ctx = createContext('refactor the codebase');

      const result = await stage.execute(ctx);

      expect(result.input).toBe('refactor the codebase');
    });
  });

  describe('should reject empty input', () => {
    it('should throw on empty string', async () => {
      const ctx = createContext('');

      await expect(stage.execute(ctx)).rejects.toThrow('Input must be non-empty');
    });

    it('should throw on whitespace-only input', async () => {
      const ctx = createContext('   ');

      await expect(stage.execute(ctx)).rejects.toThrow('Input must be non-empty');
    });
  });

  describe("name should be 'initialize'", () => {
    it('should have the correct name', () => {
      expect(stage.name).toBe('initialize');
    });
  });

  describe('should be required', () => {
    it('should have required set to true', () => {
      expect(stage.required).toBe(true);
    });
  });
});