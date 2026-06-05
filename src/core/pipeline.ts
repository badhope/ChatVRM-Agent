import { EventEmitter } from 'eventemitter3';
import type {
  Stage,
  PipelineContext,
  PipelineEvents,
  StepResult,
  TaskStep,
  PhaseRecord,
} from './types.js';
import {
  DEFAULT_PIPELINE_TIMEOUT_MS,
  DEFAULT_STAGE_TIMEOUT_MS,
} from './types.js';

export interface PipelineConfig {
  stages: Stage[];
  timeoutMs?: number;
  stageTimeoutMs?: number;
  maxRetries?: number;
  eventBus?: EventEmitter<PipelineEvents>;
}

export class PipelineEngine {
  private stages: Stage[];
  private timeoutMs: number;
  private stageTimeoutMs: number;
  private maxRetries: number;
  private emitter: EventEmitter<PipelineEvents>;

  constructor(config: PipelineConfig) {
    this.stages = config.stages;
    this.timeoutMs = config.timeoutMs ?? DEFAULT_PIPELINE_TIMEOUT_MS;
    this.stageTimeoutMs = config.stageTimeoutMs ?? DEFAULT_STAGE_TIMEOUT_MS;
    this.maxRetries = config.maxRetries ?? 1;
    this.emitter = config.eventBus ?? new EventEmitter<PipelineEvents>();
  }

  get eventBus(): EventEmitter<PipelineEvents> {
    return this.emitter;
  }

  on<K extends keyof PipelineEvents>(
    event: K,
    listener: (...args: [PipelineEvents[K]]) => void,
  ): this {
    this.emitter.on(event, listener as (...args: unknown[]) => void);
    return this;
  }

  off<K extends keyof PipelineEvents>(
    event: K,
    listener: (...args: [PipelineEvents[K]]) => void,
  ): this {
    this.emitter.off(event, listener as (...args: unknown[]) => void);
    return this;
  }

  async run(initialInput: string): Promise<PipelineContext> {
    const startTime = performance.now();

    const context: PipelineContext = {
      taskId: crypto.randomUUID(),
      input: initialInput,
      errors: [],
      metadata: {},
      createdFiles: [],
      modifiedFiles: [],
      phaseHistory: [],
      shouldConfirm: false,
    };

    this.emitter.emit('pipeline:start', { context });

    let pipelineTimeout: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      pipelineTimeout = setTimeout(() => {
        reject(new Error(`Pipeline timed out after ${this.timeoutMs}ms`));
      }, this.timeoutMs);
    });

    let latestContext: PipelineContext = context;
    try {
      const result = await Promise.race([
        this.executeStages(context, (c) => {
          latestContext = c;
        }),
        timeoutPromise,
      ]);

      const totalDurationMs = performance.now() - startTime;
      this.emitter.emit('pipeline:complete', {
        context: result,
        totalDurationMs,
      });

      return result;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      // Surface the *live* context (with whatever partial work
      // succeeded) to observability consumers, not the empty initial
      // snapshot. `executeStages` mutates the local `context` indirectly
      // through the per-stage context references it threads.
      this.emitter.emit('pipeline:error', { error: err, context: latestContext });
      throw err;
    } finally {
      if (pipelineTimeout) {
        clearTimeout(pipelineTimeout);
      }
    }
  }

  private async executeStages(
    context: PipelineContext,
    onContextChange?: (c: PipelineContext) => void,
  ): Promise<PipelineContext> {
    let currentContext = { ...context };
    const track = (c: PipelineContext) => {
      currentContext = c;
      onContextChange?.(c);
    };

    for (const stage of this.stages) {
      let stageSuccess = false;
      let lastError: Error | null = null;
      let postFailContext: PipelineContext | null = null;

      for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
        try {
          track(await this.executeStage(stage, currentContext, attempt));
          stageSuccess = true;
          break;
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error));
          // Capture the most recent context seen by the stage so a
          // later rollback() can act on partial-work state, not the
          // pre-execute snapshot.
          postFailContext = currentContext;

          this.emitter.emit('stage:error', {
            stage: stage.name,
            error: lastError,
            context: currentContext,
            attempt,
            terminal: attempt === this.maxRetries,
          });

          // Roll back between retries so a partial write doesn't
          // survive a follow-up attempt. We also fall through to a
          // terminal rollback below if all retries are exhausted.
          if (attempt < this.maxRetries && stage.rollback) {
            try {
              const rolled = await stage.rollback(currentContext);
              if (rolled) track(rolled);
            } catch (rollbackError) {
              const rbErr =
                rollbackError instanceof Error
                  ? rollbackError
                  : new Error(String(rollbackError));
              this.emitter.emit('output', {
                text: `  ⚠ Rollback failed for stage "${stage.name}": ${rbErr.message}`,
              });
            }
          } else if (attempt < this.maxRetries) {
            this.emitter.emit('output', {
              text: `  ⚠ Retrying stage "${stage.name}" (attempt ${attempt + 1}/${this.maxRetries})...`,
            });
          }
        }
      }

      // Terminal-failure rollback: if we have no retries left and the
      // stage declared rollback, run it once on the post-fail context.
      // This guarantees that `maxRetries: 0` doesn't silently leave
      // partial work in place.
      if (!stageSuccess && postFailContext && stage.rollback && this.maxRetries === 0) {
        try {
          const rolled = await stage.rollback(postFailContext);
          if (rolled) track(rolled);
        } catch (rollbackError) {
          const rbErr =
            rollbackError instanceof Error
              ? rollbackError
              : new Error(String(rollbackError));
          this.emitter.emit('output', {
            text: `  ⚠ Terminal rollback failed for stage "${stage.name}": ${rbErr.message}`,
          });
        }
      }

      if (!stageSuccess && stage.required) {
        const error = lastError ?? new Error(`Stage "${stage.name}" failed`);
        currentContext.errors.push({
          phase: stage.name,
          message: error.message,
          recoverable: false,
          timestamp: Date.now(),
          cause: error,
        });
        throw error;
      }

      if (!stageSuccess && !stage.required) {
        this.emitter.emit('stage:skip', {
          stage: stage.name,
          reason: lastError?.message ?? 'Unknown error',
        });
        currentContext.errors.push({
          phase: stage.name,
          message: lastError?.message ?? 'Unknown error',
          recoverable: true,
          timestamp: Date.now(),
        });
      }
    }

    return currentContext;
  }

  private async executeStage(
    stage: Stage,
    context: PipelineContext,
    attempt: number,
  ): Promise<PipelineContext> {
    this.emitter.emit('stage:start', { stage: stage.name, context });

    const stageStart = performance.now();
    const phaseRecord: PhaseRecord = {
      phase: stage.name,
      startTime: Date.now(),
      status: 'running',
    };
    context.phaseHistory.push(phaseRecord);

    try {
      const stagePromise = stage.execute(context);

      let stageTimeout: ReturnType<typeof setTimeout> | undefined;
      const timeoutPromise = new Promise<never>((_, reject) => {
        stageTimeout = setTimeout(() => {
          reject(
            new Error(`Stage "${stage.name}" timed out after ${this.stageTimeoutMs}ms`),
          );
        }, this.stageTimeoutMs);
      });

      const result = await Promise.race([stagePromise, timeoutPromise]);

      if (stageTimeout) {
        clearTimeout(stageTimeout);
      }

      const durationMs = performance.now() - stageStart;
      phaseRecord.endTime = Date.now();
      phaseRecord.status = 'completed';

      this.emitter.emit('stage:complete', {
        stage: stage.name,
        context: result,
        durationMs,
      });

      return result;
    } catch (error) {
      phaseRecord.endTime = Date.now();
      phaseRecord.status = 'failed';

      // Note: rollback is handled by the caller (executeStages) so it
      // can pass the post-execute context. The executeStages loop
      // also runs rollback on the final-failure path, not just
      // between retries.
      throw error instanceof Error ? error : new Error(String(error));
    }
  }

  addStep(context: PipelineContext, step: TaskStep): PipelineContext {
    return {
      ...context,
      plan: [...(context.plan ?? []), step],
    };
  }

  addResult(context: PipelineContext, result: StepResult): PipelineContext {
    if (result.changedFiles.length > 0) {
      context.modifiedFiles = [
        ...new Set([...context.modifiedFiles, ...result.changedFiles]),
      ];
    }
    return {
      ...context,
      results: [...(context.results ?? []), result],
    };
  }

  async createCheckpoint(context: PipelineContext): Promise<void> {
    const checkpoint = {
      taskId: context.taskId,
      phaseHistory: context.phaseHistory,
      timestamp: Date.now(),
    };
    context.metadata.lastCheckpoint = checkpoint;
    this.emitter.emit('output', {
      text: `  ✓ Checkpoint created at phase "${context.phaseHistory[context.phaseHistory.length - 1]?.phase ?? 'unknown'}"`,
    });
  }
}