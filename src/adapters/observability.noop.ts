/**
 * No-op observability.
 *
 * Used by default in tests and in environments without a tracing
 * backend. The {@link IObservation} handle is real (so callers don't
 * need null checks) but every method is a near-zero-cost no-op.
 *
 * In `recordMode`, the no-op also captures all traces into an in-memory
 * ring buffer, useful for asserting trace structure in unit tests.
 */

import type {
  IObservability,
  IObservation,
  ObservationLevel,
} from '../ports/observability.port.js';

export interface NoopObservationOptions {
  recordMode?: boolean;
  ringBufferSize?: number;
}

export class NoopObservation implements IObservation {
  readonly name: string;
  readonly kind: 'span' | 'generation' | 'event';
  private readonly parent: NoopObservation | null;
  private ended = false;
  private metadata: Record<string, unknown> = {};
  private input: unknown;
  private output: unknown;
  private readonly records: CapturedRecord[] = [];
  private readonly recordMode: boolean;
  private readonly ringBuffer: CapturedRecord[];
  private readonly ringMax: number;

  constructor(
    name: string,
    kind: 'span' | 'generation' | 'event',
    parent: NoopObservation | null,
    opts: NoopObservationOptions = {},
    ringBuffer: CapturedRecord[] = [],
  ) {
    this.name = name;
    this.kind = kind;
    this.parent = parent;
    this.recordMode = opts.recordMode ?? false;
    this.ringMax = opts.ringBufferSize ?? 1000;
    this.ringBuffer = ringBuffer;
  }

  async end(opts?: { output?: unknown; level?: ObservationLevel; statusMessage?: string }) {
    if (this.ended) return;
    this.ended = true;
    if (opts?.output !== undefined) this.output = opts.output;
    if (this.recordMode) {
      this.pushRecord({
        kind: this.kind,
        name: this.name,
        ended: true,
        level: opts?.level ?? 'default',
        statusMessage: opts?.statusMessage,
        input: this.input,
        output: this.output,
        metadata: this.metadata,
      });
    }
  }

  setMetadata(key: string, value: unknown): IObservation {
    this.metadata[key] = value;
    return this;
  }
  setInput(input: unknown): IObservation {
    this.input = input;
    return this;
  }
  setOutput(output: unknown): IObservation {
    this.output = output;
    return this;
  }
  setTags(tags: Record<string, string>): IObservation {
    this.metadata.tags = { ...((this.metadata.tags as object) ?? {}), ...tags };
    return this;
  }
  async span(name: string, opts?: { input?: unknown; metadata?: Record<string, unknown> }) {
    const child = new NoopObservation(name, 'span', this, this.opts(), this.ringBuffer);
    if (opts?.input !== undefined) child.input = opts.input;
    if (opts?.metadata) child.metadata = { ...child.metadata, ...opts.metadata };
    return child;
  }
  async generation(
    name: string,
    opts?: { model?: string; input?: unknown; metadata?: Record<string, unknown>; modelParameters?: Record<string, unknown> },
  ) {
    const child = new NoopObservation(name, 'generation', this, this.opts(), this.ringBuffer);
    if (opts?.model) child.metadata.model = opts.model;
    if (opts?.input !== undefined) child.input = opts.input;
    if (opts?.modelParameters) child.metadata.modelParameters = opts.modelParameters;
    if (opts?.metadata) child.metadata = { ...child.metadata, ...opts.metadata };
    return child;
  }
  event(
    name: string,
    opts?: { input?: unknown; metadata?: Record<string, unknown>; level?: ObservationLevel },
  ): IObservation {
    const child = new NoopObservation(name, 'event', this, this.opts(), this.ringBuffer);
    if (opts?.input !== undefined) child.input = opts.input;
    if (opts?.metadata) child.metadata = { ...child.metadata, ...opts.metadata };
    if (this.recordMode) {
      child.pushRecord({
        kind: 'event',
        name,
        ended: true,
        level: opts?.level ?? 'default',
        input: child.input,
        metadata: child.metadata,
      });
    }
    return child;
  }
  async score(_opts: { name: string; value: number; comment?: string }) {
    /* no-op */
  }

  private opts(): NoopObservationOptions {
    return { recordMode: this.recordMode, ringBufferSize: this.ringMax };
  }

  private pushRecord(r: CapturedRecord): void {
    this.records.push(r);
    if (this.ringBuffer) {
      this.ringBuffer.push(r);
      while (this.ringBuffer.length > this.ringMax) this.ringBuffer.shift();
    }
  }
}

export interface CapturedRecord {
  kind: 'span' | 'generation' | 'event';
  name: string;
  ended: boolean;
  level: ObservationLevel;
  statusMessage?: string;
  input?: unknown;
  output?: unknown;
  metadata?: Record<string, unknown>;
}

export class NoopObservability implements IObservability {
  readonly name = 'noop';
  private readonly recordMode: boolean;
  private readonly ringBuffer: CapturedRecord[] = [];
  private readonly ringMax: number;

  constructor(opts: NoopObservationOptions = {}) {
    this.recordMode = opts.recordMode ?? false;
    this.ringMax = opts.ringBufferSize ?? 1000;
  }

  async trace(
    name: string,
    opts?: {
      input?: unknown;
      metadata?: Record<string, unknown>;
      userId?: string;
      sessionId?: string;
      tags?: string[];
    },
  ): Promise<IObservation> {
    const obs = new NoopObservation(name, 'span', null, { recordMode: this.recordMode, ringBufferSize: this.ringMax }, this.ringBuffer);
    if (opts?.input !== undefined) obs.setInput(opts.input);
    if (opts?.metadata) obs.setMetadata('init', opts.metadata);
    if (opts?.userId) obs.setMetadata('userId', opts.userId);
    if (opts?.sessionId) obs.setMetadata('sessionId', opts.sessionId);
    if (opts?.tags) obs.setMetadata('tags', opts.tags);
    return obs;
  }

  async flush() {
    /* no-op */
  }
  async shutdown() {
    /* no-op */
  }

  /** Test-only: return and clear the captured ring buffer. */
  drainRecords(): CapturedRecord[] {
    const out = this.ringBuffer.slice();
    this.ringBuffer.length = 0;
    return out;
  }
}
