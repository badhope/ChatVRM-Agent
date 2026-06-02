import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ValidateStage } from '../../../stages/validate.stage.js';
import { resetEventBus } from '../../../core/event-bus.js';
import type { PipelineContext, TaskStep, StepResult } from '../../../core/types.js';

function createStep(overrides: Partial<TaskStep> = {}): TaskStep {
  return {
    id: overrides.id ?? 'step-1',
    description: overrides.description ?? 'Test step',
    status: overrides.status ?? 'completed',
    dependencies: overrides.dependencies ?? [],
  };
}

function createContext(
  plan?: TaskStep[],
  results?: StepResult[],
  modifiedFiles?: string[],
  createdFiles?: string[],
): PipelineContext {
  return {
    taskId: 'task-001',
    input: 'test',
    plan,
    results,
    errors: [],
    metadata: {},
    createdFiles: createdFiles ?? [],
    modifiedFiles: modifiedFiles ?? [],
    phaseHistory: [],
    shouldConfirm: false,
  };
}

describe('ValidateStage', () => {
  let stage: ValidateStage;

  beforeEach(() => {
    resetEventBus();
    stage = new ValidateStage(undefined, undefined, { verifyFiles: false });
  });

  afterEach(() => {
    resetEventBus();
  });

  describe('should validate successfully with all steps completed', () => {
    it('should set validated to true when all steps completed', async () => {
      const plan = [
        createStep({ id: 's1', description: 'Step 1', status: 'completed' }),
        createStep({ id: 's2', description: 'Step 2', status: 'completed' }),
      ];
      const results: StepResult[] = [
        { stepId: 's1', success: true, output: 'ok', durationMs: 10, changedFiles: [] },
        { stepId: 's2', success: true, output: 'ok', durationMs: 10, changedFiles: [] },
      ];
      const ctx = createContext(plan, results, ['output.ts']);

      const result = await stage.execute(ctx);

      expect(result.metadata.validated).toBe(true);
      expect(result.metadata.validationIssues).toEqual([]);
    });

    it('should validate with no plan', async () => {
      const ctx = createContext([], []);

      const result = await stage.execute(ctx);

      expect(result.metadata.validated).toBe(true);
    });
  });

  describe('should detect missing steps', () => {
    it('should report not completed steps', async () => {
      const plan = [
        createStep({ id: 's1', description: 'Step 1', status: 'completed' }),
        createStep({ id: 's2', description: 'Step 2', status: 'running' }),
        createStep({ id: 's3', description: 'Step 3', status: 'pending' }),
      ];
      const ctx = createContext(plan, [
        { stepId: 's1', success: true, output: 'ok', durationMs: 10, changedFiles: [] },
      ]);

      const result = await stage.execute(ctx);

      expect(result.metadata.validated).toBe(false);
      const issues = result.metadata.validationIssues as string[];
      expect(issues.some((i: string) => i.includes('not completed'))).toBe(true);
    });

    it('should skip check for skipped steps', async () => {
      const plan = [
        createStep({ id: 's1', description: 'Step 1', status: 'completed' }),
        createStep({ id: 's2', description: 'Step 2', status: 'skipped' }),
      ];
      const ctx = createContext(
        plan,
        [{ stepId: 's1', success: true, output: 'ok', durationMs: 10, changedFiles: [] }],
        ['output.ts'],
      );

      const result = await stage.execute(ctx);

      expect(result.metadata.validated).toBe(true);
    });
  });

  describe('should set validated metadata', () => {
    it('should set validationTimestamp', async () => {
      const plan = [createStep({ id: 's1', status: 'completed' })];
      const results: StepResult[] = [
        { stepId: 's1', success: true, output: 'ok', durationMs: 10, changedFiles: [] },
      ];
      const ctx = createContext(plan, results, ['file.ts']);

      const result = await stage.execute(ctx);

      expect(result.metadata.validationTimestamp).toBeDefined();
      expect(typeof result.metadata.validationTimestamp).toBe('number');
    });

    it('should set validated boolean', async () => {
      const plan = [createStep({ id: 's1', status: 'completed' })];
      const results: StepResult[] = [
        { stepId: 's1', success: true, output: 'ok', durationMs: 10, changedFiles: [] },
      ];
      const ctx = createContext(plan, results, ['file.ts']);

      const result = await stage.execute(ctx);

      expect(typeof result.metadata.validated).toBe('boolean');
    });
  });

  describe('should detect errors in results', () => {
    it('should report error steps', async () => {
      const plan = [createStep({ id: 's1', status: 'failed' })];
      const results: StepResult[] = [
        { stepId: 's1', success: false, error: 'something went wrong', durationMs: 10, changedFiles: [] },
      ];
      const ctx = createContext(plan, results);

      const result = await stage.execute(ctx);

      expect(result.metadata.validated).toBe(false);
      const issues = result.metadata.validationIssues as string[];
      expect(issues.some((i: string) => i.includes('had errors'))).toBe(true);
    });

    it('should report no output files', async () => {
      const plan = [createStep({ id: 's1', status: 'completed' })];
      const results: StepResult[] = [
        { stepId: 's1', success: true, output: 'ok', durationMs: 10, changedFiles: [] },
      ];
      const ctx = createContext(plan, results);

      const result = await stage.execute(ctx);

      expect(result.metadata.validated).toBe(false);
      const issues = result.metadata.validationIssues as string[];
      expect(issues.some((i: string) => i.includes('No output files'))).toBe(true);
    });
  });
});