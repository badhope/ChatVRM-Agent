/**
 * In-process job queue.
 *
 * Default {@link IQueue} implementation. No Redis, no external
 * dependencies. Supports the same operations as the BullMQ port:
 *   - named processors with concurrency
 *   - retry with exponential / custom backoff
 *   - delayed jobs
 *   - job progress, completion, failure events
 *   - pause / resume
 *
 * Implementation notes:
 *   - jobs are stored in plain Maps indexed by id
 *   - waiting + delayed are kept in two priority-sorted arrays
 *   - a `pump()` loop drains waiting into a concurrency-limited
 *     worker pool and emits events on the queue's EventEmitter
 *
 * For distributed work, replace this with {@link BullMqQueue}.
 */

import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'eventemitter3';
import type {
  IQueue,
  IQueueEvents,
  Job,
  JobOptions,
  JobProcessor,
  JobState,
} from '../ports/queue.port.js';

interface InternalJob extends Job {
  opts: Required<Pick<JobOptions, 'attempts' | 'backoff' | 'priority'>> & JobOptions;
  name: string;
}

export interface InProcessQueueOptions {
  /** Default concurrency per process() registration. Default 1. */
  defaultConcurrency?: number;
  /** Max jobs the queue keeps in memory (oldest completed jobs get evicted). Default 1000. */
  maxRetained?: number;
}

export class InProcessQueue implements IQueue {
  readonly name: string;
  private readonly emitter = new EventEmitter<IQueueEvents>();
  private readonly jobs = new Map<string, InternalJob>();
  private readonly waiting: InternalJob[] = [];
  private readonly delayed: Array<{ job: InternalJob; runAt: number }> = [];
  private readonly processors = new Map<string, { fn: JobProcessor; concurrency: number; inFlight: number }>();
  private readonly defaultConcurrency: number;
  private readonly maxRetained: number;
  private paused = false;
  private closed = false;
  private pumping = false;
  private delayedTimer: ReturnType<typeof setInterval> | null = null;

  constructor(name: string, opts: InProcessQueueOptions = {}) {
    this.name = name;
    this.defaultConcurrency = opts.defaultConcurrency ?? 1;
    this.maxRetained = opts.maxRetained ?? 1000;
    this.delayedTimer = setInterval(() => this.promoteDue(), 200);
    if (typeof this.delayedTimer.unref === 'function') this.delayedTimer.unref();
  }

  on<K extends keyof IQueueEvents>(event: K, listener: IQueueEvents[K]): void {
    this.emitter.on(event, listener);
  }
  off<K extends keyof IQueueEvents>(event: K, listener: IQueueEvents[K]): void {
    this.emitter.off(event, listener);
  }

  async add<T = unknown>(name: string, data: T, opts: JobOptions = {}): Promise<Job<T>> {
    if (this.closed) throw new Error('InProcessQueue: closed');
    if (this.processors.has(name) === false && opts.jobId === undefined) {
      // No processor registered yet, but we still allow adding — common
      // for "produce now, register consumer later" patterns.
    }
    const id = opts.jobId ?? randomUUID();
    const existing = this.jobs.get(id);
    if (existing && (existing.state === 'waiting' || existing.state === 'delayed')) {
      existing.data = data;
      existing.opts = this.normaliseOpts(opts);
      return this.cloneJob(existing);
    }
    const job: InternalJob = {
      id,
      name,
      data,
      state: opts.startAfter ? 'delayed' : 'waiting',
      attemptsMade: 0,
      progress: 0,
      timestamp: Date.now(),
      opts: this.normaliseOpts(opts),
    };
    this.jobs.set(id, job);
    if (opts.startAfter) {
      this.delayed.push({ job, runAt: opts.startAfter });
    } else {
      this.enqueueWaiting(job);
    }
    this.schedulePump();
    this.emitter.emit('waiting', this.cloneJob(job));
    return this.cloneJob(job);
  }

  private normaliseOpts(opts: JobOptions): Required<Pick<JobOptions, 'attempts' | 'backoff' | 'priority'>> & JobOptions {
    return {
      attempts: opts.attempts ?? 1,
      backoff: opts.backoff ?? 0,
      priority: opts.priority ?? 0,
      ...opts,
    };
  }

  process<T = unknown, R = unknown>(name: string, processor: JobProcessor<T, R>): void {
    this.processors.set(name, {
      fn: processor as JobProcessor,
      concurrency: this.defaultConcurrency,
      inFlight: 0,
    });
    this.schedulePump();
  }

  private enqueueWaiting(job: InternalJob): void {
    // Insertion-sort by priority (lower first) then by timestamp.
    const key = (j: InternalJob) => j.opts.priority * 1e13 + j.timestamp;
    let i = this.waiting.length;
    while (i > 0 && key(this.waiting[i - 1]) > key(job)) i--;
    this.waiting.splice(i, 0, job);
  }

  private promoteDue(): void {
    if (this.closed) return;
    const now = Date.now();
    const remaining: typeof this.delayed = [];
    let promoted = 0;
    for (const entry of this.delayed) {
      if (entry.runAt <= now) {
        entry.job.state = 'waiting';
        this.enqueueWaiting(entry.job);
        this.emitter.emit('waiting', this.cloneJob(entry.job));
        promoted++;
      } else {
        remaining.push(entry);
      }
    }
    this.delayed.length = 0;
    this.delayed.push(...remaining);
    if (promoted > 0) this.schedulePump();
  }

  private schedulePump(): void {
    if (this.pumping || this.paused || this.closed) return;
    this.pumping = true;
    setImmediate(() => this.pump());
  }

  private async pump(): Promise<void> {
    try {
      while (!this.closed && !this.paused && this.waiting.length > 0) {
        // Find the next job whose processor has spare concurrency.
        const idx = this.waiting.findIndex((j) => {
          const p = this.processors.get(j.name);
          return p !== undefined && p.inFlight < p.concurrency;
        });
        if (idx === -1) break;
        const job = this.waiting.splice(idx, 1)[0];
        const proc = this.processors.get(job.name)!;
        proc.inFlight++;
        void this.runJob(job, proc).finally(() => {
          proc.inFlight--;
          this.schedulePump();
        });
      }
      if (this.waiting.length === 0 && this.delayed.length === 0) {
        this.emitter.emit('drained');
      }
    } finally {
      this.pumping = false;
    }
  }

  private async runJob(job: InternalJob, proc: { fn: JobProcessor; concurrency: number; inFlight: number }): Promise<void> {
    job.state = 'active';
    job.attemptsMade++;
    job.processedOn = Date.now();
    this.emitter.emit('active', this.cloneJob(job));
    try {
      const result = await proc.fn(this.cloneJob(job));
      job.state = 'completed';
      job.returnvalue = result;
      job.finishedOn = Date.now();
      this.emitter.emit('completed', this.cloneJob(job), result);
      this.evictIfFull();
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      job.stacktrace = job.stacktrace ?? [];
      job.stacktrace.push(error.stack ?? error.message);
      if (job.attemptsMade < (job.opts.attempts ?? 1)) {
        // Retry: schedule with backoff.
        const wait = this.computeBackoff(job, error);
        job.state = 'delayed';
        const runAt = Date.now() + wait;
        this.delayed.push({ job, runAt });
      } else {
        job.state = 'failed';
        job.failedReason = error.message;
        job.finishedOn = Date.now();
        this.emitter.emit('failed', this.cloneJob(job), error);
      }
    }
  }

  private computeBackoff(job: InternalJob, err: Error): number {
    const b = job.opts.backoff;
    if (typeof b === 'function') return Math.max(0, b(job.attemptsMade, err));
    if (typeof b === 'number') {
      // exponential: b * 2^(attemptsMade-1)
      return Math.max(0, b * Math.pow(2, job.attemptsMade - 1));
    }
    return 0;
  }

  private evictIfFull(): void {
    if (this.jobs.size <= this.maxRetained) return;
    const completed: InternalJob[] = [];
    for (const j of this.jobs.values()) {
      if (j.state === 'completed' || j.state === 'failed') completed.push(j);
    }
    completed.sort((a, b) => (a.finishedOn ?? 0) - (b.finishedOn ?? 0));
    while (this.jobs.size > this.maxRetained && completed.length > 0) {
      const j = completed.shift()!;
      this.jobs.delete(j.id);
    }
  }

  async pause(): Promise<void> {
    this.paused = true;
    this.emitter.emit('paused');
  }
  async resume(): Promise<void> {
    if (!this.paused) return;
    this.paused = false;
    this.emitter.emit('resumed');
    this.schedulePump();
  }
  isPaused(): boolean {
    return this.paused;
  }

  async count(state?: JobState): Promise<number> {
    if (!state) return this.jobs.size;
    let n = 0;
    for (const j of this.jobs.values()) if (j.state === state) n++;
    return n;
  }

  async getJob(id: string): Promise<Job | null> {
    const j = this.jobs.get(id);
    return j ? this.cloneJob(j) : null;
  }

  private cloneJob(j: InternalJob): Job {
    return {
      id: j.id,
      name: j.name,
      data: j.data,
      state: j.state,
      attemptsMade: j.attemptsMade,
      returnvalue: j.returnvalue,
      failedReason: j.failedReason,
      stacktrace: j.stacktrace,
      progress: j.progress,
      timestamp: j.timestamp,
      processedOn: j.processedOn,
      finishedOn: j.finishedOn,
    };
  }

  async close(): Promise<void> {
    this.closed = true;
    if (this.delayedTimer) {
      clearInterval(this.delayedTimer);
      this.delayedTimer = null;
    }
    this.processors.clear();
    this.waiting.length = 0;
    this.delayed.length = 0;
    this.jobs.clear();
    this.emitter.removeAllListeners();
  }
}
