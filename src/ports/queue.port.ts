/**
 * Async job queue port.
 *
 * A small, BullMQ-compatible abstraction for background work. Two
 * implementations:
 *   - {@link InProcessQueue}:    in-memory, default, no Redis needed
 *   - {@link BullMqQueue}:       thin wrapper over `bullmq` (lazy
 *                                import; opt-in via npm install)
 *
 * Both speak the same {@link IQueue} port so the agent can move from
 * local dev to distributed prod with a one-line config change.
 *
 * Job lifecycle:
 *   waiting → active → completed
 *                  ↘  failed → (retried?) → waiting / failed
 *
 * Features mirrored from BullMQ:
 *   - named jobs with arbitrary JSON payload
 *   - per-name processor functions
 *   - concurrency
 *   - retry with exponential backoff (`attempts`, `backoff`)
 *   - delayed jobs (`startAfter`)
 *   - events: waiting, active, completed, failed, progress
 *   - pause / resume
 */

import type { EventEmitter } from 'eventemitter3';

export type JobState = 'waiting' | 'active' | 'completed' | 'failed' | 'delayed' | 'paused';

export interface JobOptions {
  /** Max attempts (default 1 = no retry). */
  attempts?: number;
  /** Backoff in ms, or a function returning ms based on attempt + err. */
  backoff?: number | ((attemptsMade: number, err: Error) => number);
  /** Run no earlier than this ms timestamp. */
  startAfter?: number;
  /** Job priority (lower = earlier). */
  priority?: number;
  /** Optional dedupe key — same key re-adding replaces the pending job. */
  jobId?: string;
}

export interface Job<T = unknown, R = unknown> {
  id: string;
  name: string;
  data: T;
  state: JobState;
  attemptsMade: number;
  /** Set once the job finishes. */
  returnvalue?: R;
  /** Set on terminal failure. */
  failedReason?: string;
  /** Stack trace of the last failure. */
  stacktrace?: string[];
  progress: number;
  timestamp: number;
  processedOn?: number;
  finishedOn?: number;
}

export interface JobProcessor<T = unknown, R = unknown> {
  (job: Job<T, R>): Promise<R> | R;
}

export interface IQueueEvents {
  waiting: (job: Job) => void;
  active: (job: Job) => void;
  completed: (job: Job, result: unknown) => void;
  failed: (job: Job, err: Error) => void;
  progress: (job: Job, progress: number) => void;
  error: (err: Error) => void;
  drained: () => void;
  paused: () => void;
  resumed: () => void;
}

export interface IQueue {
  readonly name: string;
  on(event: string, listener: (...args: unknown[]) => void): this;
  off(event: string, listener: (...args: unknown[]) => void): this;
  add<T = unknown>(name: string, data: T, opts?: JobOptions): Promise<Job<T>>;
  process<T = unknown, R = unknown>(name: string, processor: JobProcessor<T, R>): void;
  pause(): Promise<void>;
  resume(): Promise<void>;
  isPaused(): boolean;
  /** Number of jobs in the given state (default all). */
  count(state?: JobState): Promise<number>;
  getJob(id: string): Promise<Job | null>;
  close(): Promise<void>;
}

export type { EventEmitter };
