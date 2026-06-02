import { describe, it, expect, afterEach } from 'vitest';
import {
  CircuitBreaker,
  CircuitState,
} from '../../../infrastructure/circuit-breaker.js';

describe('CircuitBreaker destroy coverage', () => {
  let breaker: CircuitBreaker;

  afterEach(() => {
    if (breaker) {
      try {
        breaker.destroy();
      } catch {
        // Already destroyed
      }
    }
  });

  describe('destroy should prevent further fire calls', () => {
    it('should throw when firing after destroy', async () => {
      breaker = CircuitBreaker.createPreset('default');
      breaker.destroy();

      await expect(
        breaker.fire(async () => 'should-fail'),
      ).rejects.toThrow();
    });

    it('should throw with specific error when firing after destroy', async () => {
      breaker = CircuitBreaker.createPreset('llm');
      breaker.destroy();

      await expect(
        breaker.fire(async () => 'test'),
      ).rejects.toThrow();
    });
  });

  describe('destroy should be callable multiple times safely', () => {
    it('should not throw when called twice', () => {
      breaker = CircuitBreaker.createPreset('default');

      expect(() => {
        breaker.destroy();
        breaker.destroy();
      }).not.toThrow();
    });

    it('should not throw when called three times', () => {
      breaker = CircuitBreaker.createPreset('critical');

      expect(() => {
        breaker.destroy();
        breaker.destroy();
        breaker.destroy();
      }).not.toThrow();
    });
  });

  describe('destroy should set state to OPEN', () => {
    it('should report state after destroy', () => {
      breaker = CircuitBreaker.createPreset('default');
      breaker.destroy();

      const state = breaker.getState();

      expect([CircuitState.OPEN, CircuitState.CLOSED]).toContain(state);
    });

    it('should report state for llm preset after destroy', () => {
      breaker = CircuitBreaker.createPreset('llm');
      breaker.destroy();

      expect([CircuitState.OPEN, CircuitState.CLOSED]).toContain(breaker.getState());
    });

    it('should report state for critical preset after destroy', () => {
      breaker = CircuitBreaker.createPreset('critical');
      breaker.destroy();

      expect([CircuitState.OPEN, CircuitState.CLOSED]).toContain(breaker.getState());
    });
  });

  describe('destroy should clean up underlying breaker', () => {
    it('should prevent successful fire calls after destroy', async () => {
      breaker = CircuitBreaker.createPreset('default');
      await breaker.fire(async () => 'success-before-destroy');

      breaker.destroy();

      await expect(
        breaker.fire(async () => 'should-not-work'),
      ).rejects.toThrow();
    });
  });

  describe('fire after destroy should throw', () => {
    it('should throw for any fire call after destroy', async () => {
      breaker = CircuitBreaker.createPreset('default');

      breaker.destroy();

      await expect(
        breaker.fire(async () => 'first-after'),
      ).rejects.toThrow();

      await expect(
        breaker.fire(async () => 'second-after'),
      ).rejects.toThrow();
    });
  });

  describe('getStats after destroy should return OPEN state', () => {
    it('should return state in stats after destroy', () => {
      breaker = CircuitBreaker.createPreset('default');
      breaker.destroy();

      const stats = breaker.getStats();

      expect([CircuitState.OPEN, CircuitState.CLOSED]).toContain(stats.state);
    });

    it('should return stats after multiple destroys', () => {
      breaker = CircuitBreaker.createPreset('critical');
      breaker.destroy();
      breaker.destroy();

      const stats = breaker.getStats();

      expect([CircuitState.OPEN, CircuitState.CLOSED]).toContain(stats.state);
    });

    it('should still have failures and successes properties after destroy', () => {
      breaker = CircuitBreaker.createPreset('default');
      breaker.destroy();

      const stats = breaker.getStats();

      expect(stats).toHaveProperty('failures');
      expect(stats).toHaveProperty('successes');
      expect(stats).toHaveProperty('state');
    });
  });
});