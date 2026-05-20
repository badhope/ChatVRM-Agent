/**
 * 错误处理器模块
 *
 * 提供 Agent 执行过程中的错误处理能力，包括：
 * 1. 错误分类与记录
 * 2. 自动恢复策略（重试、回退、回滚等）
 * 3. 错误信息脱敏
 * 4. 错误日志与统计
 */

import { toolRegistry } from '../tools/registry.js';
import { RETRY_DELAYS, MAX_RETRIES } from '../constants/index.js';
import { createLogger } from '../services/logger.js';

const logger = createLogger('error-handler');

// 从子模块导入类型
import type {
  ErrorType,
  ErrorRecovery,
  ErrorRecord,
  SafeErrorResponse,
  TaskContext,
  HistoryEntry,
} from './error-types.js';

// Re-export 所有类型
export type {
  ErrorType,
  ErrorRecovery,
  ErrorRecord,
  SafeErrorResponse,
  TaskContext,
  HistoryEntry,
};

/**
 * Tool information from registry
 */
interface ToolInfo {
  name: string;
  description?: string;
}

export class ErrorHandler {
  private errorLog: ErrorRecord[] = [];
  private showDetailedErrors = false;

  setShowDetailedErrors(show: boolean): void {
    this.showDetailedErrors = show;
  }

  sanitizeErrorMessage(message: string): string {
    const patterns = [
      { regex: /(\/[a-zA-Z0-9_\/.-]+)/g, replacement: '[path]' },
      { regex: /([a-zA-Z]:\\[a-zA-Z0-9_\\\/.-]+)/g, replacement: '[path]' },
      { regex: /(\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b)/g, replacement: '[email]' },
      { regex: /(\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b)/g, replacement: '[ip]' },
      { regex: /(\b[A-Za-z0-9]{32,}\b)/g, replacement: '[token]' },
      { regex: /(password|secret|key|token|api[_-]?key)/gi, replacement: '[credential]' }
    ];

    let sanitized = message;
    for (const pattern of patterns) {
      sanitized = sanitized.replace(pattern.regex, pattern.replacement);
    }

    return sanitized;
  }

  formatSafeError(error: Error): SafeErrorResponse {
    const type = this.classifyError(error);

    return {
      success: false,
      error: this.sanitizeErrorMessage(this.showDetailedErrors ? error.message : 'An error occurred'),
      code: type,
      timestamp: new Date().toISOString()
    };
  }

  async handle(error: Error, context: TaskContext): Promise<ErrorRecovery> {
    const errorType = this.classifyError(error);

    this.logError(error, errorType, context);

    switch (errorType) {
      case 'tool_timeout':
        return this.handleTimeout(error, context);
      case 'tool_not_found':
        return this.handleToolNotFound(error, context);
      case 'validation_error':
        return this.handleValidationError(error, context);
      case 'dependency_error':
        return this.handleDependencyError(error, context);
      case 'skill_not_found':
        return this.handleSkillNotFound(error, context);
      case 'execution_error':
        return this.handleExecutionError(error, context);
      default:
        return this.handleUnknownError(error, context);
    }
  }

  private classifyError(error: Error): ErrorType {
    const message = error.message.toLowerCase();

    if (message.includes('timeout')) return 'tool_timeout';
    if (message.includes('not found') && message.includes('tool')) return 'tool_not_found';
    if (message.includes('validation') || message.includes('invalid')) return 'validation_error';
    if (message.includes('dependency') || message.includes('depend')) return 'dependency_error';
    if (message.includes('skill') && message.includes('not found')) return 'skill_not_found';
    if (message.includes('execution') || message.includes('failed')) return 'execution_error';

    return 'unknown_error';
  }

  private async handleTimeout(error: Error, context: TaskContext): Promise<ErrorRecovery> {
    const retryCount = (context.results['__retryCount__'] as number) || 0;

    if (retryCount < MAX_RETRIES) {
      context.results['__retryCount__'] = retryCount + 1;
      const delay = RETRY_DELAYS[retryCount] ?? 4000;

      logger.info(`Timeout retry ${retryCount + 1}/${MAX_RETRIES}, delay ${delay}ms`);

      return {
        action: 'retry',
        delay,
        message: `Tool timeout, retry attempt ${retryCount + 1}`
      };
    }

    const fallback = await this.findFallbackTool(context);
    if (fallback) {
      return {
        action: 'fallback',
        fallbackTool: fallback,
        message: 'Timeout exceeded, switching to fallback tool'
      };
    }

    return {
      action: 'request_input',
      message: '工具执行超时且无备用方案，请提供更多信息'
    };
  }

  private async handleToolNotFound(error: Error, context: TaskContext): Promise<ErrorRecovery> {
    const alternatives = await this.findAlternativeTools(context.description);

    if (alternatives.length > 0) {
      const alt = alternatives[0];
      return {
        action: 'switch_tool',
        switchToTool: { serverId: 'builtin', toolId: alt },
        message: `Tool not found, switching to alternative: ${alt}`
      };
    }

    return {
      action: 'skip',
      message: `工具不存在且无替代方案，跳过此步骤: ${error.message}`
    };
  }

  private async findAlternativeTools(description: string): Promise<string[]> {
    const tools = toolRegistry.listTools();
    const keywords = description.toLowerCase().split(/\s+/);

    return tools
      .filter((tool: ToolInfo) => {
        const toolLower = tool.name.toLowerCase();
        return keywords.some(kw => toolLower.includes(kw));
      })
      .map((tool: ToolInfo) => tool.name)
      .slice(0, 3);
  }

  private handleValidationError(error: Error, context: TaskContext): ErrorRecovery {
    return {
      action: 'request_input',
      message: `参数验证失败，请提供必要信息: ${error.message}`
    };
  }

  private handleDependencyError(error: Error, context: TaskContext): ErrorRecovery {
    return {
      action: 'rollback',
      stepId: context.history.length > 0 ? context.history[context.history.length - 1].skillName : undefined,
      message: `依赖错误，回滚到上一步: ${error.message}`
    };
  }

  private handleSkillNotFound(error: Error, context: TaskContext): ErrorRecovery {
    return {
      action: 'skip',
      message: `技能不存在，跳过: ${error.message}`
    };
  }

  private handleExecutionError(error: Error, context: TaskContext): ErrorRecovery {
    const retryCount = (context.results['__retryCount__'] as number) || 0;

    if (retryCount < MAX_RETRIES) {
      context.results['__retryCount__'] = retryCount + 1;
      const delay = RETRY_DELAYS[retryCount] ?? 4000;

      logger.info(`Execution error retry ${retryCount + 1}/${MAX_RETRIES}`);

      return {
        action: 'retry',
        delay,
        message: `Execution error, retry attempt ${retryCount + 1}`
      };
    }

    return {
      action: 'fail',
      message: `执行失败且已达到最大重试次数: ${error.message}`
    };
  }

  private handleUnknownError(error: Error, context: TaskContext): ErrorRecovery {
    return {
      action: 'fail',
      message: `未知错误: ${error.message}`
    };
  }

  private async findFallbackTool(context: TaskContext): Promise<{ serverId: string; toolId: string } | null> {
    const alternatives = await this.findAlternativeTools(context.description);

    if (alternatives.length > 1) {
      return { serverId: 'builtin', toolId: alternatives[1] };
    }

    return null;
  }

  private logError(error: Error, type: ErrorType, context: TaskContext): void {
    const record: ErrorRecord = {
      timestamp: new Date(),
      errorType: type,
      message: error.message,
      context: {
        id: context.id,
        description: context.description,
        complexity: context.complexity,
        currentSkill: context.currentSkill,
        history: context.history.slice(-5),
        results: {}
      },
      stack: error.stack
    };

    this.errorLog.push(record);
    logger.error({ errorType: type, message: error.message }, error.message);
  }

  async applyRecovery(recovery: ErrorRecovery, context: TaskContext): Promise<boolean> {
    switch (recovery.action) {
      case 'retry':
        if (recovery.delay) {
          await this.sleep(recovery.delay);
        }
        return true;

      case 'fallback':
        logger.info(`Switching to fallback tool: ${recovery.fallbackTool}`);
        return true;

      case 'switch_tool':
        logger.info(`Switching tool: ${recovery.switchToTool}`);
        return true;

      case 'rollback':
        logger.info(`Rolling back to: ${recovery.stepId}`);
        if (recovery.stepId) {
          const stepIndex = context.history.findIndex((h: HistoryEntry) => h.skillName === recovery.stepId);
          if (stepIndex >= 0) {
            context.history = context.history.slice(0, stepIndex);
          }
        }
        return true;

      case 'skip':
        logger.info('Skipping step');
        return true;

      case 'request_input':
        logger.info(`User input required: ${recovery.message}`);
        return false;

      case 'fail':
        logger.error({ message: recovery.message }, `Task failed: ${recovery.message}`);
        return false;
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  getErrorLog(): ErrorRecord[] {
    return [...this.errorLog];
  }

  getErrorStats(): {
    total: number;
    byType: Record<ErrorType, number>;
    lastError?: ErrorRecord;
  } {
    const byType: Record<ErrorType, number> = {
      'tool_timeout': 0,
      'tool_not_found': 0,
      'validation_error': 0,
      'execution_error': 0,
      'dependency_error': 0,
      'skill_not_found': 0,
      'unknown_error': 0
    };

    for (const record of this.errorLog) {
      byType[record.errorType]++;
    }

    return {
      total: this.errorLog.length,
      byType,
      lastError: this.errorLog[this.errorLog.length - 1]
    };
  }

  clearLog(): void {
    this.errorLog = [];
  }
}

export const errorHandler = new ErrorHandler();
