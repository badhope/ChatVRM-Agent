import { createLogger } from '../../../services/logger.js';
import { eventBus } from './event-bus.js';
import { executeToolStep, executeReasoningStep } from '../core/tool-executor.js';
import { callLLM } from './llm-caller.js';
import { EXECUTION_AGENT_PROMPT } from './prompts.js';
import type { ToolResult } from '../core/types.js';
import type {
  AgentMessage,
  TaskDecompositionResponse,
  ExecuteTaskRequest,
  ExecuteTaskResponse,
  TaskStatusUpdate,
  SubTask,
} from './agent-protocol.js';

const logger = createLogger('ExecutionAgent');

interface LLMExecutionDecision {
  decision: 'execute' | 'retry' | 'skip' | 'request_info';
  tool?: string;
  args?: Record<string, unknown>;
  reason: string;
  contextUpdates?: Record<string, unknown>;
}

interface ExecutionHistory {
  subtaskId: string;
  attempt: number;
  result?: ToolResult;
  error?: string;
  timestamp: number;
}

export class ExecutionAgent {
  private agentId: string;
  private messageHandlers: Map<string, (msg: AgentMessage) => Promise<void>>;
  private runningTasks: Map<string, SubTask> = new Map();
  private executionHistory: Map<string, ExecutionHistory[]> = new Map();
  private maxRetries: number = 3;

  constructor(agentId: string = 'execution-agent') {
    this.agentId = agentId;
    this.messageHandlers = this.setupMessageHandlers();
  }

  private setupMessageHandlers(): Map<string, (msg: AgentMessage) => Promise<void>> {
    const handlers = new Map<string, (msg: AgentMessage) => Promise<void>>();
    handlers.set('task_decomposition_response', (msg: AgentMessage) => 
      this.handleDecompositionResponse(msg as TaskDecompositionResponse));
    handlers.set('execute_task_request', (msg: AgentMessage) => 
      this.handleExecuteRequest(msg as ExecuteTaskRequest));
    return handlers;
  }

  async handleMessage(message: AgentMessage): Promise<void> {
    const handler = this.messageHandlers.get(message.type);
    if (!handler) {
      logger.warn({ messageType: message.type }, 'Unknown message type');
      return;
    }

    await handler(message);
  }

  private async handleDecompositionResponse(message: TaskDecompositionResponse): Promise<void> {
    logger.info({ taskId: message.taskId, subtaskCount: message.subtasks.length }, 'Received task decomposition');
    
    for (const subtask of message.subtasks) {
      if (!subtask.tool) {
        logger.debug({ subtaskId: subtask.id }, 'Skipping reasoning task in decomposition response');
        continue;
      }
      this.runningTasks.set(subtask.id, subtask);
    }
  }

  private async handleExecuteRequest(message: ExecuteTaskRequest): Promise<void> {
    logger.info({ taskId: message.taskId, subtaskId: message.subtask.id }, 'Received execute request');

    const subtask = message.subtask;
    this.runningTasks.set(subtask.id, subtask);

    await this.sendStatusUpdate(message.taskId, subtask.id, 'running', 0, '开始执行');

    try {
      const result = await this.executeSubtask(subtask, message.context);

      await this.sendStatusUpdate(message.taskId, subtask.id, 'completed', 100, '执行完成');

      const response: ExecuteTaskResponse = {
        type: 'execute_task_response',
        taskId: message.taskId,
        subtaskId: subtask.id,
        success: result.success,
        result: result.output,
        error: result.error,
        context: message.context,
        durationMs: result.duration,
      };

      await this.sendMessage(response);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      await this.sendStatusUpdate(message.taskId, subtask.id, 'failed', 0, errorMessage);

      const response: ExecuteTaskResponse = {
        type: 'execute_task_response',
        taskId: message.taskId,
        subtaskId: subtask.id,
        success: false,
        error: errorMessage,
      };

      await this.sendMessage(response);
    } finally {
      this.runningTasks.delete(subtask.id);
    }
  }

  private async executeSubtask(
    subtask: SubTask,
    context?: Record<string, unknown>
  ): Promise<ToolResult> {
    const startTime = Date.now();
    const history = this.getHistory(subtask.id);
    const attempt = history.length + 1;

    // 首先尝试使用 LLM 进行智能决策
    let finalSubtask = subtask;
    try {
      const decision = await this.makeExecutionDecision(subtask, context, history);
      if (decision.decision === 'skip') {
        logger.info({ subtaskId: subtask.id, reason: decision.reason }, '任务跳过');
        return {
          success: true,
          output: `任务跳过: ${decision.reason}`,
          error: undefined,
          duration: Date.now() - startTime,
        };
      } else if (decision.decision === 'request_info') {
        logger.info({ subtaskId: subtask.id, reason: decision.reason }, '请求更多信息');
        // 可以在这里实现请求更多信息的逻辑
      } else if (decision.tool && decision.args) {
        // 使用 LLM 推荐的工具和参数
        finalSubtask = {
          ...subtask,
          tool: decision.tool,
          args: decision.args,
        };
        // 更新上下文
        if (decision.contextUpdates) {
          Object.assign(context || {}, decision.contextUpdates);
        }
      }
    } catch (error) {
      logger.warn({ error: error instanceof Error ? error.message : String(error) }, 'LLM 决策失败，使用原始任务');
    }

    const commonOptions = {
      taskId: finalSubtask.id,
      userInput: finalSubtask.description,
      onOutput: (text: string) => logger.debug({ subtaskId: finalSubtask.id, output: text }, 'Task output'),
      getContext: async () => (context ? [JSON.stringify(context)] : []),
    };

    let result: ToolResult;

    if (finalSubtask.tool) {
      result = await executeToolStep(
        {
          id: parseInt(finalSubtask.id.replace('subtask-', '')),
          description: finalSubtask.description,
          tool: finalSubtask.tool,
          args: finalSubtask.args as Record<string, string>,
          status: 'running',
        },
        0,
        context || {},
        commonOptions
      );
    } else {
      result = await executeReasoningStep(
        {
          id: parseInt(finalSubtask.id.replace('subtask-', '')),
          description: finalSubtask.description,
          status: 'running',
        },
        0,
        commonOptions
      );
    }

    result.duration = Date.now() - startTime;

    // 记录执行历史
    this.recordHistory(finalSubtask.id, attempt, result);

    // 如果失败且未达重试上限，考虑重试
    if (!result.success && attempt < this.maxRetries) {
      const shouldRetry = await this.shouldRetry(finalSubtask, result, history);
      if (shouldRetry) {
        logger.info({ subtaskId: finalSubtask.id, attempt: attempt + 1 }, '执行重试');
        return this.executeSubtask(finalSubtask, context);
      }
    }

    return result;
  }

  private async makeExecutionDecision(
    subtask: SubTask,
    context?: Record<string, unknown>,
    history?: ExecutionHistory[]
  ): Promise<LLMExecutionDecision> {
    const historyText = history && history.length > 0
      ? `\n\n执行历史：\n${history.map(h => `尝试 ${h.attempt}: ${h.error ? '失败 - ' + h.error : '成功'}`).join('\n')}`
      : '';

    const userMessage = `请分析并决策如何执行以下任务：

任务描述：${subtask.description}
指定工具：${subtask.tool || '无'}
当前上下文：${JSON.stringify(context || {})}${historyText}

请输出JSON格式的决策结果。`;

    const messages = [
      { role: 'system' as const, content: EXECUTION_AGENT_PROMPT },
      { role: 'user' as const, content: userMessage },
    ];

    const response = await callLLM(messages, { temperature: 0.3, maxTokens: 1024 });
    return this.parseExecutionDecision(response);
  }

  private parseExecutionDecision(response: string): LLMExecutionDecision {
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return { decision: 'execute', reason: '解析失败，直接执行' };
      }

      const parsed = JSON.parse(jsonMatch[0]);
      return {
        decision: parsed.decision || 'execute',
        tool: parsed.tool,
        args: parsed.args,
        reason: parsed.reason || '执行任务',
        contextUpdates: parsed.contextUpdates,
      };
    } catch {
      return { decision: 'execute', reason: '解析失败，直接执行' };
    }
  }

  private async shouldRetry(
    subtask: SubTask,
    result: ToolResult,
    history: ExecutionHistory[]
  ): Promise<boolean> {
    // 简单的重试策略：除了永久性错误都重试
    const permanentErrors = ['权限不足', '文件不存在', '无效的参数'];
    const errorMsg = result.error || '';

    return !permanentErrors.some(err => errorMsg.includes(err));
  }

  private getHistory(subtaskId: string): ExecutionHistory[] {
    return this.executionHistory.get(subtaskId) || [];
  }

  private recordHistory(
    subtaskId: string,
    attempt: number,
    result: ToolResult
  ): void {
    const history = this.getHistory(subtaskId);
    history.push({
      subtaskId,
      attempt,
      result,
      error: result.error,
      timestamp: Date.now(),
    });
    this.executionHistory.set(subtaskId, history);
  }

  private async sendStatusUpdate(
    taskId: string,
    subtaskId: string,
    status: SubTask['status'],
    progress: number,
    message: string
  ): Promise<void> {
    const update: TaskStatusUpdate = {
      type: 'task_status_update',
      taskId,
      subtaskId,
      status,
      progress,
      message,
      timestamp: Date.now(),
    };

    await this.sendMessage(update);
  }

  private async sendMessage(message: AgentMessage): Promise<void> {
    eventBus.emit('agent-message', message);
  }

  getAgentId(): string {
    return this.agentId;
  }

  getRunningTaskCount(): number {
    return this.runningTasks.size;
  }

  getRunningTasks(): SubTask[] {
    return Array.from(this.runningTasks.values());
  }
}