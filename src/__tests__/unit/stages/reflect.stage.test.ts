import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ReflectStage } from '../../../stages/reflect.stage.js';
import { resetEventBus } from '../../../core/event-bus.js';
import type { PipelineContext, TaskStep, StepResult } from '../../../core/types.js';

function createStep(overrides: Partial<TaskStep> = {}): TaskStep {
  return {
    id: overrides.id ?? 'step-1',
    description: overrides.description ?? 'Test step',
    status: overrides.status ?? 'completed',
    dependencies: overrides.dependencies ?? [],
    result: overrides.result,
    error: overrides.error,
    startTime: overrides.startTime,
    endTime: overrides.endTime,
  };
}

function createContext(
  plan?: TaskStep[],
  results?: StepResult[],
  metadata?: Record<string, unknown>,
  modifiedFiles?: string[],
  createdFiles?: string[],
): PipelineContext {
  return {
    taskId: 'task-001',
    input: 'test',
    plan,
    results,
    errors: [],
    metadata: metadata ?? { startTime: Date.now() - 1000 },
    createdFiles: createdFiles ?? [],
    modifiedFiles: modifiedFiles ?? [],
    phaseHistory: [],
    shouldConfirm: false,
  };
}

describe('ReflectStage', () => {
  let stage: ReflectStage;

  beforeEach(() => {
    resetEventBus();
    stage = new ReflectStage();
  });

  afterEach(() => {
    resetEventBus();
  });

  describe('should generate reflection for completed task', () => {
    it('should add reflection to metadata', async () => {
      const plan = [
        createStep({ id: 's1', description: 'Step 1', status: 'completed' }),
      ];
      const results: StepResult[] = [
        { stepId: 's1', success: true, output: 'done', durationMs: 10, changedFiles: [] },
      ];
      const ctx = createContext(plan, results);

      const result = await stage.execute(ctx);

      expect(result.metadata.reflection).toBeDefined();
      const reflection = result.metadata.reflection as Record<string, unknown>;
      expect(reflection.completedCount).toBe(1);
      expect(reflection.failedCount).toBe(0);
      expect(reflection.totalSteps).toBe(1);
    });

    it('should note all steps completed successfully', async () => {
      const plan = [
        createStep({ id: 's1', status: 'completed' }),
        createStep({ id: 's2', status: 'completed' }),
      ];
      const results: StepResult[] = [
        { stepId: 's1', success: true, output: 'ok', durationMs: 10, changedFiles: [] },
        { stepId: 's2', success: true, output: 'ok', durationMs: 10, changedFiles: [] },
      ];
      const ctx = createContext(plan, results);

      const result = await stage.execute(ctx);

      const reflection = result.metadata.reflection as Record<string, unknown>;
      expect(reflection.completedCount).toBe(2);
      expect(reflection.failedCount).toBe(0);
    });
  });

  describe('should handle task with errors', () => {
    it('should report failed steps', async () => {
      const plan = [
        createStep({ id: 's1', status: 'completed' }),
        createStep({ id: 's2', status: 'failed', error: 'failure' }),
      ];
      const results: StepResult[] = [
        { stepId: 's1', success: true, output: 'ok', durationMs: 10, changedFiles: [] },
        { stepId: 's2', success: false, error: 'failure', durationMs: 10, changedFiles: [] },
      ];
      const ctx = createContext(plan, results);

      const result = await stage.execute(ctx);

      const reflection = result.metadata.reflection as Record<string, unknown>;
      expect(reflection.failedCount).toBe(1);
      expect((reflection.lessonsLearned as string[]).some(
        (l) => l.includes('failed'),
      )).toBe(true);
    });

    it('should handle skipped steps', async () => {
      const plan = [
        createStep({ id: 's1', status: 'completed' }),
        createStep({ id: 's2', status: 'skipped' }),
      ];
      const results: StepResult[] = [
        { stepId: 's1', success: true, output: 'ok', durationMs: 10, changedFiles: [] },
      ];
      const ctx = createContext(plan, results);

      const result = await stage.execute(ctx);

      const reflection = result.metadata.reflection as Record<string, unknown>;
      expect(reflection.skippedCount).toBe(1);
    });
  });

  describe('should include modified files in reflection', () => {
    it('should list changed files', async () => {
      const plan = [createStep({ id: 's1', status: 'completed' })];
      const results: StepResult[] = [
        { stepId: 's1', success: true, output: 'ok', durationMs: 10, changedFiles: [] },
      ];
      const ctx = createContext(
        plan,
        results,
        undefined,
        ['src/modified.ts'],
        ['src/created.ts'],
      );

      const result = await stage.execute(ctx);

      const reflection = result.metadata.reflection as Record<string, unknown>;
      const files = reflection.changedFiles as string[];
      expect(files).toContain('src/modified.ts');
      expect(files).toContain('src/created.ts');
    });

    it('should deduplicate files', async () => {
      const plan = [createStep({ id: 's1', status: 'completed' })];
      const results: StepResult[] = [
        { stepId: 's1', success: true, output: 'ok', durationMs: 10, changedFiles: [] },
      ];
      const ctx = createContext(
        plan,
        results,
        undefined,
        ['shared.ts'],
        ['shared.ts'],
      );

      const result = await stage.execute(ctx);

      const reflection = result.metadata.reflection as Record<string, unknown>;
      const files = reflection.changedFiles as string[];
      expect(files.length).toBe(1);
    });
  });

  describe('should add reflection to metadata', () => {
    it('should include timestamp', async () => {
      const ctx = createContext([], []);

      const result = await stage.execute(ctx);

      const reflection = result.metadata.reflection as Record<string, unknown>;
      expect(reflection.timestamp).toBeDefined();
      expect(typeof reflection.timestamp).toBe('number');
    });

    it('should include totalDurationMs', async () => {
      const ctx = createContext([], []);

      const result = await stage.execute(ctx);

      const reflection = result.metadata.reflection as Record<string, unknown>;
      expect(reflection.totalDurationMs).toBeDefined();
      expect(typeof reflection.totalDurationMs).toBe('number');
    });
  });

  describe('should handle empty results gracefully', () => {
    it('should work with no plan and no results', async () => {
      const ctx = createContext([], []);

      const result = await stage.execute(ctx);

      expect(result.metadata.reflection).toBeDefined();
      const reflection = result.metadata.reflection as Record<string, unknown>;
      expect(reflection.completedCount).toBe(0);
      expect(reflection.failedCount).toBe(0);
      expect(reflection.totalSteps).toBe(0);
    });

    it('should not throw with undefined plan and results', async () => {
      const ctx = createContext();

      const result = await stage.execute(ctx);

      expect(result.metadata.reflection).toBeDefined();
    });

    it('should record lessons about no changed files', async () => {
      const plan = [createStep({ id: 's1', status: 'completed' })];
      const results: StepResult[] = [
        { stepId: 's1', success: true, output: 'ok', durationMs: 10, changedFiles: [] },
      ];
      const ctx = createContext(plan, results);

      const result = await stage.execute(ctx);

      const reflection = result.metadata.reflection as Record<string, unknown>;
      const lessons = reflection.lessonsLearned as string[];
      expect(lessons.some((l) => l.includes('No files were changed'))).toBe(true);
    });
  });
});