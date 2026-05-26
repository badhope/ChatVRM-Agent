/**
 * 上下文管理领域模型
 */

/**
 * 上下文消息接口
 */
export interface ContextMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
  timestamp: number;
  /** 0-1，用于智能截断 */
  importance?: number;
}
