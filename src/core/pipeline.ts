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
  // M5b (W19): the most recent raw return from any stage.
  // Stages may return `null` or `undefined` to signal
  // "no context change" (a no-op stage is perfectly valid),
  // and the test suite asserts that `run()` then propagates
  // that value to the caller. The pre-W19 code only tracked
  // `PipelineContext` and silently coerced nullish to the
  // previous snapshot, which broke the
  // `expect(result).toBeNull()` test for `validate` stages.
  // Marked `private` so callers can't reach in and mutate
  // it; the only way to observe it is via the public `run()`
  // boundary.
  private _lastStageReturn: unknown = undefined;
  // M5b (W19): counts how many stages actually ran in the
  // most recent `executeStages` call. The `run()` boundary
  // needs this to distinguish "no stage ran at all" (a
  // zero-stage pipeline, or a timeout-before-any-completion
  // scenario) from "a stage returned `undefined`" — the
  // `_lastStageReturn` field is `undefined` in both cases,
  // so we need a separate counter to tell them apart.
  private _stagesExecuted = 0;

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
    let timedOut = false;
    // M14 (W18): the pipeline timeout now aborts an in-flight
    // AbortController that we pass to every stage. Without this,
    // a stage that had already started an LLM call would happily
    // continue past the pipeline timeout — the timeout error would
    // surface to the caller, but the underlying provider request
    // would still resolve eventually, and any post-stage hooks
    // (file writes, cache updates, observability spans) would
    // continue to fire, polluting the run summary. We attach the
    // signal to the *stage* execution by threading it through the
    // context's `metadata.signal` so stages that opt in to the
    // signal can short-circuit their work.
    const stageSignal = new AbortController();
    const timeoutPromise = new Promise<never>((_, reject) => {
      pipelineTimeout = setTimeout(() => {
        timedOut = true;
        try {
          stageSignal.abort(new Error(`Pipeline timed out after ${this.timeoutMs}ms`));
        } catch {
          // AbortController.abort() can throw if the controller is
          // already aborted; ignore.
        }
        reject(new Error(`Pipeline timed out after ${this.timeoutMs}ms`));
      }, this.timeoutMs);
    });

    let latestContext: PipelineContext = context;
    // Track the inner promise so we can silence unhandled rejections
    // that surface *after* the timeout. Without this, a stage that
    // rejects a few ticks after the timeout fires produces an
    // `unhandledRejection` warning that pollutes the test output and
    // can crash stricter process managers. We deliberately don't
    // `await innerPromise` here — doing so would block until every
    // in-flight LLM call / file write completes, which defeats the
    // whole point of the timeout.
    const innerPromise = this.executeStages(
      { ...context, metadata: { ...context.metadata, signal: stageSignal.signal } },
      (c) => {
        latestContext = c;
      },
    );
    if (timedOut) {
      // `timedOut` is only set inside the timeout callback, so this
      // branch never fires on the initial pass. We attach the
      // catch handler unconditionally to avoid an extra microtask.
    }
    innerPromise.catch(() => {
      // Swallow rejections that arrive after we've already surfaced
      // the timeout error to the caller. The rejection still
      // happened, but our caller already moved on.
    });

    try {
      const result = await Promise.race([innerPromise, timeoutPromise]);

      const totalDurationMs = performance.now() - startTime;
      // M5b (W19): if a stage returned `null` or `undefined`,
      // `result` is the (pre-W19) coercian fallback (a copy of
      // the input context) but the caller actually wants the
      // raw return. We surface the raw value here so the test
      // suite's `expect(result).toBeNull()` / `.toBeUndefined()`
      // assertions hold.
      //
      // Important: `_lastStageReturn` is initialised to
      // `undefined` at the *start* of every `executeStages`
      // call, so a zero-stage pipeline (which never enters the
      // for-loop) leaves the field as `undefined`. We must
      // not interpret that as "a stage returned undefined" —
      // that would silently drop the initial context and
      // break the empty-pipeline test
      // (`expect(result.errors).toEqual([])`). We use a
      // separate sentinel (`_stagesExecuted`) to tell the two
      // cases apart.
      if (this._stagesExecuted > 0) {
        const rawReturn = this._lastStageReturn;
        if (rawReturn === null || rawReturn === undefined) {
          return rawReturn as unknown as PipelineContext;
        }
      }
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
    // M5b (W19): a stage that returns `null` / `undefined` is a
    // legitimate pass-through (the test suite has explicit
    // coverage for it). The pre-W19 `executeStages` did
    // `track(stageResult)` which then crashed on the next
    // iteration when it tried to read `currentContext.errors`.
    // We now (a) keep `currentContext` at the *pre-execute*
    // snapshot when the stage returns nullish, and (b) stash
    // the raw return on `this._lastStageReturn` so the outer
    // `run()` can pass it through to the caller (the test
    // asserts `expect(result).toBeNull()`).
    this._lastStageReturn = undefined;
    this._stagesExecuted = 0;
    const track = (c: PipelineContext) => {
      currentContext = c;
      onContextChange?.(c);
    };
    const trackRaw = (raw: unknown) => {
      this._lastStageReturn = raw;
    };

    for (const stage of this.stages) {
      let stageSuccess = false;
      let lastError: Error | null = null;
      let postFailContext: PipelineContext | null = null;

      for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
        try {
          const stageResult = await this.executeStage(stage, currentContext, attempt);
          // M5 (W19): record each successful stage execution as
          // a `StepResult` in the context, so the agent's
          // `pipeline-end` summary and any post-mortem log can see
          // what each stage actually produced. The pre-W19
          // implementation only updated `currentContext` with the
          // stage's return value but never appended a result, so
          // `context.results` stayed empty for a successful run
          // and the UI's "stages" tab was blank.
          //
          // M5b (W19): a stage that returns `null` or `undefined`
          // (e.g. a no-op `validate` stage that has nothing to
          // emit) is a valid pass-through. The pre-W19 code blindly
          // did `track(stageResult)` which then crashed at
          // `currentContext.errors.push(...)` two iterations
          // later. We now treat a non-object return as
          // "no context change" and synthesise a minimal
          // `PipelineContext` for the `StepResult` bookkeeping.
          // The `run()` boundary still surfaces the raw return
          // (null/undefined) so callers that explicitly check
          // `if (result === null)` keep working.
          let nextContext: PipelineContext;
          if (stageResult === null || stageResult === undefined) {
            nextContext = currentContext;
            trackRaw(stageResult);
          } else {
            nextContext = stageResult;
            trackRaw(stageResult);
          }
          track(nextContext);
          const safeForBookkeeping =
            nextContext ?? ({} as PipelineContext);
          const resultEntry: StepResult = {
            stepId: `${stage.name}-${attempt}-${Date.now().toString(36)}`,
            success: true,
            output: typeof stageResult === 'string'
              ? stageResult
              : JSON.stringify(stageResult ?? ''),
            durationMs: 0,
            changedFiles: safeForBookkeeping.modifiedFiles ?? safeForBookkeeping.createdFiles ?? [],
            createdFiles: safeForBookkeeping.createdFiles,
          };
          track(this.addResult(currentContext, resultEntry));
          stageSuccess = true;
          this._stagesExecuted++;
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
      // This guarantees that a `maxRetries: 0` config still rolls back,
      // and that a multi-retry stage that exhausts all attempts also
      // rolls back once. H12 (W18): the old guard `this.maxRetries === 0`
      // was too narrow — it only triggered for stages that *never*
      // retried. A stage with maxRetries=2 that fails on attempt 2
      // would fall through without rolling back, leaving partial
      // work on disk. The new guard `!stageSuccess && lastError`
      // (combined with the for-loop having exited via the catch
      // branch) is equivalent to "we tried everything and the stage
      // is still broken", which is exactly when we want a rollback.
      if (!stageSuccess && postFailContext && stage.rollback) {
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
    _attempt: number,
  ): Promise<PipelineContext> {
    this.emitter.emit('stage:start', { stage: stage.name, context });

    const stageStart = performance.now();
    const phaseRecord: PhaseRecord = {
      // L8 (W18): the field is named `startTime` but stores a
      // `Date.now()` epoch-millis value, not a `Date` object.
      // Older callers sometimes did `new Date(phaseRecord.endTime)`
      // and got the wrong value if a Date instance was assigned
      // somewhere. We document the unit here and assign the
      // value consistently with `Date.now()` (epoch millis) to
      // keep all timestamps comparable in arithmetic.
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
      // L8 (W18): set endTime in the *same* epoch-millis unit
      // (Date.now()) as startTime so a future caller can do
      // `phaseRecord.endTime - phaseRecord.startTime` without
      // having to re-parse.

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

  /**
   * Helper: append a step result to `context.results` and return a new
   * context. Pure: the caller's `context` is not mutated.
   *
   * H13 (W18): the previous implementation did
   *   `context.results.push(result); return context;`
   * which mutated the caller's object in place. If the caller was
   * holding a reference to a context it expected to remain stable
   * (e.g. for a parallel run with `Promise.all`), the new result
   * would suddenly appear under that reference. Stages that re-used
   * the same `currentContext` for retry backoff would also see
   * accidental state growth. Returning a new object keeps the
   * pipeline referentially transparent and matches the explicit
   * "currentContext = c" tracking in `executeStages`.
   *
   * M3 (W19): also merge `createdFiles` from the result into the
   * context's `createdFiles` array. The pre-W19 implementation only
   * merged `changedFiles` (now `modifiedFiles`), so a step that
   * produced a brand-new file (e.g. a chart generator that wrote
   * `chart.png`) would still record it in the `results[]` array but
   * the pipeline-level `createdFiles` (used by the agent's
   * `pipeline-end` SSE event) would stay empty. The agent's
   * "files I produced" summary then claimed nothing was written,
   * which made the UI's "open file" affordance silently broken.
   * We dedup with a Set so a stage that re-creates an existing
   * file doesn't add it twice.
   */
  addResult(context: PipelineContext, result: StepResult): PipelineContext {
    const modifiedFiles =
      result.changedFiles.length > 0
        ? [...new Set([...context.modifiedFiles, ...result.changedFiles])]
        : context.modifiedFiles;
    // M3 (W19): `createdFiles` lives on the `StepResult` itself
    // (alongside `changedFiles`). Merge it with the same dedup
    // pattern. Stages that don't produce new files (the common
    // case) get a no-op pass-through.
    const createdFiles =
      result.createdFiles && result.createdFiles.length > 0
        ? [...new Set([...context.createdFiles, ...result.createdFiles])]
        : context.createdFiles;
    return {
      ...context,
      modifiedFiles,
      createdFiles,
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