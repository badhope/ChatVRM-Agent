// ============================================================
// Service 基类 - 所有服务的抽象基类
// ============================================================

import { logger } from './logger.js';

/**
 * 服务上下文
 * 包含请求的元数据信息
 */
export interface ServiceContext {
  /** 用户ID（可选） */
  userId?: string;
  /** 请求唯一标识 */
  requestId: string;
  /** 请求时间戳 */
  timestamp: number;
}

/**
 * 服务基类
 * 提供通用的服务功能和工具方法
 */
export abstract class BaseService {
  /** 子日志记录器，自动包含服务名称 */
  protected logger = logger.child({ service: this.constructor.name });

  /**
   * 创建新的服务上下文
   * @returns 包含请求ID和时间戳的上下文
   */
  protected createContext(): ServiceContext {
    return {
      requestId: crypto.randomUUID(),
      timestamp: Date.now()
    };
  }

  /**
   * 错误处理包装器
   * 统一捕获和记录服务操作中的错误
   * @param operation 操作名称
   * @param fn 要执行的异步函数
   * @returns 函数执行结果
   * @throws 重新抛出原始错误
   */
  protected async withErrorHandling<T>(
    operation: string,
    fn: () => Promise<T>
  ): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      this.logger.error({ operation, error }, 'Service operation failed');
      throw error;
    }
  }
}
