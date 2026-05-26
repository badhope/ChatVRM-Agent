/**
 * 错误处理器 - 类型定义
 *
 * 包含错误处理系统所需的所有接口和类型定义。
 */

// ==================== 类型与接口 ====================

/**
 * 错误类型枚举
 */
export type ErrorType =
  | 'tool_timeout'
  | 'tool_not_found'
  | 'validation_error'
  | 'execution_error'
  | 'dependency_error'
  | 'skill_not_found'
  | 'unknown_error';

/**
 * 错误恢复策略接口
 */
export interface ErrorRecovery {
  action: 'retry' | 'fallback' | 'switch_tool' | 'rollback' | 'request_input' | 'skip' | 'fail';
  delay?: number;
  fallbackTool?: { serverId: string; toolId: string };
  switchToTool?: { serverId: string; toolId: string };
  stepId?: string;
  message?: string;
}

/**
 * History entry for task execution
 */
export interface HistoryEntry {
  skillName: string;
  timestamp?: Date;
  status?: 'success' | 'failed' | 'pending';
  result?: unknown;
}

/**
 * 错误记录接口
 */
export interface ErrorRecord {
  timestamp: Date;
  errorType: ErrorType;
  message: string;
  context: {
    id: string;
    description: string;
    complexity?: string;
    currentSkill?: string;
    history: HistoryEntry[];
    results: Record<string, unknown>;
  };
  stack?: string;
}

/**
 * 安全错误响应接口
 */
export interface SafeErrorResponse {
  success: boolean;
  error: string;
  code?: string;
  timestamp: string;
}

/**
 * 任务上下文接口
 */
export interface TaskContext {
  id: string;
  description: string;
  complexity?: string;
  currentSkill?: string;
  history: HistoryEntry[];
  results: Record<string, unknown>;
}
