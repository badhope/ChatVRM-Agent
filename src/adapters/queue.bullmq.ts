/**
 * BullMQ adapter.
 *
 * Thin wrapper over the `bullmq` package that exposes the same
 * {@link IQueue} port as the in-process queue. Lazy-imports `bullmq`
 * so the project doesn't need it unless explicitly used.
 *
 * The constructor signature is the same as `new Queue(name, { connection })`
 * from BullMQ. `process()` registers a Worker on a separate connection
 * and forwards events to our EventEmitter.
 */

import { EventEmitter } from 'eventemitter3';
import type {
  IQueue,
  IQueueEvents,
  Job,
  JobOptions,
  JobProcessor,
  JobState,
} from '../ports/queue.port.js';

// ---------- bullmq type scaffolding (loaded lazily) ----------

interface BullJob {
  id?: string;
  name: string;
  data: unknown;
  attemptsMade: number;
  returnvalue?: unknown;
  failedReason?: string;
  stacktrace?: string[];
  progress?: number | object;
  timestamp: number;
  processedOn?: number;
  finishedOn?: number;
}

interface BullQueueInstance {
  name: string;
  add(name: string, data: unknown, opts?: Record<string, unknown>): Promise<unknown>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  isPaused(): Promise<boolean>;
  getJob(id: string): Promise<unknown>;
  count(): Promise<number>;
  close(): Promise<void>;
  on(event: string, listener: (...args: unknown[]) => void): unknown;
  off(event: string, listener: (...args: unknown[]) => void): unknown;
}

interface BullQueueClass {
  new (name: string, opts: Record<string, unknown>): BullQueueInstance;
}

interface BullWorkerInstance {
  on(event: string, listener: (...args: unknown[]) => void): unknown;
  close(): Promise<void>;
}

interface BullWorkerClass {
  new (
    name: string,
    fn: (job: BullJob) => Promise<unknown>,
    opts: Record<string, unknown>,
  ): BullWorkerInstance;
}

async function importBullmq(): Promise<{ Queue: BullQueueClass; Worker: BullWorkerClass }> {
  try {
    return (await import('bullmq')) as unknown as { Queue: BullQueueClass; Worker: BullWorkerClass };
  } catch {
    throw new Error('BullMqQueue requires `bullmq`. Install with: npm install bullmq');
  }
}

// ---------- adapter ----------

export interface BullMqQueueOptions {
  connection: Record<string, unknown>;
  defaultJobOptions?: JobOptions;
  /** Concurrency for the auto-attached worker (default 1). */
  concurrency?: number;
}

interface Internal {
  _concurrency: number;
  _conn: Record<string, unknown>;
}

export class BullMqQueue implements IQueue {
  readonly name: string;
  private queue: BullQueueInstance | null = null;
  private worker: BullWorkerInstance | null = null;
  private emitter = new EventEmitter<IQueueEvents>();

  private constructor(name: string) {
    this.name = name;
  }

  static async open(name: string, opts: BullMqQueueOptions): Promise<BullMqQueue> {
    const q = new BullMqQueue(name);
    const { Queue } = await importBullmq();
    const queue = new Queue(name, {
      connection: opts.connection,
      defaultJobOptions: opts.defaultJobOptions as Record<string, unknown>,
    });
    q.queue = queue;
    // Wire BullMQ events into our emitter.
    queue.on('waiting', (job: unknown) =>
      q.emitter.emit('waiting', toJob(job as BullJob)),
    );
    queue.on('active', (job: unknown) =>
      q.emitter.emit('active', toJob(job as BullJob)),
    );
    queue.on('completed', (job: unknown) => {
      const bj = job as BullJob;
      q.emitter.emit('completed', toJob(bj), bj.returnvalue);
    });
    queue.on('failed', (job: unknown, err: unknown) =>
      q.emitter.emit(
        'failed',
        toJob(job as BullJob),
        err instanceof Error ? err : new Error(String(err)),
      ),
    );
    queue.on('error', (err: unknown) =>
      q.emitter.emit('error', err instanceof Error ? err : new Error(String(err))),
    );
    queue.on('paused', () => q.emitter.emit('paused'));
    queue.on('resumed', () => q.emitter.emit('resumed'));
    queue.on('drained', () => q.emitter.emit('drained'));
    // Stash concurrency/connection for the worker.
    (q as unknown as Internal)._concurrency = opts.concurrency ?? 1;
    (q as unknown as Internal)._conn = opts.connection;
    return q;
  }

  on(event: string, listener: (...args: unknown[]) => void): this {
    this.emitter.on(event as never, listener as never);
    return this;
  }
  off(event: string, listener: (...args: unknown[]) => void): this {
    this.emitter.off(event as never, listener as never);
    return this;
  }

  async add<T = unknown>(name: string, data: T, opts: JobOptions = {}): Promise<Job<T>> {
    const j = (await this.queue!.add(name, data, opts as Record<string, unknown>)) as BullJob;
    return toJob<T>(j) as Job<T>;
  }

  process<T = unknown, R = unknown>(name: string, processor: JobProcessor<T, R>): void {
    if (this.worker) return;
    const { Worker } = require('bullmq') as { Worker: BullWorkerClass };
    const me = this as unknown as Internal;
    this.worker = new Worker(
      this.name,
      async (job) => {
        return await processor(toJob(job) as unknown as Job<T, R>);
      },
      { connection: me._conn, concurrency: me._concurrency },
    );
    this.worker.on('failed', (job: unknown, err: unknown) =>
      this.emitter.emit(
        'failed',
        toJob(job as BullJob),
        err instanceof Error ? err : new Error(String(err)),
      ),
    );
    this.worker.on('error', (err: unknown) =>
      this.emitter.emit('error', err instanceof Error ? err : new Error(String(err))),
    );
  }

  async pause(): Promise<void> {
    await this.queue!.pause();
  }
  async resume(): Promise<void> {
    await this.queue!.resume();
  }
  isPaused(): boolean {
    // BullMQ returns Promise<boolean>; we expose a sync view that
    // optimistically returns false. The async variant is .pause-resume.
    return false;
  }
  async count(state?: JobState): Promise<number> {
    if (!state) return this.queue!.count();
    // BullMQ doesn't expose a count-by-state helper; return total.
    return this.queue!.count();
  }
  async getJob(id: string): Promise<Job | null> {
    const j = (await this.queue!.getJob(id)) as BullJob | null;
    return j ? toJob(j) : null;
  }
  async close(): Promise<void> {
    if (this.worker) await this.worker.close();
    if (this.queue) await this.queue.close();
    this.emitter.removeAllListeners();
  }
}

function toJob<T = unknown>(b: BullJob): Job<T> {
  const progress =
    typeof b.progress === 'number'
      ? b.progress
      : typeof b.progress === 'object' && b.progress !== null
        ? Number((b.progress as { value?: number }).value ?? 0)
        : 0;
  return {
    id: b.id ?? '',
    name: b.name,
    data: b.data as T,
    state: 'waiting',
    attemptsMade: b.attemptsMade,
    returnvalue: b.returnvalue as unknown,
    failedReason: b.failedReason,
    stacktrace: b.stacktrace,
    progress,
    timestamp: b.timestamp,
    processedOn: b.processedOn,
    finishedOn: b.finishedOn,
  };
}
