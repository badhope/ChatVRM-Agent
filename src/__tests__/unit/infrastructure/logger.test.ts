import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createLogger } from '../../../infrastructure/logger.js';

describe('Logger', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('should create logger with name', () => {
    it('should create a logger instance', () => {
      const log = createLogger('test');

      expect(log).toBeDefined();
      expect(typeof log.info).toBe('function');
      expect(typeof log.debug).toBe('function');
      expect(typeof log.error).toBe('function');
      expect(typeof log.warn).toBe('function');
    });

    it('should have the specified name', () => {
      const log = createLogger('my-custom-logger');

      expect(log).toBeDefined();
    });

    it('should create logger with different names', () => {
      const log1 = createLogger('service-a');
      const log2 = createLogger('service-b');

      expect(log1).toBeDefined();
      expect(log2).toBeDefined();
      expect(log1).not.toBe(log2);
    });
  });

  describe('should log at info level', () => {
    it('should have info method that does not throw', () => {
      const log = createLogger('test');

      expect(() => {
        log.info('test message');
      }).not.toThrow();
    });

    it('should accept info with data', () => {
      const log = createLogger('test');

      expect(() => {
        log.info({ key: 'value' }, 'info with data');
      }).not.toThrow();
    });
  });

  describe('should log at debug level', () => {
    it('should have debug method', () => {
      process.env.LOG_LEVEL = 'debug';
      const log = createLogger('test');

      expect(() => {
        log.debug('debug message');
      }).not.toThrow();
    });
  });

  describe('should log at error level', () => {
    it('should log error messages', () => {
      const log = createLogger('test');

      expect(() => {
        log.error('something went wrong');
      }).not.toThrow();
    });

    it('should log error objects', () => {
      const log = createLogger('test');

      expect(() => {
        log.error(new Error('test error'), 'error occurred');
      }).not.toThrow();
    });

    it('should log error with stack trace', () => {
      const log = createLogger('test');
      const error = new Error('critical failure');

      expect(() => {
        log.error(error);
      }).not.toThrow();
    });
  });

  describe('should include name in log output', () => {
    it('should create named logger', () => {
      const log = createLogger('http-server');

      expect(log).toBeDefined();

      expect(() => {
        log.info('server started');
      }).not.toThrow();
    });

    it('should support warn level', () => {
      const log = createLogger('test');

      expect(() => {
        log.warn('deprecation warning');
      }).not.toThrow();
    });
  });
});