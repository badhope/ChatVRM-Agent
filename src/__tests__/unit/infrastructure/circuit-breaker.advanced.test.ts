import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  CircuitBreaker,
  CircuitState,
} from '../../../infrastructure/circuit-breaker.js';

describe('CircuitBreaker advanced', () => {
  let breaker: CircuitBreaker;

  afterEach(() => {
    vi.useRealTimers();
    if (breaker) {
      breaker.destroy();
    }
  });

  describe('state transitions', () => {
    it('should start in CLOSED state', () => {
      breaker = CircuitBreaker.createPreset('default');

      expect(breaker.getState()).toBe(CircuitState.CLOSED);
    });

    it('should remain CLOSED after a single failure', async () => {
      breaker = CircuitBreaker.createPreset('critical');

      try {
        await breaker.fire(async () => {
          throw new Error('failure');
        });
      } catch {
        // Expected
      }

      const stats = breaker.getStats();
      expect(stats.failures).toBe(1);
      expect(breaker.getState()).toBe(CircuitState.CLOSED);
    });

    it('should remain CLOSED after multiple consecutive failures', async () => {
      breaker = CircuitBreaker.createPreset('critical');

      for (let i = 0; i < 5; i++) {
        try {
          await breaker.fire(async () => {
            throw new Error(`failure-${i}`);
          });
        } catch {
          // Expected
        }
      }

      const stats = breaker.getStats();
      expect(stats.failures).toBe(5);
      expect(breaker.getState()).toBe(CircuitState.CLOSED);
    });

    it('should handle mixed success and failure without opening', async () => {
      breaker = CircuitBreaker.createPreset('default');

      await breaker.fire(async () => 'success1');
      try {
        await breaker.fire(async () => {
          throw new Error('fail');
        });
      } catch {
        // Expected
      }
      await breaker.fire(async () => 'success2');

      const stats = breaker.getStats();
      expect(stats.successes).toBe(2);
      expect(stats.failures).toBe(1);
      expect(breaker.getState()).toBe(CircuitState.CLOSED);
    });
  });

  describe('reset', () => {
    it('reset should clear failure count and keep circuit closed', async () => {
      breaker = CircuitBreaker.createPreset('default');

      for (let i = 0; i < 3; i++) {
        try {
          await breaker.fire(async () => {
            throw new Error(`fail-${i}`);
          });
        } catch {
          // Expected
        }
      }

      expect(breaker.getStats().failures).toBeGreaterThan(0);

      breaker.reset();

      expect(breaker.getState()).toBe(CircuitState.CLOSED);
    });

    it('reset should allow successful calls after resetting', async () => {
      breaker = CircuitBreaker.createPreset('critical');

      for (let i = 0; i < 3; i++) {
        try {
          await breaker.fire(async () => {
            throw new Error(`fail-${i}`);
          });
        } catch {
          // Expected
        }
      }

      breaker.reset();

      const result = await breaker.fire(async () => 'after-reset');

      expect(result).toBe('after-reset');
      expect(breaker.getState()).toBe(CircuitState.CLOSED);
    });
  });

  describe('destroy', () => {
    it('destroy should clean up resources', () => {
      breaker = CircuitBreaker.createPreset('default');

      expect(() => breaker.destroy()).not.toThrow();
    });

    it('destroy should not throw when called multiple times', () => {
      breaker = CircuitBreaker.createPreset('default');

      expect(() => {
        breaker.destroy();
        breaker.destroy();
      }).not.toThrow();
    });

    it('calls should reject after destroy', async () => {
      breaker = CircuitBreaker.createPreset('default');
      breaker.destroy();

      await expect(
        breaker.fire(async () => 'should-fail')
      ).rejects.toThrow();
    });
  });

  describe('presets', () => {
    it('default preset should create a valid breaker', () => {
      breaker = CircuitBreaker.createPreset('default');

      expect(breaker).toBeDefined();
      expect(breaker.getState()).toBe(CircuitState.CLOSED);
    });

    it('critical preset should create a valid breaker', () => {
      breaker = CircuitBreaker.createPreset('critical');

      expect(breaker).toBeDefined();
      expect(breaker.getState()).toBe(CircuitState.CLOSED);
    });

    it('llm preset should create a valid breaker', () => {
      breaker = CircuitBreaker.createPreset('llm');

      expect(breaker).toBeDefined();
      expect(breaker.getState()).toBe(CircuitState.CLOSED);
    });

    it('each preset should produce independent breakers', () => {
      const defaultBreaker = CircuitBreaker.createPreset('default');
      const criticalBreaker = CircuitBreaker.createPreset('critical');
      const llmBreaker = CircuitBreaker.createPreset('llm');

      expect(defaultBreaker).not.toBe(criticalBreaker);
      expect(criticalBreaker).not.toBe(llmBreaker);
      expect(defaultBreaker).not.toBe(llmBreaker);

      defaultBreaker.destroy();
      criticalBreaker.destroy();
      llmBreaker.destroy();
    });
  });

  describe('concurrent calls', () => {
    it('should handle multiple concurrent calls correctly', async () => {
      breaker = CircuitBreaker.createPreset('default');

      const results = await Promise.all([
        breaker.fire(async () => 'first'),
        breaker.fire(async () => 'second'),
        breaker.fire(async () => 'third'),
      ]);

      expect(results).toEqual(['first', 'second', 'third']);
      expect(breaker.getState()).toBe(CircuitState.CLOSED);
    });

    it('should track concurrent failure calls correctly', async () => {
      breaker = CircuitBreaker.createPreset('critical');

      const promises = [1, 2, 3, 4, 5].map((i) =>
        breaker
          .fire(async () => {
            throw new Error(`error-${i}`);
          })
          .catch(() => undefined)
      );

      await Promise.all(promises);

      const stats = breaker.getStats();
      expect(stats.failures).toBe(5);
      expect(stats.successes).toBe(0);
    });

    it('should handle mixed concurrent success and failure', async () => {
      breaker = CircuitBreaker.createPreset('default');

      let callCount = 0;
      const promises = [1, 2, 3, 4, 5, 6].map(async (i) => {
        callCount++;
        if (i % 2 === 0) {
          return breaker.fire(async () => `success-${i}`);
        }
        return breaker.fire(async () => {
          throw new Error(`fail-${i}`);
        }).catch(() => `caught-${i}`);
      });

      const results = await Promise.all(promises);

      const successes = results.filter((r) => r && r.startsWith('success'));
      const caught = results.filter((r) => r && r.startsWith('caught'));

      expect(successes.length).toBe(3);
      expect(caught.length).toBe(3);

      const stats = breaker.getStats();
      expect(stats.successes).toBe(3);
      expect(stats.failures).toBe(3);
    });
  });

  describe('stats', () => {
    it('should report initial stats with zero counts', () => {
      breaker = CircuitBreaker.createPreset('default');

      const stats = breaker.getStats();

      expect(stats.failures).toBe(0);
      expect(stats.successes).toBe(0);
      expect(stats.state).toBe(CircuitState.CLOSED);
    });

    it('should report correct stats after failures and successes', async () => {
      breaker = CircuitBreaker.createPreset('default');

      await breaker.fire(async () => 'ok1');
      try {
        await breaker.fire(async () => {
          throw new Error('fail1');
        });
      } catch {
        // Expected
      }
      await breaker.fire(async () => 'ok2');
      try {
        await breaker.fire(async () => {
          throw new Error('fail2');
        });
      } catch {
        // Expected
      }

      const stats = breaker.getStats();

      expect(stats.successes).toBe(2);
      expect(stats.failures).toBe(2);
      expect(stats.state).toBe(CircuitState.CLOSED);
    });

    it('should reflect state in stats', async () => {
      breaker = CircuitBreaker.createPreset('critical');

      let stats = breaker.getStats();
      expect(stats.state).toBe(CircuitState.CLOSED);

      await breaker.fire(async () => 'ok');

      stats = breaker.getStats();
      expect(stats.state).toBe(CircuitState.CLOSED);
      expect(stats.successes).toBe(1);
    });

    it('should increment stats across multiple operations', async () => {
      breaker = CircuitBreaker.createPreset('default');

      for (let i = 0; i < 10; i++) {
        await breaker.fire(async () => `result-${i}`);
      }

      const stats = breaker.getStats();
      expect(stats.successes).toBe(10);
      expect(stats.failures).toBe(0);
    });
  });
});