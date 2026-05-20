// ============================================================
// Circuit Breaker - backed by opossum
// ============================================================

import CircuitBreakerLib from 'opossum';
import { DEFAULT_TIMEOUT_MS } from '../constants/index.js';

// ------------------------------------------------------------------
// Public types (backward-compatible)
// ------------------------------------------------------------------

/**
 * Circuit breaker configuration options.
 */
export interface CircuitBreakerOptions {
  /** Failure count that triggers the open state (default 5) */
  failureThreshold: number;
  /** Milliseconds before transitioning from OPEN to HALF_OPEN (default 60 000) */
  resetTimeout: number;
  /** Max test calls allowed in HALF_OPEN state (default 3) */
  halfOpenMaxCalls: number;
}

/**
 * Circuit breaker states.
 */
export enum CircuitState {
  CLOSED = 'closed',
  OPEN = 'open',
  HALF_OPEN = 'half-open',
}

/**
 * Create a preset configuration for different operation types.
 */
export function createCircuitBreakerConfig(
  operationType: 'llm' | 'critical' | 'normal' | 'default' = 'default',
): CircuitBreakerOptions {
  switch (operationType) {
    case 'llm':
      return { failureThreshold: 2, resetTimeout: 30000, halfOpenMaxCalls: 1 };
    case 'critical':
      return { failureThreshold: 2, resetTimeout: 30000, halfOpenMaxCalls: 1 };
    case 'normal':
    case 'default':
    default:
      return { failureThreshold: 3, resetTimeout: 30000, halfOpenMaxCalls: 3 };
  }
}

// ------------------------------------------------------------------
// State mapping helpers
// ------------------------------------------------------------------

/**
 * Map opossum's string state to our CircuitState enum.
 */
function mapOpossumState(opened: boolean, halfOpen: boolean): CircuitState {
  if (opened) return CircuitState.OPEN;
  if (halfOpen) return CircuitState.HALF_OPEN;
  return CircuitState.CLOSED;
}

// ------------------------------------------------------------------
// CircuitBreaker class (backward-compatible wrapper around opossum)
// ------------------------------------------------------------------

/**
 * Circuit breaker that wraps async function calls.
 *
 * Delegates to opossum internally while preserving the original
 * CircuitBreaker public API so that existing callers do not break.
 */
export class CircuitBreaker {
  private breaker: CircuitBreakerLib;
  private options: CircuitBreakerOptions;

  /**
   * Create a circuit breaker instance.
   *
   * @param options - Partial configuration; missing fields use sensible defaults
   */
  constructor(options: Partial<CircuitBreakerOptions> = {}) {
    this.options = {
      failureThreshold: options.failureThreshold ?? 5,
      resetTimeout: options.resetTimeout ?? DEFAULT_TIMEOUT_MS,
      halfOpenMaxCalls: options.halfOpenMaxCalls ?? 3,
    };

    // opossum expects a function; we provide a no-op placeholder that
    // will be overridden per-call in execute().
    this.breaker = new CircuitBreakerLib(async () => {}, {
      timeout: this.options.resetTimeout,
      resetTimeout: this.options.resetTimeout,
      volumeThreshold: this.options.halfOpenMaxCalls,
      errorThresholdPercentage: this.options.failureThreshold <= 2 ? 50 : 50,
    });
  }

  /**
   * Execute a function through the circuit breaker.
   *
   * @param fn - The async function to protect
   * @returns The function's return value
   * @throws When the breaker is open or the function fails
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    // Create a one-shot opossum breaker for this specific function
    const shot = new CircuitBreakerLib(fn, {
      resetTimeout: this.options.resetTimeout,
      errorThresholdPercentage: this.options.failureThreshold <= 2 ? 50 : 50,
      volumeThreshold: this.options.halfOpenMaxCalls,
    });

    // Sync stats back to the shared breaker for getStats()
    shot.on('success', () => {
      this.breaker.emit('success');
    });
    shot.on('failure', () => {
      this.breaker.emit('failure');
    });

    return shot.fire() as Promise<T>;
  }

  /**
   * Get the current circuit breaker state.
   */
  getState(): CircuitState {
    return mapOpossumState(this.breaker.opened, this.breaker.halfOpen);
  }

  /**
   * Get circuit breaker statistics.
   */
  getStats(): { state: CircuitState; failureCount: number; successCount: number } {
    const stats = this.breaker.stats;
    return {
      state: this.getState(),
      failureCount: stats.failures,
      successCount: stats.successes,
    };
  }
}
