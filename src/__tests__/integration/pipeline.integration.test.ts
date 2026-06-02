import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EventEmitter } from 'eventemitter3';
import { PipelineEngine } from '../../core/pipeline.js';
import {
  InitStage,
  UnderstandStage,
  PlanStage,
  ExecuteStage,
  ValidateStage,
  ReflectStage,
  createDefaultStages,
} from '../../stages/index.js';
import { resetEventBus } from '../../core/event-bus.js';
import type {
  Stage,
  PipelineContext,
  PipelineEvents,
  TaskStep,
  StepResult,
} from '../../core/types.js';
import type { LLMAdapter } from '../../adapters/llm.adapter.js';
import type { ConfigAdapter } from '../../adapters/config.adapter.js';

const mockLLM = {
  chat: vi.fn().mockResolvedValue({
    content: 'Here is the result of the task.',
    model: 'gpt-4',
    usage: { promptTokens: 50, completionTokens: 100, totalTokens: 150 },
  }),
  stream: vi.fn(),
  listModels: vi.fn(),
  isAvailable: vi.fn().mockResolvedValue(true),
} as unknown as LLMAdapter;

const mockLLMReject = {
  chat: vi.fn().mockRejectedValue(new Error('LLM fallback')),
  stream: vi.fn(),
  listModels: vi.fn(),
  isAvailable: vi.fn().mockResolvedValue(true),
} as unknown as LLMAdapter;

const mockConfig = {
  getDefaultProvider: vi.fn().mockReturnValue('openai'),
  getApiKey: vi.fn().mockResolvedValue('sk-mock'),
  setDefaultProvider: vi.fn(),
  getAllConfig: vi.fn().mockReturnValue({ defaultProvider: 'openai' }),
  getChatConfig: vi.fn().mockReturnValue({}),
  getSandboxConfig: vi.fn().mockReturnValue({}),
  getCircuitBreakerConfig: vi.fn().mockReturnValue({}),
  exists: vi.fn().mockResolvedValue(true),
  init: vi.fn().mockResolvedValue(undefined),
  setApiKey: vi.fn().mockResolvedValue(undefined),
  removeApiKey: vi.fn().mockResolvedValue(undefined),
} as unknown as ConfigAdapter;

function createSkipValidationStage(): Stage {
  return {
    name: 'skip-validator',
    required: true,
    async execute(ctx: PipelineContext): Promise<PipelineContext> {
      return {
        ...ctx,
        createdFiles: ['output.ts'],
        metadata: {
          ...ctx.metadata,
          _skipValidate: true,
        },
      };
    },
  };
}

function createErrorRecoveryStage(): Stage {
  let callCount = 0;
  return {
    name: 'recovery',
    required: true,
    canRollback: true,
    async execute(ctx: PipelineContext): Promise<PipelineContext> {
      callCount++;
      if (callCount === 1) {
        throw new Error('transient failure');
      }
      return {
        ...ctx,
        metadata: {
          ...ctx.metadata,
          recovered: true,
          attempts: callCount,
        },
      };
    },
    async rollback(ctx: PipelineContext): Promise<PipelineContext> {
      return ctx;
    },
  };
}

describe('Pipeline Integration', () => {
  let eventBus: EventEmitter<PipelineEvents>;

  beforeEach(() => {
    resetEventBus();
    eventBus = new EventEmitter<PipelineEvents>();
  });

  afterEach(() => {
    resetEventBus();
  });

  describe('should run complete pipeline from init to reflect', () => {
    it('should complete all default stages', async () => {
      const stages = createDefaultStages({ llm: mockLLM, config: mockConfig });
      const engine = new PipelineEngine({ stages, eventBus });

      const result = await engine.run('write a hello world function');

      expect(result).toBeDefined();
      expect(result.taskId).toBeDefined();
      expect(result.input).toBe('write a hello world function');
      expect(result.intent).toBe('code');
      expect(result.plan).toBeDefined();
      expect(result.plan!.length).toBeGreaterThan(0);
      expect(result.results).toBeDefined();
      expect(result.phaseHistory.length).toBe(6);
    });

    it('should have phase history covering all stages', async () => {
      const stages = createDefaultStages({ llm: mockLLM, config: mockConfig });
      const engine = new PipelineEngine({ stages, eventBus });

      const result = await engine.run('search for the main entry point');

      const phaseNames = result.phaseHistory.map((p: { phase: string }) => p.phase);
      expect(phaseNames).toContain('initialize');
      expect(phaseNames).toContain('understand');
      expect(phaseNames).toContain('plan');
      expect(phaseNames).toContain('execute');
      expect(phaseNames).toContain('validate');
      expect(phaseNames).toContain('reflect');
    });

    it('should have reflection in metadata', async () => {
      const stages = createDefaultStages({ llm: mockLLM, config: mockConfig });
      const engine = new PipelineEngine({ stages, eventBus });

      const result = await engine.run('tell me about TypeScript');

      expect(result.metadata.reflection).toBeDefined();
      const reflection = result.metadata.reflection as Record<string, unknown>;
      expect(reflection.completedCount).toBeDefined();
      expect(reflection.totalSteps).toBeDefined();
    });
  });

  describe('should handle code task end-to-end', () => {
    it('should recognize code intent and execute plan', async () => {
      const stages = createDefaultStages({ llm: mockLLM, config: mockConfig });
      const engine = new PipelineEngine({ stages, eventBus });

      const result = await engine.run('implement a binary search algorithm');

      expect(result.intent).toBe('code');
      expect(result.plan!.length).toBe(4);
      expect(result.results!.every((r: { success: boolean }) => r.success)).toBe(true);
      expect(result.phaseHistory.every((p: { status: string }) => p.status === 'completed')).toBe(true);
    });

    it('should set validation metadata for code task', async () => {
      const stages = createDefaultStages({ llm: mockLLM, config: mockConfig });
      const engine = new PipelineEngine({ stages, eventBus });

      const result = await engine.run('write a class for user authentication');

      expect(result.metadata.validated).toBeDefined();
      expect(result.metadata.validationIssues).toBeDefined();
    });
  });

  describe('should handle chat task end-to-end', () => {
    it('should recognize chat intent and handle single step', async () => {
      const stages = createDefaultStages({ llm: mockLLM, config: mockConfig });
      const engine = new PipelineEngine({ stages, eventBus });

      const result = await engine.run('hello, how are you today?');

      expect(result.intent).toBe('chat');
      expect(result.plan!.length).toBe(1);
    });

    it('should generate reflection for chat task', async () => {
      const stages = createDefaultStages({ llm: mockLLM, config: mockConfig });
      const engine = new PipelineEngine({ stages, eventBus });

      const result = await engine.run('tell me about the weather');

      expect(result.intent).toBe('chat');
      expect(result.metadata.reflection).toBeDefined();
    });
  });

  describe('should handle error recovery in pipeline', () => {
    it('should recover with retry when stage fails once', async () => {
      const recoveryStage = createErrorRecoveryStage();
      const stages: Stage[] = [
        new InitStage(),
        new UnderstandStage(null),
        new PlanStage(mockLLMReject, mockConfig),
        new ExecuteStage(mockLLM, mockConfig),
        recoveryStage,
        createSkipValidationStage(),
        new ReflectStage(),
      ];
      const engine = new PipelineEngine({
        stages,
        eventBus,
        maxRetries: 1,
      });

      const result = await engine.run('write a test');

      expect(result.metadata.recovered).toBe(true);
      expect(result.metadata.attempts).toBe(2);
    });

    it('should collect errors for non-required stages', async () => {
      const stages = createDefaultStages({ llm: mockLLM, config: mockConfig });
      const engine = new PipelineEngine({ stages, eventBus });

      const result = await engine.run('search for config');

      expect(result.errors).toBeDefined();
    });
  });

  describe('should emit all expected events in order', () => {
    it('should emit pipeline:start first and pipeline:complete last', async () => {
      const stages = createDefaultStages({ llm: mockLLM, config: mockConfig });
      const orderedEvents: string[] = [];

      eventBus.on('pipeline:start', () => {
        orderedEvents.push('pipeline:start');
      });
      eventBus.on('stage:start', (data) => {
        orderedEvents.push(`stage:start:${data.stage}`);
      });
      eventBus.on('stage:complete', (data) => {
        orderedEvents.push(`stage:complete:${data.stage}`);
      });
      eventBus.on('pipeline:complete', () => {
        orderedEvents.push('pipeline:complete');
      });

      const engine = new PipelineEngine({ stages, eventBus });

      await engine.run('hello world');

      expect(orderedEvents.indexOf('pipeline:start')).toBe(0);
      expect(orderedEvents.indexOf('pipeline:complete')).toBe(orderedEvents.length - 1);
    });

    it('should alternate stage:start and stage:complete for each stage', async () => {
      const stages = [
        new InitStage(),
        new UnderstandStage(null),
      ];
      const orderedEvents: string[] = [];

      eventBus.on('stage:start', (data) => {
        orderedEvents.push(`start:${data.stage}`);
      });
      eventBus.on('stage:complete', (data) => {
        orderedEvents.push(`complete:${data.stage}`);
      });

      const engine = new PipelineEngine({ stages, eventBus });

      await engine.run('hello');

      expect(orderedEvents).toEqual([
        'start:initialize',
        'complete:initialize',
        'start:understand',
        'complete:understand',
      ]);
    });
  });
});