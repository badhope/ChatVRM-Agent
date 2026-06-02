import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
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

describe('PipelineEngine', () => {
  let eventBus: EventEmitter<PipelineEvents>;

  beforeEach(() => {
    eventBus = new EventEmitter<PipelineEvents>();
  });

  describe('should create a pipeline with stages', () => {
    it('should accept stages in config', () => {
      const stages = [
        createMockStage('init'),
        createMockStage('execute'),
      ];
      const engine = new PipelineEngine({ stages });

      expect(engine).toBeDefined();
    });

    it('should return eventBus via getter', () => {
      const engine = new PipelineEngine({ stages: [], eventBus });
      expect(engine.eventBus).toBe(eventBus);
    });

    it('should create its own eventBus when none provided', () => {
      const engine = new PipelineEngine({ stages: [] });
      expect(engine.eventBus).toBeDefined();
    });
  });

  describe('should run pipeline successfully with all stages', () => {
    it('should execute all stages in order', async () => {
      const stage1 = createMockStage('stage1');
      const stage2 = createMockStage('stage2');
      const stage3 = createMockStage('stage3');

      const engine = new PipelineEngine({ stages: [stage1, stage2, stage3], eventBus });

      const context = createMockContext('test input');
      stage1.execute.mockResolvedValue(context);
      stage2.execute.mockResolvedValue(context);
      stage3.execute.mockResolvedValue(context);

      const result = await engine.run('test input');

      expect(stage1.execute).toHaveBeenCalledTimes(1);
      expect(stage2.execute).toHaveBeenCalledTimes(1);
      expect(stage3.execute).toHaveBeenCalledTimes(1);
      expect(result).toBeDefined();
      expect(result.input).toBe('test input');
    });

    it('should pass context between stages', async () => {
      const stage1 = createMockStage('stage1');
      const stage2 = createMockStage('stage2');

      let receivedContext: PipelineContext | null = null;
      stage2.execute.mockImplementation(async (ctx: PipelineContext) => {
        receivedContext = ctx;
        return ctx;
      });

      const engine = new PipelineEngine({ stages: [stage1, stage2], eventBus });

      const ctx = createMockContext('test');
      stage1.execute.mockResolvedValue({ ...ctx, intent: 'code' });

      await engine.run('test');

      expect(receivedContext).not.toBeNull();
      expect(receivedContext!.intent).toBe('code');
    });
  });

  describe('should emit pipeline:start and pipeline:complete events', () => {
    it('should emit pipeline:start', async () => {
      const stage = createMockStage('stage1');
      const startedEvents: unknown[] = [];

      eventBus.on('pipeline:start', (data) => {
        startedEvents.push(data);
      });

      const engine = new PipelineEngine({ stages: [stage], eventBus });

      await engine.run('test');

      expect(startedEvents.length).toBe(1);
      expect(startedEvents[0]).toHaveProperty('context');
    });

    it('should emit pipeline:complete with duration', async () => {
      const stage = createMockStage('stage1');
      const completedEvents: unknown[] = [];

      eventBus.on('pipeline:complete', (data) => {
        completedEvents.push(data);
      });

      const engine = new PipelineEngine({ stages: [stage], eventBus });

      await engine.run('test');

      expect(completedEvents.length).toBe(1);
      expect(completedEvents[0]).toHaveProperty('totalDurationMs');
      expect(typeof (completedEvents[0] as Record<string, unknown>).totalDurationMs).toBe('number');
    });
  });

  describe('should emit stage:start and stage:complete for each stage', () => {
    it('should emit stage:start and stage:complete', async () => {
      const stage = createMockStage('init');
      const events: string[] = [];

      eventBus.on('stage:start', (data) => {
        events.push(`start:${data.stage}`);
      });
      eventBus.on('stage:complete', (data) => {
        events.push(`complete:${data.stage}`);
      });

      const engine = new PipelineEngine({ stages: [stage], eventBus });

      await engine.run('test');

      expect(events).toEqual(['start:init', 'complete:init']);
    });

    it('should emit for multiple stages', async () => {
      const stage1 = createMockStage('s1');
      const stage2 = createMockStage('s2');
      const events: string[] = [];

      eventBus.on('stage:start', (data) => {
        events.push(`start:${data.stage}`);
      });
      eventBus.on('stage:complete', (data) => {
        events.push(`complete:${data.stage}`);
      });

      const engine = new PipelineEngine({ stages: [stage1, stage2], eventBus });

      await engine.run('test');

      expect(events).toEqual(['start:s1', 'complete:s1', 'start:s2', 'complete:s2']);
    });
  });

  describe('should handle stage errors and retry', () => {
    it('should retry failed stages up to maxRetries', async () => {
      const failingStage: Stage = {
        name: 'flaky',
        required: true,
        execute: vi.fn()
          .mockRejectedValueOnce(new Error('fail 1'))
          .mockResolvedValueOnce(createMockContext('test')),
        canRollback: false,
      };

      const engine = new PipelineEngine({
        stages: [failingStage],
        eventBus,
        maxRetries: 1,
      });

      await engine.run('test');

      expect(failingStage.execute).toHaveBeenCalledTimes(2);
    });

    it('should throw when required stage fails after all retries', async () => {
      const failingStage: Stage = {
        name: 'doomed',
        required: true,
        execute: vi.fn().mockRejectedValue(new Error('always fails')),
        canRollback: false,
      };

      const engine = new PipelineEngine({
        stages: [failingStage],
        eventBus,
        maxRetries: 0,
      });

      await expect(engine.run('test')).rejects.toThrow('always fails');
    });

    it('should emit stage:error on stage failure', async () => {
      const stage: Stage = {
        name: 'broken',
        required: true,
        execute: vi.fn()
          .mockRejectedValueOnce(new Error('fail'))
          .mockResolvedValueOnce(createMockContext('test')),
        canRollback: false,
      };
      const errorEvents: unknown[] = [];

      eventBus.on('stage:error', (data) => {
        errorEvents.push(data);
      });

      const engine = new PipelineEngine({
        stages: [stage],
        eventBus,
        maxRetries: 1,
      });

      await engine.run('test');

      expect(errorEvents.length).toBe(1);
      expect((errorEvents[0] as Record<string, unknown>).stage).toBe('broken');
    });
  });

  describe('should skip non-required stages that fail', () => {
    it('should skip non-required stage that fails', async () => {
      const requiredStage = createMockStage('required', true);
      const optionalStage: Stage = {
        name: 'optional',
        required: false,
        execute: vi.fn().mockRejectedValue(new Error('optional fail')),
        canRollback: false,
      };

      const engine = new PipelineEngine({
        stages: [requiredStage, optionalStage],
        eventBus,
        maxRetries: 0,
      });

      const result = await engine.run('test');

      expect(requiredStage.execute).toHaveBeenCalledTimes(1);
      expect(optionalStage.execute).toHaveBeenCalledTimes(1);
      expect(result).toBeDefined();
    });

    it('should emit stage:skip for non-required stage failures', async () => {
      const requiredStage = createMockStage('required', true);
      const optionalStage: Stage = {
        name: 'optional',
        required: false,
        execute: vi.fn().mockRejectedValue(new Error('skipped')),
        canRollback: false,
      };
      const skipEvents: unknown[] = [];

      eventBus.on('stage:skip', (data) => {
        skipEvents.push(data);
      });

      const engine = new PipelineEngine({
        stages: [requiredStage, optionalStage],
        eventBus,
        maxRetries: 0,
      });

      await engine.run('test');

      expect(skipEvents.length).toBe(1);
      expect((skipEvents[0] as Record<string, unknown>).stage).toBe('optional');
    });
  });

  describe('should collect errors in context', () => {
    it('should push recoverable error for skipped stage', async () => {
      const requiredStage = createMockStage('required', true);
      const optionalStage: Stage = {
        name: 'optional',
        required: false,
        execute: vi.fn().mockRejectedValue(new Error('skipped error')),
        canRollback: false,
      };

      const engine = new PipelineEngine({
        stages: [requiredStage, optionalStage],
        eventBus,
        maxRetries: 0,
      });

      const result = await engine.run('test');

      expect(result.errors.length).toBe(1);
      expect(result.errors[0].phase).toBe('optional');
      expect(result.errors[0].recoverable).toBe(true);
      expect(result.errors[0].message).toBe('skipped error');
    });
  });

  describe('should track phase history', () => {
    it('should record phase history for each stage', async () => {
      const stage1 = createMockStage('init');
      const stage2 = createMockStage('execute');

      const engine = new PipelineEngine({ stages: [stage1, stage2], eventBus });

      const result = await engine.run('test');

      expect(result.phaseHistory.length).toBe(2);
      expect(result.phaseHistory[0].phase).toBe('init');
      expect(result.phaseHistory[1].phase).toBe('execute');
      expect(result.phaseHistory[0].startTime).toBeGreaterThan(0);
      expect(result.phaseHistory[0].status).toBe('completed');
    });

    it('should mark failed phases', async () => {
      const stage: Stage = {
        name: 'doomed',
        required: true,
        execute: vi.fn().mockRejectedValue(new Error('dead')),
        canRollback: false,
      };

      const engine = new PipelineEngine({
        stages: [stage],
        eventBus,
        maxRetries: 0,
      });

      await expect(engine.run('test')).rejects.toThrow('dead');
    });
  });

  describe('should handle pipeline timeout', () => {
    it('should reject when pipeline exceeds timeout', async () => {
      const hangingStage: Stage = {
        name: 'hanging',
        required: true,
        execute: vi.fn().mockImplementation(
          () => new Promise<never>(() => {}),
        ),
        canRollback: false,
      };

      const engine = new PipelineEngine({
        stages: [hangingStage],
        eventBus,
        timeoutMs: 50,
      });

      await expect(engine.run('test')).rejects.toThrow('timed out');
    });
  });

  describe('should rollback on retry', () => {
    it('should call rollback before retry when stage supports it', async () => {
      const rollbackFn = vi.fn().mockResolvedValue(undefined);
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

    it('should continue even if rollback fails', async () => {
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
  });
});