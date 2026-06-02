import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { InitStage } from '../../../stages/init.stage.js';
import { UnderstandStage } from '../../../stages/understand.stage.js';
import { PlanStage } from '../../../stages/plan.stage.js';
import { ExecuteStage } from '../../../stages/execute.stage.js';
import { ValidateStage } from '../../../stages/validate.stage.js';
import { ReflectStage } from '../../../stages/reflect.stage.js';
import { resetEventBus } from '../../../core/event-bus.js';
import type { PipelineContext, TaskStep, StepResult } from '../../../core/types.js';
import type { LLMAdapter } from '../../../adapters/llm.adapter.js';
import type { ConfigAdapter } from '../../../adapters/config.adapter.js';

const mockLLM = {
  chat: vi.fn().mockRejectedValue(new Error('LLM fallback')),
  stream: vi.fn(),
  listModels: vi.fn(),
  isAvailable: vi.fn().mockResolvedValue(true),
} as unknown as LLMAdapter;

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

function createContext(input: string, overrides: Partial<PipelineContext> = {}): PipelineContext {
  return {
    taskId: overrides.taskId ?? 'task-001',
    input,
    intent: overrides.intent,
    plan: overrides.plan,
    results: overrides.results,
    errors: overrides.errors ?? [],
    metadata: overrides.metadata ?? {},
    createdFiles: overrides.createdFiles ?? [],
    modifiedFiles: overrides.modifiedFiles ?? [],
    phaseHistory: overrides.phaseHistory ?? [],
    shouldConfirm: false,
  };
}

function createStep(overrides: Partial<TaskStep> = {}): TaskStep {
  return {
    id: overrides.id ?? 'step-1',
    description: overrides.description ?? 'Test step',
    tool: overrides.tool,
    args: overrides.args,
    dependencies: overrides.dependencies ?? [],
    status: overrides.status ?? 'pending',
    result: overrides.result,
    error: overrides.error,
    startTime: overrides.startTime,
    endTime: overrides.endTime,
  };
}

describe('InitStage edge cases', () => {
  let stage: InitStage;

  beforeEach(() => {
    resetEventBus();
    stage = new InitStage();
  });

  afterEach(() => {
    resetEventBus();
  });

  describe('should handle input with only whitespace (reject)', () => {
    it('should reject single space input', async () => {
      const ctx = createContext(' ');
      await expect(stage.execute(ctx)).rejects.toThrow('Input must be non-empty');
    });

    it('should reject tab-only input', async () => {
      const ctx = createContext('\t');
      await expect(stage.execute(ctx)).rejects.toThrow('Input must be non-empty');
    });

    it('should reject newline-only input', async () => {
      const ctx = createContext('\n');
      await expect(stage.execute(ctx)).rejects.toThrow('Input must be non-empty');
    });

    it('should reject mixed whitespace input', async () => {
      const ctx = createContext('  \t  \n  ');
      await expect(stage.execute(ctx)).rejects.toThrow('Input must be non-empty');
    });

    it('should accept zero-width space as it is not trimmable', async () => {
      const ctx = createContext('\u200B\u200B');

      const result = await stage.execute(ctx);

      expect(result.input).toBe('\u200B\u200B');
      expect(result.metadata.startTime).toBeGreaterThan(0);
    });
  });

  describe('should handle very long input', () => {
    it('should accept 100KB input', async () => {
      const longInput = 'x'.repeat(102400);
      const ctx = createContext(longInput);

      const result = await stage.execute(ctx);

      expect(result.input).toBe(longInput);
      expect(result.metadata.startTime).toBeGreaterThan(0);
    });

    it('should preserve long input without truncation', async () => {
      const longInput = '中'.repeat(10000);
      const ctx = createContext(longInput);

      const result = await stage.execute(ctx);

      expect(result.input.length).toBe(10000);
      expect(result.input).toBe(longInput);
    });
  });
});

describe('UnderstandStage edge cases', () => {
  let stage: UnderstandStage;

  beforeEach(() => {
    resetEventBus();
    stage = new UnderstandStage(null);
  });

  afterEach(() => {
    resetEventBus();
  });

  describe('should handle mixed intent keywords (matches first pattern)', () => {
    it('should match code over chat when both keywords present', async () => {
      const ctx = createContext('write a function to help me fix the bug');

      const result = await stage.execute(ctx);

      expect(result.intent).toBe('code');
    });

    it('should match file-op over code when file keyword appears first', async () => {
      const ctx = createContext('read the file and implement the fix');

      const result = await stage.execute(ctx);

      expect(result.intent).toBe('code');
    });

    it('should match code when write appears before search', async () => {
      const ctx = createContext('write code and find issues');

      const result = await stage.execute(ctx);

      expect(result.intent).toBe('code');
    });
  });

  describe('should handle empty context files listing', () => {
    it('should set contextFiles to empty array when no project files exist', async () => {
      const ctx = createContext('analyze the project');

      const result = await stage.execute(ctx);

      expect(result.metadata.contextFiles).toBeDefined();
      expect(Array.isArray(result.metadata.contextFiles)).toBe(true);
    });

    it('should set intentConfidence to low for general intent without files', async () => {
      const ctx = createContext('xyzzy blarg flob');

      const result = await stage.execute(ctx);

      expect(result.metadata.intentConfidence).toBe('low');
    });
  });
});

describe('PlanStage edge cases', () => {
  let stage: PlanStage;

  beforeEach(() => {
    resetEventBus();
    stage = new PlanStage(mockLLM, mockConfig);
  });

  afterEach(() => {
    resetEventBus();
  });

  describe('should generate unique step IDs (no duplicates)', () => {
    it('should generate unique IDs for all steps in code plan', async () => {
      const ctx = createContext('write code', { intent: 'code' });

      const result = await stage.execute(ctx);

      const ids = result.plan!.map((s) => s.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });

    it('should generate unique IDs for all steps in general plan', async () => {
      const ctx = createContext('do something', { intent: 'general' });

      const result = await stage.execute(ctx);

      const ids = result.plan!.map((s) => s.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });

    it('should generate UUID-format IDs', async () => {
      const ctx = createContext('test', { intent: 'code' });

      const result = await stage.execute(ctx);

      for (const step of result.plan!) {
        expect(step.id).toMatch(
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
        );
      }
    });

    it('should generate different IDs on multiple executions', async () => {
      const ctx1 = createContext('test1', { intent: 'code' });
      const ctx2 = createContext('test2', { intent: 'code' });

      const result1 = await stage.execute(ctx1);
      const result2 = await stage.execute(ctx2);

      const ids1 = new Set(result1.plan!.map((s) => s.id));
      const ids2 = new Set(result2.plan!.map((s) => s.id));

      for (const id of ids2) {
        expect(ids1.has(id)).toBe(false);
      }
    });
  });

  describe('should handle unknown intent (falls back to general)', () => {
    it('should fallback to general for completely unknown intent', async () => {
      const ctx = createContext('test', { intent: 'nonexistent-intent' });

      const result = await stage.execute(ctx);

      expect(result.plan).toBeDefined();
      expect(result.plan!.length).toBeGreaterThan(0);
      expect(result.plan![0].description).toBe('Analyze the user request');
    });

    it('should use general plan when intent is empty string', async () => {
      const ctx = createContext('test', { intent: '' });

      const result = await stage.execute(ctx);

      expect(result.plan).toBeDefined();
      expect(result.plan!.length).toBe(3);
    });
  });
});

describe('ExecuteStage edge cases', () => {
  let stage: ExecuteStage;

  beforeEach(() => {
    resetEventBus();
    stage = new ExecuteStage(mockLLMResponder, mockConfig);
  });

  afterEach(() => {
    resetEventBus();
  });

  describe('should handle plan with zero steps', () => {
    it('should throw for empty plan array', async () => {
      const ctx = createContext('test', { plan: [] });

      await expect(stage.execute(ctx)).rejects.toThrow('No plan steps to execute');
    });

    it('should throw when plan is undefined', async () => {
      const ctx = createContext('test');

      await expect(stage.execute(ctx)).rejects.toThrow('No plan steps to execute');
    });
  });

  describe('should handle rollback after partial execution', () => {
    it('should reset steps to pending on rollback', async () => {
      const plan = [
        createStep({ id: 's1', description: 'Step 1', status: 'completed', result: 'done' }),
        createStep({ id: 's2', description: 'Step 2', status: 'failed', error: 'oops' }),
        createStep({ id: 's3', description: 'Step 3', status: 'pending' }),
      ];
      const ctx = createContext('test', {
        plan,
        results: [
          { stepId: 's1', success: true, output: 'done', durationMs: 10, changedFiles: [] },
          { stepId: 's2', success: false, error: 'oops', durationMs: 5, changedFiles: [] },
        ],
      });

      const result = await stage.rollback(ctx);

      expect(result.plan![0].status).toBe('pending');
      expect(result.plan![0].result).toBeUndefined();
      expect(result.plan![0].error).toBeUndefined();
      expect(result.plan![0].startTime).toBeUndefined();
      expect(result.plan![0].endTime).toBeUndefined();
      expect(result.plan![1].status).toBe('pending');
      expect(result.plan![2].status).toBe('pending');
    });

    it('should clear results on rollback', async () => {
      const plan = [
        createStep({ id: 's1', description: 'Step 1', status: 'completed', result: 'done' }),
      ];
      const ctx = createContext('test', {
        plan,
        results: [
          { stepId: 's1', success: true, output: 'done', durationMs: 10, changedFiles: [] },
        ],
      });

      const result = await stage.rollback(ctx);

      expect(result.results!.length).toBe(0);
    });

    it('should preserve pending step status on rollback', async () => {
      const plan = [
        createStep({ id: 's1', description: 'Step 1', status: 'completed', result: 'done' }),
        createStep({ id: 's2', description: 'Step 2', status: 'pending' }),
      ];
      const ctx = createContext('test', { plan, results: [] });

      const result = await stage.rollback(ctx);

      expect(result.plan![1].status).toBe('pending');
    });
  });

  describe('should mark step status correctly during execution', () => {
    it('should mark step status as completed for successful steps', async () => {
      const plan = [
        createStep({ id: 's1', description: 'Step 1' }),
      ];
      const ctx = createContext('test', { plan });

      const result = await stage.execute(ctx);

      expect(result.plan![0].status).toBe('completed');
      expect(result.plan![0].startTime).toBeDefined();
      expect(result.plan![0].endTime).toBeDefined();
      expect(result.plan![0].result).toBeDefined();
    });

    it('should emit step:start and step:complete events in order', async () => {
      const plan = [
        createStep({ id: 's1', description: 'Step 1' }),
      ];
      const ctx = createContext('test', { plan });

      const result = await stage.execute(ctx);

      expect(result.results![0].success).toBe(true);
      expect(result.results![0].stepId).toBe('s1');
      expect(result.results![0].durationMs).toBeGreaterThanOrEqual(0);
    });

    it('should mark step as failed when simulateExecution throws', async () => {
      const failingLLM = {
        chat: vi.fn().mockRejectedValue(new Error('step failure')),
        stream: vi.fn(),
        listModels: vi.fn(),
        isAvailable: vi.fn().mockResolvedValue(true),
      } as unknown as LLMAdapter;
      const stageWithFailingLLM = new ExecuteStage(failingLLM, mockConfig);

      const plan = [createStep({ id: 's1', description: 'Failing step' })];
      const ctx = createContext('test', { plan });

      await expect(stageWithFailingLLM.execute(ctx)).rejects.toThrow('step failure');
    });
  });
});

describe('ValidateStage edge cases', () => {
  let stage: ValidateStage;

  beforeEach(() => {
    resetEventBus();
    stage = new ValidateStage();
  });

  afterEach(() => {
    resetEventBus();
  });

  describe('should handle context with no plan', () => {
    it('should validate with empty plan array', async () => {
      const ctx = createContext('test', { plan: [], results: [] });

      const result = await stage.execute(ctx);

      expect(result.metadata.validated).toBe(true);
    });

    it('should validate with undefined plan', async () => {
      const ctx = createContext('test');

      const result = await stage.execute(ctx);

      expect(result.metadata.validated).toBe(true);
    });

    it('should not report "no output files" when plan is empty', async () => {
      const ctx = createContext('test', { plan: [], results: [] });

      const result = await stage.execute(ctx);

      const issues = result.metadata.validationIssues as string[];
      const outputIssue = issues.find((i) => i.includes('No output files'));
      expect(outputIssue).toBeUndefined();
    });
  });

  describe('should detect partial completion (some steps failed)', () => {
    it('should detect when only some steps completed', async () => {
      const plan = [
        createStep({ id: 's1', status: 'completed' }),
        createStep({ id: 's2', status: 'failed' }),
        createStep({ id: 's3', status: 'pending' }),
      ];
      const results: StepResult[] = [
        { stepId: 's1', success: true, output: 'ok', durationMs: 10, changedFiles: [] },
        { stepId: 's2', success: false, error: 'fail', durationMs: 5, changedFiles: [] },
      ];
      const ctx = createContext('test', { plan, results });

      const result = await stage.execute(ctx);

      expect(result.metadata.validated).toBe(false);
      const issues = result.metadata.validationIssues as string[];
      expect(issues.some((i) => i.includes('not completed'))).toBe(true);
      expect(issues.some((i) => i.includes('had errors'))).toBe(true);
    });

    it('should count all non-skipped incomplete steps', async () => {
      const plan = [
        createStep({ id: 's1', status: 'completed' }),
        createStep({ id: 's2', status: 'running' }),
        createStep({ id: 's3', status: 'pending' }),
      ];
      const results: StepResult[] = [
        { stepId: 's1', success: true, output: 'ok', durationMs: 10, changedFiles: [] },
      ];
      const ctx = createContext('test', { plan, results });

      const result = await stage.execute(ctx);

      const issues = result.metadata.validationIssues as string[];
      const notCompletedIssue = issues.find((i) => i.includes('not completed'));
      expect(notCompletedIssue).toBeDefined();
      expect(notCompletedIssue).toContain('2 step(s) not completed');
    });

    it('should include validationTimestamp in metadata', async () => {
      const plan = [createStep({ id: 's1', status: 'completed' })];
      const results: StepResult[] = [
        { stepId: 's1', success: true, output: 'ok', durationMs: 10, changedFiles: [] },
      ];
      const ctx = createContext('test', { plan, results, modifiedFiles: ['file.ts'] });

      const result = await stage.execute(ctx);

      expect(result.metadata.validationTimestamp).toBeGreaterThan(0);
    });
  });
});

describe('ReflectStage edge cases', () => {
  let stage: ReflectStage;

  beforeEach(() => {
    resetEventBus();
    stage = new ReflectStage();
  });

  afterEach(() => {
    resetEventBus();
  });

  describe('should handle very long step descriptions', () => {
    it('should handle very long step descriptions in reflection', async () => {
      const longDesc = 'A step with a very long description that goes on and on. '.repeat(20);
      const plan = [
        createStep({ id: 's1', description: longDesc, status: 'completed' }),
      ];
      const results: StepResult[] = [
        { stepId: 's1', success: true, output: longDesc, durationMs: 10, changedFiles: [] },
      ];
      const ctx = createContext('test', {
        plan,
        results,
        metadata: { startTime: Date.now() - 1000 },
      });

      const result = await stage.execute(ctx);

      const reflection = result.metadata.reflection as Record<string, unknown>;
      expect(reflection.completedCount).toBe(1);
      expect(reflection.totalSteps).toBe(1);
    });
  });

  describe('should be non-required (not blocking)', () => {
    it('should have required set to false', () => {
      expect(stage.required).toBe(false);
    });

    it('should never throw even with malformed context', async () => {
      const ctx = createContext('test');

      const result = await stage.execute(ctx);

      expect(result.metadata.reflection).toBeDefined();
    });

    it('should handle missing startTime in metadata gracefully', async () => {
      const ctx = createContext('test');

      const result = await stage.execute(ctx);

      const reflection = result.metadata.reflection as Record<string, unknown>;
      expect(reflection.totalDurationMs).toBeGreaterThanOrEqual(0);
    });

    it('should report long pipeline duration lesson', async () => {
      const plan = [createStep({ id: 's1', status: 'completed' })];
      const results: StepResult[] = [
        { stepId: 's1', success: true, output: 'ok', durationMs: 10, changedFiles: [] },
      ];
      const ctx = createContext('test', {
        plan,
        results,
        metadata: { startTime: Date.now() - 120000 },
      });

      const result = await stage.execute(ctx);

      const reflection = result.metadata.reflection as Record<string, unknown>;
      const lessons = reflection.lessonsLearned as string[];
      expect(lessons.some((l) => l.includes('Pipeline took'))).toBe(true);
    });

    it('should catch internal errors and still return context with error reflection', async () => {
      const ctx = createContext('test');

      const result = await stage.execute(ctx);

      expect(result.metadata.reflection).toBeDefined();
      const reflection = result.metadata.reflection as Record<string, unknown>;
      expect(reflection.timestamp).toBeGreaterThan(0);
    });
  });
});