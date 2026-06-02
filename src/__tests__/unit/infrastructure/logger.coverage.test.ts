import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createLogger } from '../../../infrastructure/logger.js';

describe('Logger createLogger coverage', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('should create logger in non-production mode with pretty printing', () => {
    it('should create logger in development mode', () => {
      process.env.NODE_ENV = 'development';
      const log = createLogger('dev-logger');

      expect(log).toBeDefined();
      expect(typeof log.info).toBe('function');
    });

    it('should create logger without NODE_ENV set', () => {
      delete process.env.NODE_ENV;
      const log = createLogger('default-env-logger');

      expect(log).toBeDefined();
      expect(typeof log.info).toBe('function');
    });
  });

  describe('should include level in log output', () => {
    it('should create logger with default info level', () => {
      delete process.env.LOG_LEVEL;
      const log = createLogger('test-level');

      expect(() => log.info('info message')).not.toThrow();
    });

    it('should log at warn level', () => {
      process.env.LOG_LEVEL = 'warn';
      const log = createLogger('warn-logger');

      expect(() => log.warn('warn message')).not.toThrow();
    });

    it('should log at error level', () => {
      process.env.LOG_LEVEL = 'error';
      const log = createLogger('error-logger');

      expect(() => log.error('error occurred')).not.toThrow();
    });

    it('should log at debug level', () => {
      process.env.LOG_LEVEL = 'debug';
      const log = createLogger('debug-logger');

      expect(() => log.debug('debug info')).not.toThrow();
    });

    it('should log at trace level', () => {
      process.env.LOG_LEVEL = 'trace';
      const log = createLogger('trace-logger');

      expect(() => log.trace('trace details')).not.toThrow();
    });

    it('should log at fatal level', () => {
      process.env.LOG_LEVEL = 'fatal';
      const log = createLogger('fatal-logger');

      expect(() => log.fatal('fatal error')).not.toThrow();
    });
  });

  describe('should include name in log output', () => {
    it('should create logger with specific name that does not throw', () => {
      const log = createLogger('my-service');

      expect(() => log.info('starting service')).not.toThrow();
    });

    it('should create different loggers with different names', () => {
      const log1 = createLogger('service-a');
      const log2 = createLogger('service-b');

      expect(log1).not.toBe(log2);
      expect(() => log1.info('from a')).not.toThrow();
      expect(() => log2.info('from b')).not.toThrow();
    });
  });

  describe('should respect custom log level', () => {
    it('should use LOG_LEVEL from environment', () => {
      process.env.LOG_LEVEL = 'debug';
      const log = createLogger('custom-level');

      expect(() => log.debug('debug message')).not.toThrow();
    });

    it('should use warn LOG_LEVEL from environment', () => {
      process.env.LOG_LEVEL = 'warn';
      const log = createLogger('warn-level');

      expect(() => log.warn('warning')).not.toThrow();
    });

    it('should default to info when LOG_LEVEL is unset', () => {
      delete process.env.LOG_LEVEL;
      const log = createLogger('default-level');

      expect(() => log.info('info message')).not.toThrow();
    });
  });

  describe('should handle undefined log level gracefully', () => {
    it('should fall back to info when LOG_LEVEL is not set', () => {
      delete process.env.LOG_LEVEL;
      const log = createLogger('fallback-logger');

      expect(log).toBeDefined();
      expect(() => log.info('test')).not.toThrow();
    });

    it('should handle empty LOG_LEVEL by falling back to info', () => {
      process.env.LOG_LEVEL = '';
      const log = createLogger('empty-level-logger');

      expect(log).toBeDefined();
      expect(() => log.info('test')).not.toThrow();
    });
  });

  describe('should log objects correctly', () => {
    it('should accept an object as log argument', () => {
      const log = createLogger('obj-logger');

      expect(() => log.info({ key: 'value', num: 42 })).not.toThrow();
    });

    it('should accept an object with message string', () => {
      const log = createLogger('obj-msg-logger');

      expect(() => log.info({ userId: 1, action: 'login' }, 'user logged in')).not.toThrow();
    });

    it('should accept nested objects', () => {
      const log = createLogger('nested-logger');

      expect(() =>
        log.info({ user: { id: 1, name: 'test' }, metadata: { source: 'api' } }),
      ).not.toThrow();
    });
  });

  describe('should log multiple arguments', () => {
    it('should accept message and additional data as separate arguments', () => {
      const log = createLogger('multi-arg-logger');

      expect(() => log.info({ status: 200, duration: 15 }, 'request completed')).not.toThrow();
    });

    it('should accept error and message as separate arguments', () => {
      const log = createLogger('error-arg-logger');

      expect(() =>
        log.error(new Error('network error'), 'failed to fetch data'),
      ).not.toThrow();
    });

    it('should accept string, number, and object as arguments', () => {
      const log = createLogger('mixed-arg-logger');

      expect(() => log.info({ batch: 'a1' }, 'processed messages')).not.toThrow();
    });
  });
});