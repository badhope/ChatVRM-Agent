import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Mock } from 'vitest';
import { EventEmitter } from 'eventemitter3';
import { PipelineEngine } from '../../../core/pipeline.js';
import type {
  Stage,
  PipelineContext,
  PipelineEvents,
} from '../../../core/types.js';

function createMockContext(input: string): PipelineContext {
  return {
    taskId: '',
    input,
    errors: [],
    metadata: {},
    createdFiles: [],
    modifiedFiles: [],
    phaseHistory: [],
    shouldConfirm: false,
  };
}

function createMockStage(
  name: string,
  required = true,
): Stage & { execute: Mock<(ctx: PipelineContext) => Promise<PipelineContext>> } {
  return {
    name,
    required,
    execute: vi.fn<(ctx: PipelineContext) => Promise<PipelineContext>>().mockImplementation((ctx: PipelineContext) => Promise.resolve(ctx)),
    canRollback: false,
  };
}

describe('PipelineEngine coverage', () => {
  let eventBus: EventEmitter<PipelineEvents>;

  beforeEach(() => {
    eventBus = new EventEmitter<PipelineEvents>();
  });

  describe('on() and off() event methods', () => {
    it('should return this for chaining from on()', () => {
      const engine = new PipelineEngine({ stages: [], eventBus });

      const result = engine.on('pipeline:start', () => {});

      expect(result).toBe(engine);
    });

    it('should return this for chaining from off()', () => {
      const engine = new PipelineEngine({ stages: [], eventBus });

      const result = engine.off('pipeline:start', () => {});

      expect(result).toBe(engine);
    });

    it('should return this when chaining on() then off()', () => {
      const engine = new PipelineEngine({ stages: [], eventBus });

      const result = engine.on('pipeline:start', () => {}).off('pipeline:start', () => {});

      expect(result).toBe(engine);
    });

    it('should actually remove a listener with off()', () => {
      const engine = new PipelineEngine({ stages: [], eventBus });
      let callCount = 0;
      const listener = () => {
        callCount++;
      };

      engine.on('output', listener);
      engine.off('output', listener);

      engine.eventBus.emit('output', { text: 'should not be heard' });

      expect(callCount).toBe(0);
    });

    it('should not remove other listeners when off() is called with a specific listener', () => {
      const engine = new PipelineEngine({ stages: [], eventBus });
      let countA = 0;
      let countB = 0;
      const listenerA = () => {
        countA++;
      };
      const listenerB = () => {
        countB++;
      };

      engine.on('output', listenerA);
      engine.on('output', listenerB);
      engine.off('output', listenerA);

      engine.eventBus.emit('output', { text: 'hello' });

      expect(countA).toBe(0);
      expect(countB).toBe(1);
    });
  });

  describe('rollback failure handling', () => {
    it('should emit output event when rollback throws an Error', async () => {
      const rollbackFn = vi.fn().mockRejectedValue(new Error('rollback exploded'));
      const rollingStage: Stage = {
        name: 'rolling',
        required: true,
        execute: vi.fn()
          .mockRejectedValueOnce(new Error('first fail'))
          .mockResolvedValueOnce(createMockContext('test')),
        canRollback: true,
        rollback: rollbackFn,
      };
      const outputEvents: { text: string }[] = [];

      eventBus.on('output', (data) => outputEvents.push(data));

      const engine = new PipelineEngine({
        stages: [rollingStage],
        eventBus,
        maxRetries: 1,
      });

      await engine.run('test');

      expect(rollbackFn).toHaveBeenCalledTimes(1);
      const rollbackFailMessages = outputEvents.filter((e) => e.text.includes('Rollback failed'));
      expect(rollbackFailMessages.length).toBe(1);
      expect(rollbackFailMessages[0].text).toContain('rollback exploded');
    });

    it('should continue after rollback failure and retry the stage', async () => {
      const rollbackFn = vi.fn().mockRejectedValue(new Error('rollback fail'));
      const rollingStage: Stage = {
        name: 'rolling',
        required: true,
        execute: vi.fn()
          .mockRejectedValueOnce(new Error('first fail'))
          .mockResolvedValueOnce(createMockContext('test')),
        canRollback: true,
        rollback: rollbackFn,
      };

      const engine = new PipelineEngine({
        stages: [rollingStage],
        eventBus,
        maxRetries: 1,
      });

      await engine.run('test');

      expect(rollbackFn).toHaveBeenCalledTimes(1);
      expect(rollingStage.execute).toHaveBeenCalledTimes(2);
    });

    it('should throw original error when stage fails on last attempt and rollback throws', async () => {
      const rollbackFn = vi.fn().mockRejectedValue(new Error('rollback also failed'));
      const rollingStage: Stage = {
        name: 'rolling',
        required: true,
        execute: vi.fn().mockRejectedValue(new Error('original stage error')),
        canRollback: true,
        rollback: rollbackFn,
      };

      const engine = new PipelineEngine({
        stages: [rollingStage],
        eventBus,
        maxRetries: 1,
      });

      await expect(engine.run('test')).rejects.toThrow('original stage error');
    });

    it('should emit output event and convert non-Error rollback throw (string)', async () => {
      const rollbackFn = vi.fn().mockRejectedValue('string rollback error');
      const rollingStage: Stage = {
        name: 'rolling',
        required: true,
        execute: vi.fn()
          .mockRejectedValueOnce(new Error('original error'))
          .mockResolvedValueOnce(createMockContext('test')),
        canRollback: true,
        rollback: rollbackFn,
      };
      const outputEvents: { text: string }[] = [];

      eventBus.on('output', (data) => outputEvents.push(data));

      const engine = new PipelineEngine({
        stages: [rollingStage],
        eventBus,
        maxRetries: 1,
      });

      await engine.run('test');

      const rollbackFailMessages = outputEvents.filter((e) => e.text.includes('Rollback failed'));
      expect(rollbackFailMessages.length).toBe(1);
      expect(rollbackFailMessages[0].text).toContain('string rollback error');
    });

    it('should emit output event and convert non-Error rollback throw (number)', async () => {
      const rollbackFn = vi.fn().mockRejectedValue(404);
      const rollingStage: Stage = {
        name: 'rolling',
        required: true,
        execute: vi.fn()
          .mockRejectedValueOnce(new Error('original error'))
          .mockResolvedValueOnce(createMockContext('test')),
        canRollback: true,
        rollback: rollbackFn,
      };
      const outputEvents: { text: string }[] = [];

      eventBus.on('output', (data) => outputEvents.push(data));

      const engine = new PipelineEngine({
        stages: [rollingStage],
        eventBus,
        maxRetries: 1,
      });

      await engine.run('test');

      const rollbackFailMessages = outputEvents.filter((e) => e.text.includes('Rollback failed'));
      expect(rollbackFailMessages.length).toBe(1);
      expect(rollbackFailMessages[0].text).toContain('404');
    });
  });

  describe('stage returning partial context', () => {
    it('should handle stage that returns context with missing fields', async () => {
      const stage: Stage = {
        name: 'partial',
        required: true,
        execute: vi.fn().mockResolvedValue({
          taskId: 'partial-task',
          input: 'partial input',
        } as PipelineContext),
      };

      const engine = new PipelineEngine({ stages: [stage], eventBus });

      const result = await engine.run('test');

      expect(result.taskId).toBe('partial-task');
      expect(result.input).toBe('partial input');
    });

    it('should handle stage that returns null', async () => {
      const stage: Stage = {
        name: 'nullStage',
        required: true,
        execute: vi.fn().mockResolvedValue(null),
      };

      const engine = new PipelineEngine({ stages: [stage], eventBus });

      const result = await engine.run('test');

      expect(result).toBeNull();
    });

    it('should handle stage that returns undefined', async () => {
      const stage: Stage = {
        name: 'undefStage',
        required: true,
        execute: vi.fn().mockResolvedValue(undefined),
      };

      const engine = new PipelineEngine({ stages: [stage], eventBus });

      const result = await engine.run('test');

      expect(result).toBeUndefined();
    });
  });

  describe('createCheckpoint', () => {
    it('should create checkpoint and emit output event', async () => {
      const stage = createMockStage('test');
      const outputEvents: { text: string }[] = [];

      eventBus.on('output', (data) => outputEvents.push(data));

      const engine = new PipelineEngine({ stages: [stage], eventBus });

      const result = await engine.run('test');
      await engine.createCheckpoint(result);

      expect(result.metadata.lastCheckpoint).toBeDefined();
      const checkpoint = result.metadata.lastCheckpoint as Record<string, unknown>;
      expect(checkpoint.taskId).toBe(result.taskId);
      expect(checkpoint.timestamp).toBeGreaterThan(0);

      const checkpointMessages = outputEvents.filter((e) => e.text.includes('Checkpoint'));
      expect(checkpointMessages.length).toBe(1);
    });

    it('should include phase name in checkpoint output message', async () => {
      const stage = createMockStage('init');
      const outputEvents: { text: string }[] = [];

      eventBus.on('output', (data) => outputEvents.push(data));

      const engine = new PipelineEngine({ stages: [stage], eventBus });

      const result = await engine.run('test');
      await engine.createCheckpoint(result);

      const checkpointMessages = outputEvents.filter((e) => e.text.includes('Checkpoint'));
      expect(checkpointMessages.length).toBe(1);
      expect(checkpointMessages[0].text).toContain('init');
    });

    it('should use unknown as phase when phaseHistory is empty', async () => {
      const engine = new PipelineEngine({ stages: [], eventBus });
      const outputEvents: { text: string }[] = [];

      eventBus.on('output', (data) => outputEvents.push(data));

      const ctx = createMockContext('test');
      await engine.createCheckpoint(ctx);

      const checkpointMessages = outputEvents.filter((e) => e.text.includes('Checkpoint'));
      expect(checkpointMessages.length).toBe(1);
      expect(checkpointMessages[0].text).toContain('unknown');
    });
  });
});