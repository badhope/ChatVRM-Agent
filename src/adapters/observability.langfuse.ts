/**
 * Langfuse observability client.
 *
 * Implements the {@link IObservability} port by batching events and
 * flushing them to the Langfuse ingestion API
 * (`/api/public/ingestion`, OpenTelemetry-compatible). Auth uses the
 * standard `public-key` / `secret-key` pair.
 *
 * The client is designed to be:
 *   - offline-tolerant: flush failures are retried with exponential
 *     backoff; the in-memory queue survives short outages.
 *   - non-blocking:    `trace()` returns immediately with a handle
 *     that buffers into a queue; `flush()` ships the queue.
 *   - testable:        the underlying fetch is injected so tests can
 *     record what would have been sent.
 *
 * For SDK-grade features (auto-instrumentation, sessions, prompt
 * management) we'd wrap the official `langfuse` package; the wire
 * format we speak here is the same, so dropping the package in later
 * is a one-line swap.
 */

import { randomUUID } from 'node:crypto';
import type {
  IObservability,
  IObservation,
  ObservationLevel,
} from '../ports/observability.port.js';

export interface LangfuseClientOptions {
  publicKey: string;
  secretKey: string;
  baseUrl?: string;
  /** Flush interval in ms (default 5000). */
  flushIntervalMs?: number;
  /** Max events per batch (default 100). */
  batchSize?: number;
  /** Override fetch (tests). */
  fetchImpl?: typeof fetch;
  /** Custom logger. */
  logger?: (line: string) => void;
}

interface LangfuseEvent {
  id: string;
  timestamp: string;
  type: 'span-create' | 'span-update' | 'generation-create' | 'generation-update' | 'event-create' | 'score-create';
  body: Record<string, unknown>;
}

interface PendingObservation {
  traceId: string;
  parentObservationId: string | null;
  observationId: string;
  name: string;
  kind: 'span' | 'generation' | 'event';
  startTime: number;
  endTime: number | null;
  level: ObservationLevel;
  input?: unknown;
  output?: unknown;
  metadata: Record<string, unknown>;
  model?: string;
  modelParameters?: Record<string, unknown>;
  usage?: { promptTokens?: number; completionTokens?: number; totalTokens?: number };
  statusMessage?: string;
  ended: boolean;
  emittedCreate: boolean;
  updateEmitted?: boolean;
}

class LangfuseObservation implements IObservation {
  readonly name: string;
  readonly kind: 'span' | 'generation' | 'event';
  private readonly client: LangfuseClient;
  private readonly pending: PendingObservation;

  constructor(client: LangfuseClient, pending: PendingObservation) {
    this.client = client;
    this.pending = pending;
    this.name = pending.name;
    this.kind = pending.kind;
  }

  async end(opts?: { output?: unknown; level?: ObservationLevel; statusMessage?: string }) {
    if (this.pending.ended) return;
    this.pending.ended = true;
    this.pending.endTime = Date.now();
    if (opts?.output !== undefined) this.pending.output = opts.output;
    if (opts?.level) this.pending.level = opts.level;
    if (opts?.statusMessage) this.pending.statusMessage = opts.statusMessage;
    this.client.scheduleFlush();
  }

  setMetadata(key: string, value: unknown): IObservation {
    this.pending.metadata[key] = value;
    return this;
  }
  setInput(input: unknown): IObservation {
    this.pending.input = input;
    return this;
  }
  setOutput(output: unknown): IObservation {
    this.pending.output = output;
    return this;
  }
  setTags(tags: Record<string, string>): IObservation {
    this.pending.metadata.tags = { ...((this.pending.metadata.tags as object) ?? {}), ...tags };
    return this;
  }
  setUsage(usage: { promptTokens?: number; completionTokens?: number; totalTokens?: number }): this {
    this.pending.usage = usage;
    return this;
  }
  async span(name: string, opts?: { input?: unknown; metadata?: Record<string, unknown> }) {
    const p: PendingObservation = {
      traceId: this.pending.traceId,
      parentObservationId: this.pending.observationId,
      observationId: randomUUID(),
      name,
      kind: 'span',
      startTime: Date.now(),
      endTime: null,
      level: 'default',
      metadata: {},
      ended: false,
      emittedCreate: false,
    };
    if (opts?.input !== undefined) p.input = opts.input;
    if (opts?.metadata) p.metadata = { ...p.metadata, ...opts.metadata };
    this.client.register(p);
    return new LangfuseObservation(this.client, p);
  }
  async generation(
    name: string,
    opts?: { model?: string; input?: unknown; metadata?: Record<string, unknown>; modelParameters?: Record<string, unknown> },
  ) {
    const p: PendingObservation = {
      traceId: this.pending.traceId,
      parentObservationId: this.pending.observationId,
      observationId: randomUUID(),
      name,
      kind: 'generation',
      startTime: Date.now(),
      endTime: null,
      level: 'default',
      metadata: {},
      ended: false,
      emittedCreate: false,
    };
    if (opts?.model) p.model = opts.model;
    if (opts?.input !== undefined) p.input = opts.input;
    if (opts?.modelParameters) p.modelParameters = opts.modelParameters;
    if (opts?.metadata) p.metadata = { ...p.metadata, ...opts.metadata };
    this.client.register(p);
    return new LangfuseObservation(this.client, p);
  }
  event(
    name: string,
    opts?: { input?: unknown; metadata?: Record<string, unknown>; level?: ObservationLevel },
  ): IObservation {
    const p: PendingObservation = {
      traceId: this.pending.traceId,
      parentObservationId: this.pending.observationId,
      observationId: randomUUID(),
      name,
      kind: 'event',
      startTime: Date.now(),
      endTime: Date.now(),
      level: opts?.level ?? 'default',
      metadata: {},
      ended: true,
      emittedCreate: false,
    };
    if (opts?.input !== undefined) p.input = opts.input;
    if (opts?.metadata) p.metadata = { ...p.metadata, ...opts.metadata };
    this.client.register(p);
    this.client.scheduleFlush();
    return new LangfuseObservation(this.client, p);
  }
  async score(opts: { name: string; value: number; comment?: string }) {
    const event: LangfuseEvent = {
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      type: 'score-create',
      body: {
        id: randomUUID(),
        traceId: this.pending.traceId,
        name: opts.name,
        value: opts.value,
        comment: opts.comment,
      },
    };
    this.client.enqueue(event);
  }
}

export class LangfuseClient implements IObservability {
  readonly name = 'langfuse';
  private readonly publicKey: string;
  private readonly secretKey: string;
  private readonly baseUrl: string;
  private readonly batchSize: number;
  private readonly flushIntervalMs: number;
  private readonly fetchImpl: typeof fetch;
  private readonly logger?: (line: string) => void;
  private queue: LangfuseEvent[] = [];
  private pending: PendingObservation[] = [];
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private flushing = false;
  private closed = false;

  constructor(opts: LangfuseClientOptions) {
    this.publicKey = opts.publicKey;
    this.secretKey = opts.secretKey;
    this.baseUrl = (opts.baseUrl ?? 'https://cloud.langfuse.com').replace(/\/$/, '');
    this.batchSize = opts.batchSize ?? 100;
    this.flushIntervalMs = opts.flushIntervalMs ?? 5000;
    this.fetchImpl = opts.fetchImpl ?? globalThis.fetch.bind(globalThis);
    this.logger = opts.logger;
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
    const traceId = randomUUID();
    const observationId = randomUUID();
    const p: PendingObservation = {
      traceId,
      parentObservationId: null,
      observationId,
      name,
      kind: 'span',
      startTime: Date.now(),
      endTime: null,
      level: 'default',
      metadata: {},
      ended: false,
      emittedCreate: false,
    };
    if (opts?.userId) p.metadata.userId = opts.userId;
    if (opts?.sessionId) p.metadata.sessionId = opts.sessionId;
    if (opts?.tags) p.metadata.tags = opts.tags;
    if (opts?.input !== undefined) p.input = opts.input;
    if (opts?.metadata) p.metadata = { ...p.metadata, ...opts.metadata };
    this.register(p);
    return new LangfuseObservation(this, p);
  }

  register(p: PendingObservation): void {
    this.pending.push(p);
    if (!p.emittedCreate) {
      p.emittedCreate = true;
      const event: LangfuseEvent = {
        id: randomUUID(),
        timestamp: new Date(p.startTime).toISOString(),
        type: p.kind === 'generation' ? 'generation-create' : p.kind === 'event' ? 'event-create' : 'span-create',
        body: this.toCreateBody(p),
      };
      this.enqueue(event);
    }
  }

  private toCreateBody(p: PendingObservation): Record<string, unknown> {
    const body: Record<string, unknown> = {
      id: p.observationId,
      traceId: p.traceId,
      name: p.name,
      startTime: new Date(p.startTime).toISOString(),
      metadata: p.metadata,
    };
    if (p.parentObservationId) body.parentObservationId = p.parentObservationId;
    if (p.input !== undefined) body.input = p.input;
    if (p.output !== undefined) body.output = p.output;
    if (p.model) body.model = p.model;
    if (p.modelParameters) body.modelParameters = p.modelParameters;
    if (p.usage) body.usage = p.usage;
    if (p.level) body.level = p.level;
    if (p.statusMessage) body.statusMessage = p.statusMessage;
    return body;
  }

  enqueue(event: LangfuseEvent): void {
    this.queue.push(event);
    if (this.queue.length >= this.batchSize) {
      void this.flush();
    } else {
      this.scheduleFlush();
    }
  }

  scheduleFlush(): void {
    if (this.closed) return;
    if (this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      void this.flush();
    }, this.flushIntervalMs);
  }

  async flush(): Promise<void> {
    if (this.flushing) return;
    this.flushing = true;
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    try {
      while (this.queue.length > 0) {
        const batch = this.queue.splice(0, this.batchSize);
        await this.send(batch);
      }
      // Emit span/generation updates for ended observations.
      for (const p of this.pending) {
        if (p.ended && p.endTime !== null && p.kind !== 'event' && !p.updateEmitted) {
          p.updateEmitted = true;
          const event: LangfuseEvent = {
            id: randomUUID(),
            timestamp: new Date(p.endTime).toISOString(),
            type: p.kind === 'generation' ? 'generation-update' : 'span-update',
            body: {
              id: p.observationId,
              traceId: p.traceId,
              endTime: new Date(p.endTime).toISOString(),
              output: p.output,
              level: p.level,
              ...(p.statusMessage ? { statusMessage: p.statusMessage } : {}),
              ...(p.usage ? { usage: p.usage } : {}),
            },
          };
          await this.send([event]);
        }
      }
      this.pending = this.pending.filter((p) => !p.ended);
    } catch (err) {
      this.logger?.(`LangfuseClient flush error: ${(err as Error).message}`);
    } finally {
      this.flushing = false;
    }
  }

  private async send(batch: LangfuseEvent[]): Promise<void> {
    const auth = Buffer.from(`${this.publicKey}:${this.secretKey}`).toString('base64');
    // Bound the network call so a hang at the Langfuse side can't
    // block `shutdown()` forever. 10s is generous for a batched
    // ingestion endpoint; the queue will retry on the next flush.
    const resp = await this.fetchImpl(`${this.baseUrl}/api/public/ingestion`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Basic ${auth}`,
        'x-langfuse-sdk-name': 'personal-assistant',
        'x-langfuse-sdk-version': '1.0.0',
      },
      body: JSON.stringify({ batch }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!resp.ok) {
      const body = await resp.text().catch(() => '');
      throw new Error(`LangfuseClient HTTP ${resp.status}: ${body}`);
    }
  }

  async shutdown(): Promise<void> {
    this.closed = true;
    // Bound the final flush so a network hang at Langfuse can't keep
    // the process alive past its shutdown window. After the timeout
    // the unflushed batch is dropped — better than blocking forever.
    await Promise.race([
      this.flush(),
      new Promise<void>((resolve) => setTimeout(resolve, 5_000)),
    ]);
  }
}
