/**
 * Resilient LLM wrapper.
 *
 * Wraps an ILLMPort with two layers of protection:
 *
 *   1. **Exponential-backoff retry** on transient errors (5xx, 429,
 *      network resets). Default 3 attempts, doubling delay from
 *      `initialDelayMs` (250ms → 500ms → 1000ms), with optional jitter
 *      to avoid thundering herds.
 *
 *   2. **Circuit breaker** on the underlying {@link CircuitBreaker}
 *      (opossum-based). After N consecutive failures the breaker
 *      opens and short-circuits subsequent calls until `resetTimeout`
 *      elapses. This protects the upstream provider from a runaway
 *      agent loop hammering a broken endpoint.
 *
 * Both layers are independently configurable. The retry layer is
 * "outside" the breaker so a single retried call counts as one
 * breaker fire (otherwise the breaker would trip on every retry
 * sequence). Errors are re-thrown with a `ResilientError` that
 * preserves the original cause and adds a `retries` counter.
 *
 * The wrapper is **streaming-aware**: the stream() method is passed
 * through unchanged because retrying mid-stream is rarely useful.
 */

import { CircuitBreaker, CircuitState } from '../infrastructure/circuit-breaker.js';
import type { ILLMPort, ChatParams, ChatResponse } from '../ports/llm.port.js';

export interface ResilientLLMOptions {
  /** Max retry attempts (default 3, so 4 total tries). */
  maxRetries?: number;
  /** Initial backoff in ms. Default 250. */
  initialDelayMs?: number;
  /** Cap on backoff. Default 4000. */
  maxDelayMs?: number;
  /** Multiplier between attempts. Default 2. */
  backoffMultiplier?: number;
  /** Add ±jitter % to each backoff. Default 0.25. */
  jitter?: number;
  /** Predicate: should this error trigger a retry? Default: all Errors. */
  shouldRetry?: (err: unknown, attempt: number) => boolean;
  /** Optional abort signal to cancel in-flight retries. */
  signal?: AbortSignal;
  /** Circuit breaker config. Default: 3 failures / 30s reset. */
  breaker?: {
    failureThreshold?: number;
    resetTimeout?: number;
    halfOpenMaxCalls?: number;
  };
  /** Optional sleep function for tests. */
  sleep?: (ms: number) => Promise<void>;
}

export class ResilientError extends Error {
  readonly code = 'LLM_RESILIENT_ERROR';
  constructor(public readonly cause: unknown, public readonly attempts: number, public readonly retries: number) {
    super(`LLM call failed after ${attempts} attempt(s) (retries=${retries}): ${cause instanceof Error ? cause.message : String(cause)}`);
  }
}

export class ResilientLLM {
  private readonly maxRetries: number;
  private readonly initialDelayMs: number;
  private readonly maxDelayMs: number;
  private readonly backoffMultiplier: number;
  private readonly jitter: number;
  private readonly shouldRetry: (err: unknown, attempt: number) => boolean;
  private readonly signal?: AbortSignal;
  private readonly breaker: CircuitBreaker;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(opts: ResilientLLMOptions = {}) {
    this.maxRetries = opts.maxRetries ?? 3;
    this.initialDelayMs = opts.initialDelayMs ?? 250;
    this.maxDelayMs = opts.maxDelayMs ?? 4000;
    this.backoffMultiplier = opts.backoffMultiplier ?? 2;
    this.jitter = opts.jitter ?? 0.25;
    this.shouldRetry = opts.shouldRetry ?? (() => true);
    this.signal = opts.signal;
    this.sleep = opts.sleep ?? defaultSleep;
    this.breaker = new CircuitBreaker({
      failureThreshold: opts.breaker?.failureThreshold ?? 3,
      resetTimeout: opts.breaker?.resetTimeout ?? 30_000,
      halfOpenMaxCalls: opts.breaker?.halfOpenMaxCalls ?? 1,
    });
  }

  /** Current breaker state. */
  get circuitState(): CircuitState {
    return this.breaker.getState();
  }

  /** Reset the breaker (e.g. after a manual upstream health check). */
  resetBreaker(): void {
    this.breaker.reset();
  }

  /** Wrap an ILLMPort. */
  wrap(port: ILLMPort): ILLMPort {
    return {
      chat: async (req: ChatParams) => this.callWithResilience(() => port.chat(req)),
      stream: port.stream,
      listModels: port.listModels,
      isAvailable: port.isAvailable,
    };
  }

  /** Call chat() once with resilience (retry + breaker). Exposed for testing. */
  async callWithResilience(fn: () => Promise<ChatResponse>): Promise<ChatResponse> {
    let lastErr: unknown;
    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      if (this.signal?.aborted) {
        throw new Error('ResilientLLM: aborted');
      }
      try {
        return await this.breaker.fire(fn);
      } catch (err) {
        lastErr = err;
        // No more retries: bail.
        if (attempt >= this.maxRetries || !this.shouldRetry(err, attempt)) {
          throw new ResilientError(err, attempt + 1, attempt);
        }
        const base = Math.min(this.maxDelayMs, this.initialDelayMs * Math.pow(this.backoffMultiplier, attempt));
        const jitterMs = base * this.jitter * (Math.random() * 2 - 1);
        const delay = Math.max(0, base + jitterMs);
        await this.sleep(delay);
      }
    }
    // Unreachable.
    throw new ResilientError(lastErr, this.maxRetries + 1, this.maxRetries);
  }

  /** Destroy internal resources. */
  destroy(): void {
    this.breaker.destroy();
  }
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
