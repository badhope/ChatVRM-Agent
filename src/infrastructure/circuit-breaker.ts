import CircuitBreakerLib from 'opossum';

export enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN',
}

export interface CircuitBreakerOptions {
  failureThreshold: number;
  resetTimeout: number;
  halfOpenMaxCalls: number;
}

const STATE_MAP: Record<string, CircuitState> = {
  closed: CircuitState.CLOSED,
  open: CircuitState.OPEN,
  halfOpen: CircuitState.HALF_OPEN,
};

const PRESETS: Record<'llm' | 'critical' | 'default', CircuitBreakerOptions> = {
  llm: {
    failureThreshold: 3,
    resetTimeout: 30_000,
    halfOpenMaxCalls: 1,
  },
  critical: {
    failureThreshold: 2,
    resetTimeout: 10_000,
    halfOpenMaxCalls: 1,
  },
  default: {
    failureThreshold: 5,
    resetTimeout: 15_000,
    halfOpenMaxCalls: 2,
  },
};

export class CircuitBreaker {
  private breaker: CircuitBreakerLib;

  constructor(options: CircuitBreakerOptions) {
    this.breaker = new CircuitBreakerLib(async (fn: () => Promise<unknown>) => fn(), {
      errorThresholdPercentage: 100,
      timeout: false,
      ...options,
      volumeThreshold: 1,
    });
  }

  async fire<T>(fn: () => Promise<T>): Promise<T> {
    return this.breaker.fire(fn) as Promise<T>;
  }

  getState(): CircuitState {
    const state = this.breaker.opened
      ? 'open'
      : this.breaker.closed
        ? 'closed'
        : this.breaker.halfOpen
          ? 'halfOpen'
          : 'closed';
    return STATE_MAP[state] ?? CircuitState.CLOSED;
  }

  getStats(): { failures: number; successes: number; state: CircuitState } {
    const stats = this.breaker.stats;
    return {
      failures: stats.failures,
      successes: stats.successes,
      state: this.getState(),
    };
  }

  reset(): void {
    this.breaker.close();
  }

  destroy(): void {
    this.breaker.shutdown();
  }

  static createPreset(type: 'llm' | 'critical' | 'default'): CircuitBreaker {
    return new CircuitBreaker(PRESETS[type]);
  }
}