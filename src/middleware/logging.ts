import { logger } from '../services/logger.js';

/**
 * 记录函数操作的装饰器
 * @param name 操作名称
 * @param fn 被包装的函数
 * @returns 包装后的函数
 */
export function logOperation<T extends (...args: unknown[]) => unknown>(
  name: string,
  fn: T
): T {
  return (async (...args: unknown[]) => {
    const start = Date.now();
    logger.debug({ operation: name, args }, 'Starting operation');
    try {
      const result = await fn(...args);
      logger.info({ operation: name, duration: Date.now() - start }, 'Operation completed');
      return result;
    } catch (error) {
      logger.error({ operation: name, error, duration: Date.now() - start }, 'Operation failed');
      throw error;
    }
  }) as T;
}
