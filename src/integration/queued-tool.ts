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
   * Synchronous portion: enqueue a job and return some jobId. The
   * `data` payload is what the worker receives.
   */
  enqueue: (args: TArgs) => Promise<{ jobId: string; data: unknown }>;
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
  timer: ReturnType<typeof setTimeout> | null;
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
  private readonly opts: QueuedToolOptions<TArgs, TResult>;
  private readonly waiters = new Map<string, PendingWaiter>();
  private readonly bridge: EventEmitter;
  private bound = false;

  constructor(opts: QueuedToolOptions<TArgs, TResult>, bridge: EventEmitter = new EventEmitter()) {
    this.opts = opts;
    this.name = opts.name;
    this.description = opts.description;
    this.bridge = bridge;
    this.bindWorker();
  }

  private bindWorker(): void {
    if (this.bound) return;
    const proc = this.opts.processor;
    this.opts.queue.process(`${this.name}.worker`, async (j: Job) => {
      const r = await proc(j as unknown as Parameters<typeof proc>[0]);
      this.bridge.emit('done', { id: j.id, value: r });
      return r;
    });
    this.bridge.on('done', ({ id, value }) => {
      const w = this.waiters.get(id);
      if (w) {
        if (w.timer) clearTimeout(w.timer);
        this.waiters.delete(id);
        w.resolve(value);
      }
    });
    this.bound = true;
  }

  /** Fire-and-forget. Returns the ticket id immediately. */
  async run(args: TArgs): Promise<ToolResult> {
    const { jobId } = await this.opts.enqueue(args);
    return { success: true, output: JSON.stringify({ ticketId: jobId, status: 'queued' }) };
  }

  /** Enqueue and wait for completion. */
  async runAndWait(args: TArgs, options: RunAndWaitOptions = {}): Promise<ToolResult> {
    const { jobId } = await this.opts.enqueue(args);
    const timeoutMs = options.timeoutMs ?? this.opts.defaultTimeoutMs ?? 60_000;
    return new Promise<ToolResult>((resolve, reject) => {
      const w: PendingWaiter = { resolve: () => {}, reject: () => {}, timer: null };
      const onAbort = () => {
        if (w.timer) clearTimeout(w.timer);
        this.waiters.delete(jobId);
        reject(new Error(`QueuedTool: aborted waiting for ${jobId}`));
      };
      if (options.signal) {
        if (options.signal.aborted) return onAbort();
        options.signal.addEventListener('abort', onAbort, { once: true });
      }
      w.timer = setTimeout(() => {
        this.waiters.delete(jobId);
        if (options.signal) options.signal.removeEventListener('abort', onAbort);
        reject(new Error(`QueuedTool: timed out after ${timeoutMs}ms waiting for ${jobId}`));
      }, timeoutMs);
      w.resolve = (v) => {
        if (options.signal) options.signal.removeEventListener('abort', onAbort);
        resolve({ success: true, output: typeof v === 'string' ? v : JSON.stringify(v) });
      };
      w.reject = (e) => {
        if (options.signal) options.signal.removeEventListener('abort', onAbort);
        resolve({ success: false, error: e.message });
      };
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
