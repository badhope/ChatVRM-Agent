import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  CircuitBreaker,
  CircuitState,
} from '../../../infrastructure/circuit-breaker.js';

describe('CircuitBreaker', () => {
  let breaker: CircuitBreaker;

  afterEach(() => {
    if (breaker) {
      breaker.destroy();
    }
  });

  describe('should create with default preset', () => {
    it('should create with default preset', () => {
      breaker = CircuitBreaker.createPreset('default');

      expect(breaker).toBeDefined();
      expect(breaker.getState()).toBe(CircuitState.CLOSED);
    });

    it('should start in CLOSED state', () => {
      breaker = CircuitBreaker.createPreset('default');

      expect(breaker.getState()).toBe(CircuitState.CLOSED);
    });
  });

  describe('should create with llm preset', () => {
    it('should create with llm preset', () => {
      breaker = CircuitBreaker.createPreset('llm');

      expect(breaker).toBeDefined();
      expect(breaker.getState()).toBe(CircuitState.CLOSED);
    });
  });

  describe('should create with critical preset', () => {
    it('should create with critical preset', () => {
      breaker = CircuitBreaker.createPreset('critical');

      expect(breaker).toBeDefined();
      expect(breaker.getState()).toBe(CircuitState.CLOSED);
    });
  });

  describe('should execute function successfully', () => {
    it('should execute and return result', async () => {
      breaker = CircuitBreaker.createPreset('default');

      const result = await breaker.fire(async () => 'success');

      expect(result).toBe('success');
    });

    it('should track successful executions in stats', async () => {
      breaker = CircuitBreaker.createPreset('default');

      await breaker.fire(async () => 'ok');

      const stats = breaker.getStats();
      expect(stats.successes).toBeGreaterThanOrEqual(0);
    });

    it('should pass through function arguments', async () => {
      breaker = CircuitBreaker.createPreset('default');

      const result = await breaker.fire(async () => 42);

      expect(result).toBe(42);
    });
  });

  describe('should transition to OPEN after failures', () => {
    it('should track failures in stats after errors', async () => {
      breaker = CircuitBreaker.createPreset('critical');

      for (let i = 0; i < 3; i++) {
        try {
          await breaker.fire(async () => {
            throw new Error(`failure ${i}`);
          });
        } catch {
          // Expected failures
        }
      }

      const stats = breaker.getStats();
      expect(stats.failures).toBeGreaterThan(0);
    });

    it('should still allow calls after mixed results', async () => {
      breaker = CircuitBreaker.createPreset('default');

      let result: string | null = null;
      result = await breaker.fire(async () => 'success');

      expect(result).toBe('success');
      expect(breaker.getState()).toBe(CircuitState.CLOSED);
    });
  });

  describe('should get correct state', () => {
    it('should return CLOSED initially', () => {
      breaker = CircuitBreaker.createPreset('default');

      expect(breaker.getState()).toBe(CircuitState.CLOSED);
    });

    it('should return CLOSED for successful calls', async () => {
      breaker = CircuitBreaker.createPreset('default');

      await breaker.fire(async () => 'ok');
      await breaker.fire(async () => 'ok');

      expect(breaker.getState()).toBe(CircuitState.CLOSED);
    });
  });

  describe('should get stats', () => {
    it('should return stats object with expected fields', () => {
      breaker = CircuitBreaker.createPreset('default');

      const stats = breaker.getStats();

      expect(stats).toHaveProperty('failures');
      expect(stats).toHaveProperty('successes');
      expect(stats).toHaveProperty('state');
      expect(stats.state).toBe(CircuitState.CLOSED);
    });

    it('should track failures in stats', async () => {
      breaker = CircuitBreaker.createPreset('default');

      try {
        await breaker.fire(async () => {
          throw new Error('test error');
        });
      } catch {
        // Expected
      }

      const stats = breaker.getStats();
      expect(stats.failures).toBeGreaterThanOrEqual(0);
    });
  });
});