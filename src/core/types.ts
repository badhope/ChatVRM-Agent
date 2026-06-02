import type { EventEmitter } from 'eventemitter3';

export interface PipelineContext {
  taskId: string;
  input: string;
  intent?: string;
  plan?: TaskStep[];
  results?: StepResult[];
  errors: PipelineError[];
  metadata: Record<string, unknown>;
  createdFiles: string[];
  modifiedFiles: string[];
  phaseHistory: PhaseRecord[];
  shouldConfirm: boolean;
  confirmPrompt?: string;
}

export interface PipelineError {
  phase: string;
  message: string;
  recoverable: boolean;
  timestamp: number;
  cause?: unknown;
}

export interface PhaseRecord {
  phase: string;
  startTime: number;
  endTime?: number;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
}

export interface TaskStep {
  id: string;
  description: string;
  tool?: string;
  args?: Record<string, unknown>;
  dependencies: string[];
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  result?: string;
  error?: string;
  startTime?: number;
  endTime?: number;
}

export interface StepResult {
  stepId: string;
  success: boolean;
  output?: string;
  error?: string;
  durationMs: number;
  changedFiles: string[];
}

export interface Stage {
  readonly name: string;
  readonly required: boolean;
  execute(ctx: PipelineContext): Promise<PipelineContext>;
  canRollback?: boolean;
  rollback?(ctx: PipelineContext): Promise<PipelineContext>;
}

export interface PipelineEvents {
  'pipeline:start': { context: PipelineContext };
  'pipeline:complete': { context: PipelineContext; totalDurationMs: number };
  'pipeline:error': { error: Error; context: PipelineContext };
  'stage:start': { stage: string; context: PipelineContext };
  'stage:complete': { stage: string; context: PipelineContext; durationMs: number };
  'stage:error': { stage: string; error: Error; context: PipelineContext };
  'stage:skip': { stage: string; reason: string };
  'step:start': { step: TaskStep };
  'step:complete': { step: TaskStep; result: StepResult };
  'step:error': { step: TaskStep; error: Error };
  'output': { text: string };
  'trust:warning': { message: string; issues: Array<{ type: string; level: string }> };
  'llm:call': { provider: string; model: string; tokens?: number };
  'memory:store': { type: string };
}

export type PipelineEventBus = EventEmitter<PipelineEvents>;

export const DEFAULT_PIPELINE_TIMEOUT_MS = 600_000;
export const DEFAULT_STAGE_TIMEOUT_MS = 300_000;
export const MAX_STEPS = 20;
export const DEFAULT_CONTEXT_TOKENS = 8000;