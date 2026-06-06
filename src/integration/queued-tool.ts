/**
 * Queue integration for long-running tools.
 *
 * When a tool's handler is too slow to run synchronously inside a
 * ReAct step (e.g. a big summarisation, a multi-step workflow that
 * must survive a server restart, a notification blast to N users),
 * you can wrap it in a {@link QueuedTool}. The handler enqueues a
 * job and immediately returns a ticket id; a separate consumer (a
 * Worker process, a cron, a CI step) drains the queue and writes the
 * final output back somewhere the agent can read.
 *
 * Pattern A — fire-and-forget (most common):
 *   const summarise = new QueuedTool({
 *     name: 'summarise_session',
 *     description: 'Summarise a long session asynchronously.',
 *     queue,
 *     handler: async ({ sessionId }) => ({ jobId: await queue.add('summarise', { sessionId }) }),
 *   });
 *
 * Pattern B — wait for the result (with a timeout):
 *   const r = await queuedTool.runAndWait(args, { timeoutMs: 30_000 });
 *
 * The bridge automatically tracks the in-flight job id and, when
 * the consumer emits `completed`, looks up the return value and
 * resolves the in-flight promise.
 */

import type { ToolDefinition, ToolResult } from '../ports/tools.port.js';
import type { IQueue, Job, JobProcessor } from '../ports/queue.port.js';
import { EventEmitter } from 'eventemitter3';

export interface QueuedToolOptions<TArgs = unknown, TResult = unknown> {
  name: string;
  description: string;
  queue: IQueue;
  /**
   * Queue job name. The processor is registered with the same name
   * so the queue can route jobs to it. Defaults to `name`.
   */
  jobName?: string;
  /**
   * Synchronous portion: enqueue a job and return some jobId. The
   * bridge passes its own `jobName` as the second argument so the
   * enqueue name and the processor name always match — the queue
   * won't pick up a job whose name has no registered processor.
   */
  enqueue: (args: TArgs, jobName: string) => Promise<{ jobId: string; data: unknown }>;
  /**
   * Worker-side handler. The bridge registers this with the queue
   * on construction.
   */
  processor: JobProcessor<unknown, TResult>;
  /** Optional timeout for {@link runAndWait}. Default 60s. */
  defaultTimeoutMs?: number;
  inputSchema?: unknown;
  metadata?: Record<string, unknown>;
}

export interface RunAndWaitOptions {
  timeoutMs?: number;
  signal?: AbortSignal;
}

interface PendingWaiter {
  resolve(v: unknown): void;
  reject(e: Error): void;
  // H6 (W19) / M5 (W19): distinct from `reject`, a `fail` settlement
  // turns a worker error into a `{ success: false, error }` result
  // instead of a real rejected promise. The integration test
  // contract distinguishes "system failure" (timeout, abort — reject)
  // from "worker failure" (processor throws — failed ToolResult),
  // and a single `reject` callback can't satisfy both.
  fail(e: Error): void;
  timer: ReturnType<typeof setTimeout> | null;
  /** H6 (W19): single-shot guard for the waiter so concurrent
   *  timer/abort/done callbacks can only settle the promise once. */
  settled: boolean;
}

/**
 * A tool whose handler runs as a background job. The handler returns
 * a "ticket" immediately and either resolves synchronously (if the
 * queue runs in-process and the job finishes within the timeout) or
 * later (via `runAndWait`).
 */
export class QueuedTool<TArgs = unknown, TResult = unknown> {
  readonly name: string;
  readonly description: string;
  readonly jobName: string;
  private readonly opts: QueuedToolOptions<TArgs, TResult>;
  private readonly waiters = new Map<string, PendingWaiter>();
  private readonly bridge: EventEmitter;
  private bound = false;

  constructor(opts: QueuedToolOptions<TArgs, TResult>, bridge: EventEmitter = new EventEmitter()) {
    this.opts = opts;
    this.name = opts.name;
    this.description = opts.description;
    this.jobName = opts.jobName ?? opts.name;
    this.bridge = bridge;
    this.bindWorker();
  }

  /**
   * Register the worker processor with the queue. Called automatically
   * from the constructor; exposed publicly so tests can re-bind or
   * late-bind against a different queue.
   */
  bindWorker(): void {
    if (this.bound) return;
    const proc = this.opts.processor;
    this.opts.queue.process(this.jobName, async (j: Job) => {
      try {
        const r = await proc(j as unknown as Parameters<typeof proc>[0]);
        this.bridge.emit('done', { id: j.id, value: r });
        return r;
      } catch (err) {
        // Surface the actual error to runAndWait callers instead of
        // letting the queue swallow it and the caller time out.
        const error = err instanceof Error ? err : new Error(String(err));
        this.bridge.emit('done', { id: j.id, error });
        throw error;
      }
    });
    this.bridge.on('done', (payload) => {
      const p = payload as { id: string; value?: unknown; error?: Error };
      const w = this.waiters.get(p.id);
      if (w) {
        if (w.timer) clearTimeout(w.timer);
        this.waiters.delete(p.id);
        if (p.error) w.fail(p.error);
        else w.resolve(p.value);
      } else {
        // `done` arrived for a job no one is waiting on — either a
        // fire-and-forget that finished, or a waiter that already
        // timed out and was removed. Surface the late event so we
        // don't silently swallow completions.
        this.bridge.emit('late-done', p);
      }
    });
    this.bound = true;
  }

  /**
   * Detach the `done` listener and clear pending waiters. Call this
   * in long-lived processes when the queued tool is no longer
   * needed; otherwise the listener chain (and any retained
   * closures) keeps the tool alive.
   */
  destroy(): void {
    if (!this.bound) return;
    this.bridge.removeAllListeners('done');
    for (const [, w] of this.waiters) {
      if (w.timer) clearTimeout(w.timer);
      w.reject(new Error('QueuedTool: destroyed'));
    }
    this.waiters.clear();
    this.bound = false;
  }

  /** Fire-and-forget. Returns the ticket id immediately. */
  async run(args: TArgs): Promise<ToolResult> {
    const { jobId } = await this.opts.enqueue(args, this.jobName);
    return { success: true, output: JSON.stringify({ ticketId: jobId, status: 'queued' }) };
  }

  /** Enqueue and wait for completion. */
  async runAndWait(args: TArgs, options: RunAndWaitOptions = {}): Promise<ToolResult> {
    const { jobId } = await this.opts.enqueue(args, this.jobName);
    const timeoutMs = options.timeoutMs ?? this.opts.defaultTimeoutMs ?? 60_000;
    return new Promise<ToolResult>((resolve, reject) => {
      // H6 (W19): all three settlement paths (timer / abort / done
      // event) route through a single `finish` helper guarded by a
      // `settled` flag. Without the guard, a `done` event and a
      // timer expiry that both fire within the same microtask could
      // race: the worker callback would `w.resolve` and then the
      // timer's `reject` would run, leaving the outer promise
      // in an inconsistent state. The flag makes the second call
      // a no-op.
      const w: PendingWaiter = {
        resolve: () => {},
        reject: () => {},
        fail: () => {},
        timer: null,
        settled: false,
      };
      const finish = (kind: 'resolve' | 'reject' | 'fail', value?: unknown) => {
        if (w.settled) return;
        w.settled = true;
        if (w.timer) {
          clearTimeout(w.timer);
          w.timer = null;
        }
        if (options.signal) options.signal.removeEventListener('abort', onAbort);
        this.waiters.delete(jobId);
        // H6 (W19) / M5 (W19): three terminal kinds, not two.
        //
        //   resolve: the worker returned a value. Wrap as
        //            `{ success: true, output }`.
        //   reject:  a *system* failure that is the caller's fault
        //            (timeout, abort). Surface as a real rejected
        //            promise so the caller can `try { ... } catch
        //            (e) { /* user-visible error */ }`. The
        //            queued-tool.integration.test.ts contract
        //            ("rejects toThrow /timed out/") requires this.
        //   fail:    a *worker* failure (processor threw, queue
        //            report error). Surface as a successful
        //            ToolResult with `success: false` so callers
        //            can pattern-match on `success` without a
        //            try/catch. The w13-audit-fixes contract
        //            ("resolves with a failed ToolResult when the
        //            processor throws") requires this.
        if (kind === 'resolve') {
          resolve({ success: true, output: typeof value === 'string' ? value : JSON.stringify(value) });
        } else if (kind === 'fail') {
          const msg = value instanceof Error ? value.message : String(value);
          resolve({ success: false, output: '', error: msg });
        } else {
          reject(value instanceof Error ? value : new Error(String(value)));
        }
      };
      const onAbort = () => finish('reject', new Error(`QueuedTool: aborted waiting for ${jobId}`));
      if (options.signal) {
        if (options.signal.aborted) return onAbort();
        options.signal.addEventListener('abort', onAbort, { once: true });
      }
      w.timer = setTimeout(() => {
        finish('reject', new Error(`QueuedTool: timed out after ${timeoutMs}ms waiting for ${jobId}`));
      }, timeoutMs);
      w.resolve = (v) => finish('resolve', v);
      w.reject = (e) => finish('reject', e);
      w.fail = (e) => finish('fail', e);
      this.waiters.set(jobId, w);
    });
  }

  toToolDefinition(): ToolDefinition {
    return {
      name: this.name,
      description: this.description,
      inputSchema: (this.opts.inputSchema ?? { type: 'object', properties: {} }) as Record<string, unknown>,
      metadata: { kind: 'queued', ...(this.opts.metadata ?? {}) },
      handler: async (args) => this.run(args as TArgs),
    };
  }

  get tool(): ToolDefinition {
    return this.toToolDefinition();
  }
}
