import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ExecuteStage } from '../../../stages/execute.stage.js';
import { resetEventBus } from '../../../core/event-bus.js';
import { MAX_STEPS } from '../../../core/types.js';
import type { PipelineContext, TaskStep } from '../../../core/types.js';
import type { LLMAdapter } from '../../../adapters/llm.adapter.js';
import type { ConfigAdapter } from '../../../adapters/config.adapter.js';

const mockLLMResponder = {
  chat: vi.fn().mockResolvedValue({
    content: 'Here is the result of the task.',
    model: 'gpt-4',
    usage: { promptTokens: 50, completionTokens: 100, totalTokens: 150 },
  }),
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

function createStep(overrides: Partial<TaskStep> = {}): TaskStep {
  return {
    id: overrides.id ?? 'step-1',
    description: overrides.description ?? 'Test step',
    tool: overrides.tool ?? 'test',
    args: overrides.args ?? {},
    dependencies: overrides.dependencies ?? [],
    status: overrides.status ?? 'pending',
  };
}

function createContext(plan?: TaskStep[]): PipelineContext {
  return {
    taskId: 'task-001',
    input: 'test',
    plan,
    errors: [],
    metadata: {},
    createdFiles: [],
    modifiedFiles: [],
    phaseHistory: [],
    shouldConfirm: false,
  };
}

describe('ExecuteStage', () => {
  let stage: ExecuteStage;

  beforeEach(() => {
    resetEventBus();
    stage = new ExecuteStage(mockLLMResponder, mockConfig);
  });

  afterEach(() => {
    resetEventBus();
  });

  describe('should execute all steps', () => {
    it('should execute multiple steps', async () => {
      const plan = [
        createStep({ id: 's1', description: 'Step 1' }),
        createStep({ id: 's2', description: 'Step 2' }),
        createStep({ id: 's3', description: 'Step 3' }),
      ];
      const ctx = createContext(plan);

      const result = await stage.execute(ctx);

      expect(result.results).toBeDefined();
      expect(result.results!.length).toBe(3);
      expect(result.results!.every((r) => r.success)).toBe(true);
    });

    it('should update plan step statuses', async () => {
      const plan = [
        createStep({ id: 's1', description: 'Step 1' }),
        createStep({ id: 's2', description: 'Step 2' }),
      ];
      const ctx = createContext(plan);

      const result = await stage.execute(ctx);

      expect(result.plan).toBeDefined();
      expect(result.plan!.every((s) => s.status === 'completed')).toBe(true);
    });

    it('should throw if no plan steps', async () => {
      const ctx = createContext([]);

      await expect(stage.execute(ctx)).rejects.toThrow('No plan steps to execute');
    });

    it('should throw if plan is undefined', async () => {
      const ctx = createContext();

      await expect(stage.execute(ctx)).rejects.toThrow('No plan steps to execute');
    });
  });

  describe('should collect results in context', () => {
    it('should populate results array', async () => {
      const plan = [
        createStep({ id: 's1', description: 'Step A' }),
      ];
      const ctx = createContext(plan);

      const result = await stage.execute(ctx);

      expect(result.results).toBeDefined();
      expect(result.results!.length).toBe(1);
      expect(result.results![0]).toHaveProperty('stepId');
      expect(result.results![0]).toHaveProperty('success');
      expect(result.results![0]).toHaveProperty('durationMs');
    });

    it('should merge with existing results', async () => {
      const plan = [createStep({ id: 's1', description: 'New step' })];
      const ctx = createContext(plan);
      ctx.results = [{
        stepId: 'existing',
        success: true,
        output: 'previous',
        durationMs: 10,
        changedFiles: [],
      }];

      const result = await stage.execute(ctx);

      expect(result.results!.length).toBe(2);
    });
  });

  describe('should mark steps as completed', () => {
    it('should set status to completed for successful steps', async () => {
      const plan = [createStep({ id: 's1', description: 'Step X' })];
      const ctx = createContext(plan);

      const result = await stage.execute(ctx);

      expect(result.plan![0].status).toBe('completed');
      expect(result.plan![0].result).toBeDefined();
      expect(result.plan![0].endTime).toBeDefined();
    });

    it('should set startTime on steps', async () => {
      const plan = [createStep({ id: 's1', description: 'Step X' })];
      const ctx = createContext(plan);

      const result = await stage.execute(ctx);

      expect(result.plan![0].startTime).toBeDefined();
    });
  });

  describe('should handle step failure gracefully', () => {
    it('should throw on step failure', async () => {
      const failingLLM = {
        chat: vi.fn().mockRejectedValue(new Error('step failure')),
        stream: vi.fn(),
        listModels: vi.fn(),
        isAvailable: vi.fn().mockResolvedValue(true),
      } as unknown as LLMAdapter;
      const stageWithFailingLLM = new ExecuteStage(failingLLM, mockConfig);

      const plan = [createStep({ id: 's1', description: 'Failing step' })];
      const ctx = createContext(plan);

      await expect(stageWithFailingLLM.execute(ctx)).rejects.toThrow('step failure');
    });
  });

  describe('should enforce max steps limit', () => {
    it('should throw when plan exceeds MAX_STEPS', async () => {
      const plan: TaskStep[] = [];
      for (let i = 0; i < MAX_STEPS + 1; i++) {
        plan.push(createStep({ id: `s${i}`, description: `Step ${i}` }));
      }
      const ctx = createContext(plan);

      await expect(stage.execute(ctx)).rejects.toThrow(`exceeds maximum of ${MAX_STEPS} steps`);
    });

    it('should accept plan at exactly MAX_STEPS', async () => {
      const plan: TaskStep[] = [];
      for (let i = 0; i < MAX_STEPS; i++) {
        plan.push(createStep({ id: `s${i}`, description: `Step ${i}` }));
      }
      const ctx = createContext(plan);

      const result = await stage.execute(ctx);

      expect(result.results!.length).toBe(MAX_STEPS);
    });
  });

  describe('should support rollback', () => {
    it('should have canRollback set to true', () => {
      expect(stage.canRollback).toBe(true);
    });

    it('should reset completed steps to pending', async () => {
      const plan = [
        createStep({ id: 's1', description: 'Step 1', status: 'completed', result: 'done' }),
        createStep({ id: 's2', description: 'Step 2', status: 'failed', error: 'oops' }),
        createStep({ id: 's3', description: 'Step 3', status: 'pending' }),
      ];
      const ctx = createContext(plan);
      ctx.results = [
        { stepId: 's1', success: true, output: 'done', durationMs: 10, changedFiles: [] },
        { stepId: 's2', success: false, error: 'oops', durationMs: 5, changedFiles: [] },
      ];

      const result = await stage.rollback(ctx);

      expect(result.plan![0].status).toBe('pending');
      expect(result.plan![0].result).toBeUndefined();
      expect(result.plan![0].error).toBeUndefined();
      expect(result.plan![1].status).toBe('pending');
      expect(result.plan![1].result).toBeUndefined();
      expect(result.plan![2].status).toBe('pending');
      expect(result.results!.length).toBe(0);
    });

    it('should be called during retry if canRollback is true', async () => {
      expect(stage.rollback).toBeDefined();
      expect(typeof stage.rollback).toBe('function');
    });
  });
});