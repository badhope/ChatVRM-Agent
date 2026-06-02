import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Mock } from 'vitest';
import { EventEmitter } from 'eventemitter3';
import { PipelineEngine } from '../../../core/pipeline.js';
import type {
  Stage,
  PipelineContext,
  PipelineEvents,
  TaskStep,
  StepResult,
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

describe('PipelineEngine edge cases', () => {
  let eventBus: EventEmitter<PipelineEvents>;

  beforeEach(() => {
    eventBus = new EventEmitter<PipelineEvents>();
  });

  describe('zero stages (empty pipeline)', () => {
    it('should handle empty pipeline successfully', async () => {
      const engine = new PipelineEngine({ stages: [], eventBus });

      const result = await engine.run('hello');

      expect(result).toBeDefined();
      expect(result.input).toBe('hello');
      expect(result.taskId).toBeDefined();
    });

    it('should emit pipeline:start and pipeline:complete for empty pipeline', async () => {
      const engine = new PipelineEngine({ stages: [], eventBus });
      const events: string[] = [];

      eventBus.on('pipeline:start', () => events.push('start'));
      eventBus.on('pipeline:complete', () => events.push('complete'));

      await engine.run('hello');

      expect(events).toEqual(['start', 'complete']);
    });

    it('should return context with empty errors and phaseHistory for empty pipeline', async () => {
      const engine = new PipelineEngine({ stages: [], eventBus });

      const result = await engine.run('hello');

      expect(result.errors).toEqual([]);
      expect(result.phaseHistory).toEqual([]);
    });
  });

  describe('very long input (10KB+ string)', () => {
    it('should handle 10KB input string', async () => {
      const stage = createMockStage('test');
      const longInput = 'x'.repeat(10240);

      const engine = new PipelineEngine({ stages: [stage], eventBus });

      const result = await engine.run(longInput);

      expect(result.input).toBe(longInput);
      expect(result.input.length).toBe(10240);
      expect(stage.execute).toHaveBeenCalledTimes(1);
    });

    it('should pass long input through context correctly', async () => {
      const stage = createMockStage('test');
      const longInput = 'a'.repeat(50000);
      let receivedInput = '';

      stage.execute.mockImplementation(async (ctx: PipelineContext) => {
        receivedInput = ctx.input;
        return ctx;
      });

      const engine = new PipelineEngine({ stages: [stage], eventBus });

      await engine.run(longInput);

      expect(receivedInput.length).toBe(50000);
      expect(receivedInput).toBe(longInput);
    });
  });

  describe('input with special Unicode characters', () => {
    it('should handle emoji input', async () => {
      const stage = createMockStage('test');
      const emojiInput = '🚀 Build the app ✨ with 🎉 emojis 😀💻';

      const engine = new PipelineEngine({ stages: [stage], eventBus });

      const result = await engine.run(emojiInput);

      expect(result.input).toBe(emojiInput);
    });

    it('should handle CJK characters', async () => {
      const stage = createMockStage('test');
      const cjkInput = '日本語でリファクタリングを行ってください。这是一条中文消息。한국어로 리팩토링 해주세요.';

      const engine = new PipelineEngine({ stages: [stage], eventBus });

      const result = await engine.run(cjkInput);

      expect(result.input).toBe(cjkInput);
    });

    it('should handle RTL text', async () => {
      const stage = createMockStage('test');
      const rtlInput = 'مرحباً بالعالم. هذا نص عربي. שלום עולם.';

      const engine = new PipelineEngine({ stages: [stage], eventBus });

      const result = await engine.run(rtlInput);

      expect(result.input).toBe(rtlInput);
    });
  });

  describe('input with control characters', () => {
    it('should handle input containing newlines and tabs', async () => {
      const stage = createMockStage('test');
      const controlInput = 'line1\nline2\n\tindented\n\r\nline5';

      const engine = new PipelineEngine({ stages: [stage], eventBus });

      const result = await engine.run(controlInput);

      expect(result.input).toBe(controlInput);
    });

    it('should handle input with null bytes', async () => {
      const stage = createMockStage('test');
      const nullInput = 'before\u0000after';

      const engine = new PipelineEngine({ stages: [stage], eventBus });

      const result = await engine.run(nullInput);

      expect(result.input).toBe(nullInput);
    });
  });

  describe('many rapid stage executions', () => {
    it('should execute 10 stages sequentially and correctly', async () => {
      const stages = Array.from({ length: 10 }, (_, i) => createMockStage(`stage-${i}`));
      const engine = new PipelineEngine({ stages, eventBus });

      const result = await engine.run('test');

      expect(result.phaseHistory.length).toBe(10);
      for (const stage of stages) {
        expect(stage.execute).toHaveBeenCalledTimes(1);
      }
    });

    it('should maintain order across many stages', async () => {
      const order: string[] = [];
      const stages = Array.from({ length: 10 }, (_, i) => {
        const stage = createMockStage(`stage-${i}`);
        stage.execute.mockImplementation(async (ctx: PipelineContext) => {
          order.push(`stage-${i}`);
          return ctx;
        });
        return stage;
      });

      const engine = new PipelineEngine({ stages, eventBus });

      await engine.run('test');

      expect(order).toEqual([
        'stage-0', 'stage-1', 'stage-2', 'stage-3', 'stage-4',
        'stage-5', 'stage-6', 'stage-7', 'stage-8', 'stage-9',
      ]);
    });
  });

  describe('event order correctness', () => {
    it('should emit events in correct order: start → stage:start → stage:complete → complete', async () => {
      const stage = createMockStage('single');
      const eventOrder: string[] = [];

      eventBus.on('pipeline:start', () => eventOrder.push('pipeline:start'));
      eventBus.on('stage:start', () => eventOrder.push('stage:start'));
      eventBus.on('stage:complete', () => eventOrder.push('stage:complete'));
      eventBus.on('pipeline:complete', () => eventOrder.push('pipeline:complete'));

      const engine = new PipelineEngine({ stages: [stage], eventBus });

      await engine.run('test');

      expect(eventOrder).toEqual([
        'pipeline:start',
        'stage:start',
        'stage:complete',
        'pipeline:complete',
      ]);
    });

    it('should emit correct order for two stages', async () => {
      const stage1 = createMockStage('s1');
      const stage2 = createMockStage('s2');
      const eventOrder: string[] = [];

      eventBus.on('pipeline:start', () => eventOrder.push('pipeline:start'));
      eventBus.on('stage:start', (data) => eventOrder.push(`stage:start:${data.stage}`));
      eventBus.on('stage:complete', (data) => eventOrder.push(`stage:complete:${data.stage}`));
      eventBus.on('pipeline:complete', () => eventOrder.push('pipeline:complete'));

      const engine = new PipelineEngine({ stages: [stage1, stage2], eventBus });

      await engine.run('test');

      expect(eventOrder).toEqual([
        'pipeline:start',
        'stage:start:s1',
        'stage:complete:s1',
        'stage:start:s2',
        'stage:complete:s2',
        'pipeline:complete',
      ]);
    });
  });

  describe('phase history timestamps', () => {
    it('should correctly track phase history timestamps', async () => {
      const stage1 = createMockStage('init');
      const stage2 = createMockStage('execute');

      stage1.execute.mockImplementation(async (ctx: PipelineContext) => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        return ctx;
      });
      stage2.execute.mockImplementation(async (ctx: PipelineContext) => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        return ctx;
      });

      const engine = new PipelineEngine({ stages: [stage1, stage2], eventBus });

      const result = await engine.run('test');

      expect(result.phaseHistory.length).toBe(2);
      expect(result.phaseHistory[0].phase).toBe('init');
      expect(result.phaseHistory[1].phase).toBe('execute');
      expect(result.phaseHistory[0].startTime).toBeGreaterThan(0);
      expect(result.phaseHistory[0].endTime).toBeGreaterThan(0);
      expect(result.phaseHistory[0].status).toBe('completed');
      expect(result.phaseHistory[1].status).toBe('completed');
      expect(result.phaseHistory[0].endTime).toBeGreaterThanOrEqual(result.phaseHistory[0].startTime);
      expect(result.phaseHistory[1].startTime).toBeGreaterThanOrEqual(result.phaseHistory[0].endTime!);
    });

    it('should track failed phase timestamps', async () => {
      const stage: Stage = {
        name: 'failing',
        required: false,
        execute: vi.fn().mockRejectedValue(new Error('failed')),
        canRollback: false,
      };

      const engine = new PipelineEngine({ stages: [stage], eventBus, maxRetries: 0 });

      const result = await engine.run('test');

      expect(result.phaseHistory.length).toBe(1);
      expect(result.phaseHistory[0].status).toBe('failed');
      expect(result.phaseHistory[0].endTime).toBeGreaterThan(0);
    });
  });

  describe('stage that returns modified context', () => {
    it('should propagate modified context between stages', async () => {
      const stage1 = createMockStage('s1');
      const stage2 = createMockStage('s2');

      stage1.execute.mockImplementation(async (ctx: PipelineContext) => ({
        ...ctx,
        intent: 'code',
        metadata: { ...ctx.metadata, customKey: 'value' },
      }));

      const engine = new PipelineEngine({ stages: [stage1, stage2], eventBus });

      const result = await engine.run('test');

      expect(result.intent).toBe('code');
      expect(result.metadata.customKey).toBe('value');
    });

    it('should allow stages to add files to modifiedFiles', async () => {
      const stage1 = createMockStage('s1');

      stage1.execute.mockImplementation(async (ctx: PipelineContext) => ({
        ...ctx,
        modifiedFiles: ['src/a.ts', 'src/b.ts'],
        createdFiles: ['src/c.ts'],
      }));

      const engine = new PipelineEngine({ stages: [stage1], eventBus });

      const result = await engine.run('test');

      expect(result.modifiedFiles).toContain('src/a.ts');
      expect(result.modifiedFiles).toContain('src/b.ts');
      expect(result.createdFiles).toContain('src/c.ts');
    });
  });

  describe('stage that throws non-Error objects', () => {
    it('should handle stage throwing a string', async () => {
      const stage: Stage = {
        name: 'stringThrower',
        required: true,
        execute: vi.fn().mockRejectedValue('not an error'),
        canRollback: false,
      };

      const engine = new PipelineEngine({ stages: [stage], eventBus, maxRetries: 0 });

      await expect(engine.run('test')).rejects.toThrow('not an error');
    });

    it('should handle stage throwing a number', async () => {
      const stage: Stage = {
        name: 'numThrower',
        required: true,
        execute: vi.fn().mockRejectedValue(42),
        canRollback: false,
      };

      const engine = new PipelineEngine({ stages: [stage], eventBus, maxRetries: 0 });

      await expect(engine.run('test')).rejects.toThrow('42');
    });

    it('should handle stage throwing undefined', async () => {
      const stage: Stage = {
        name: 'undefThrower',
        required: true,
        execute: vi.fn().mockRejectedValue(undefined),
        canRollback: false,
      };

      const engine = new PipelineEngine({ stages: [stage], eventBus, maxRetries: 0 });

      await expect(engine.run('test')).rejects.toThrow('undefined');
    });

    it('should handle stage throwing null', async () => {
      const stage: Stage = {
        name: 'nullThrower',
        required: true,
        execute: vi.fn().mockRejectedValue(null),
        canRollback: false,
      };

      const engine = new PipelineEngine({ stages: [stage], eventBus, maxRetries: 0 });

      await expect(engine.run('test')).rejects.toThrow('null');
    });

    it('should handle stage throwing a plain object', async () => {
      const stage: Stage = {
        name: 'objThrower',
        required: true,
        execute: vi.fn().mockRejectedValue({ code: 500, message: 'nope' }),
        canRollback: false,
      };

      const engine = new PipelineEngine({ stages: [stage], eventBus, maxRetries: 0 });

      await expect(engine.run('test')).rejects.toThrow('[object Object]');
    });
  });

  describe('pipeline abort via error in required stage', () => {
    it('should abort pipeline on first required stage failure', async () => {
      const stage1 = createMockStage('s1', true);
      const stage2: Stage = {
        name: 's2',
        required: true,
        execute: vi.fn().mockRejectedValue(new Error('abort')),
        canRollback: false,
      };
      const stage3 = createMockStage('s3', true);

      const engine = new PipelineEngine({
        stages: [stage1, stage2, stage3],
        eventBus,
        maxRetries: 0,
      });

      await expect(engine.run('test')).rejects.toThrow('abort');

      expect(stage1.execute).toHaveBeenCalledTimes(1);
      expect(stage3.execute).not.toHaveBeenCalled();
    });

    it('should emit pipeline:error on abort', async () => {
      const stage: Stage = {
        name: 'fatal',
        required: true,
        execute: vi.fn().mockRejectedValue(new Error('abort')),
        canRollback: false,
      };
      const errorEvents: unknown[] = [];

      eventBus.on('pipeline:error', (data) => errorEvents.push(data));

      const engine = new PipelineEngine({ stages: [stage], eventBus, maxRetries: 0 });

      await expect(engine.run('test')).rejects.toThrow('abort');

      expect(errorEvents.length).toBe(1);
      expect((errorEvents[0] as Record<string, unknown>).error).toBeInstanceOf(Error);
    });
  });

  describe('collect errors in context for non-required stage failures', () => {
    it('should collect multiple errors from multiple non-required stages', async () => {
      const stage1 = createMockStage('s1', true);
      const opt1: Stage = {
        name: 'opt1',
        required: false,
        execute: vi.fn().mockRejectedValue(new Error('opt1 failed')),
        canRollback: false,
      };
      const opt2: Stage = {
        name: 'opt2',
        required: false,
        execute: vi.fn().mockRejectedValue(new Error('opt2 failed')),
        canRollback: false,
      };

      const engine = new PipelineEngine({
        stages: [stage1, opt1, opt2],
        eventBus,
        maxRetries: 0,
      });

      const result = await engine.run('test');

      expect(result.errors.length).toBe(2);
      expect(result.errors[0].phase).toBe('opt1');
      expect(result.errors[0].recoverable).toBe(true);
      expect(result.errors[1].phase).toBe('opt2');
      expect(result.errors[1].recoverable).toBe(true);
    });

    it('should include timestamp in error records', async () => {
      const stage1 = createMockStage('s1', true);
      const opt1: Stage = {
        name: 'opt1',
        required: false,
        execute: vi.fn().mockRejectedValue(new Error('opt1 failed')),
        canRollback: false,
      };

      const engine = new PipelineEngine({
        stages: [stage1, opt1],
        eventBus,
        maxRetries: 0,
      });

      const result = await engine.run('test');

      expect(result.errors[0].timestamp).toBeGreaterThan(0);
      expect(typeof result.errors[0].timestamp).toBe('number');
    });
  });

  describe('custom timeout should override default', () => {
    it('should use custom pipeline timeout', async () => {
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
        timeoutMs: 30,
      });

      await expect(engine.run('test')).rejects.toThrow('timed out after 30ms');
    });

    it('should use custom stage timeout', async () => {
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
        stageTimeoutMs: 10,
        timeoutMs: 5000,
      });

      await expect(engine.run('test')).rejects.toThrow('timed out after 10ms');
    });
  });

  describe('checkpoint creation', () => {
    it('should create checkpoint in metadata', async () => {
      const stage = createMockStage('test');

      const engine = new PipelineEngine({ stages: [stage], eventBus });
      const ctx = createMockContext('test');

      await engine.run('test');

      const runResult = await engine.run('test');
      await engine.createCheckpoint(runResult);

      expect(runResult.metadata.lastCheckpoint).toBeDefined();
      const checkpoint = runResult.metadata.lastCheckpoint as Record<string, unknown>;
      expect(checkpoint.taskId).toBe(runResult.taskId);
      expect(checkpoint.timestamp).toBeGreaterThan(0);
    });

    it('should emit output on checkpoint creation', async () => {
      const stage = createMockStage('test');
      const outputEvents: { text: string }[] = [];

      eventBus.on('output', (data) => outputEvents.push(data));

      const engine = new PipelineEngine({ stages: [stage], eventBus });

      const result = await engine.run('test');
      await engine.createCheckpoint(result);

      const checkpointMessages = outputEvents.filter((e) => e.text.includes('Checkpoint'));
      expect(checkpointMessages.length).toBe(1);
    });
  });

  describe('track modified files across results', () => {
    it('should track modified files across addResult calls', () => {
      const engine = new PipelineEngine({ stages: [], eventBus });
      const ctx = createMockContext('test');

      const result1: StepResult = {
        stepId: 's1',
        success: true,
        output: 'ok',
        durationMs: 10,
        changedFiles: ['src/a.ts', 'src/b.ts'],
      };

      const result2: StepResult = {
        stepId: 's2',
        success: true,
        output: 'ok',
        durationMs: 10,
        changedFiles: ['src/c.ts'],
      };

      const ctx1 = engine.addResult(ctx, result1);
      const ctx2 = engine.addResult(ctx1, result2);

      expect(ctx2.modifiedFiles).toContain('src/a.ts');
      expect(ctx2.modifiedFiles).toContain('src/b.ts');
      expect(ctx2.modifiedFiles).toContain('src/c.ts');
    });

    it('should deduplicate modified files', () => {
      const engine = new PipelineEngine({ stages: [], eventBus });
      const ctx = createMockContext('test');

      const result1: StepResult = {
        stepId: 's1',
        success: true,
        output: 'ok',
        durationMs: 10,
        changedFiles: ['src/a.ts', 'src/common.ts'],
      };

      const result2: StepResult = {
        stepId: 's2',
        success: true,
        output: 'ok',
        durationMs: 10,
        changedFiles: ['src/b.ts', 'src/common.ts'],
      };

      const ctx1 = engine.addResult(ctx, result1);
      const ctx2 = engine.addResult(ctx1, result2);

      const uniqueFiles = [...new Set(ctx2.modifiedFiles)];
      expect(ctx2.modifiedFiles).toEqual(uniqueFiles);
      expect(uniqueFiles.length).toBe(3);
    });

    it('should not modify files when changedFiles is empty', () => {
      const engine = new PipelineEngine({ stages: [], eventBus });
      const ctx = createMockContext('test');

      const result: StepResult = {
        stepId: 's1',
        success: true,
        output: 'ok',
        durationMs: 10,
        changedFiles: [],
      };

      const ctx1 = engine.addResult(ctx, result);

      expect(ctx1.modifiedFiles).toEqual([]);
    });
  });

  describe('addStep immutability', () => {
    it('should return new context object from addStep', () => {
      const engine = new PipelineEngine({ stages: [], eventBus });
      const ctx = createMockContext('test');

      const step: TaskStep = {
        id: 'step-1',
        description: 'Test step',
        dependencies: [],
        status: 'pending',
      };

      const newCtx = engine.addStep(ctx, step);

      expect(newCtx).not.toBe(ctx);
      expect(newCtx.plan).toBeDefined();
      expect(newCtx.plan!.length).toBe(1);
      expect(ctx.plan).toBeUndefined();
    });

    it('should append multiple steps via addStep', () => {
      const engine = new PipelineEngine({ stages: [], eventBus });
      const ctx = createMockContext('test');

      const step1: TaskStep = {
        id: 'step-1',
        description: 'Step 1',
        dependencies: [],
        status: 'pending',
      };
      const step2: TaskStep = {
        id: 'step-2',
        description: 'Step 2',
        dependencies: [],
        status: 'pending',
      };

      const ctx1 = engine.addStep(ctx, step1);
      const ctx2 = engine.addStep(ctx1, step2);

      expect(ctx2.plan!.length).toBe(2);
      expect(ctx2.plan![0].id).toBe('step-1');
      expect(ctx2.plan![1].id).toBe('step-2');
    });
  });

  describe('addResult immutability', () => {
    it('should return new context object from addResult', () => {
      const engine = new PipelineEngine({ stages: [], eventBus });
      const ctx = createMockContext('test');

      const result: StepResult = {
        stepId: 'step-1',
        success: true,
        output: 'ok',
        durationMs: 10,
        changedFiles: ['src/a.ts'],
      };

      const newCtx = engine.addResult(ctx, result);

      expect(newCtx).not.toBe(ctx);
      expect(newCtx.results).toBeDefined();
      expect(newCtx.results!.length).toBe(1);
      expect(ctx.results).toBeUndefined();
    });

    it('should append multiple results via addResult', () => {
      const engine = new PipelineEngine({ stages: [], eventBus });
      const ctx = createMockContext('test');

      const result1: StepResult = {
        stepId: 'step-1',
        success: true,
        output: 'ok',
        durationMs: 10,
        changedFiles: [],
      };
      const result2: StepResult = {
        stepId: 'step-2',
        success: true,
        output: 'ok',
        durationMs: 10,
        changedFiles: [],
      };

      const ctx1 = engine.addResult(ctx, result1);
      const ctx2 = engine.addResult(ctx1, result2);

      expect(ctx2.results!.length).toBe(2);
    });
  });
});