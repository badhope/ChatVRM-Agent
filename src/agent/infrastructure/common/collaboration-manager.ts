import { createLogger } from '../../../services/logger.js';
import { PlanningAgent } from './planning-agent.js';
import { ExecutionAgent } from './execution-agent.js';
import { eventBus } from './event-bus.js';
import type {
  AgentMessage,
  TaskDecompositionRequest,
  TaskDecompositionResponse,
  ExecuteTaskRequest,
  ExecuteTaskResponse,
  TaskStatusUpdate,
  TaskCompleted,
  TaskFailed,
  CollaborationContext,
} from './agent-protocol.js';

const logger = createLogger('CollaborationManager');

export interface CollaborationResult {
  taskId: string;
  success: boolean;
  summary: string;
  durationMs: number;
  subtaskResults: Record<string, string>;
  error?: string;
}

export class CollaborationManager {
  private planningAgent: PlanningAgent;
  private executionAgent: ExecutionAgent;
  private contexts: Map<string, CollaborationContext> = new Map();
  private taskResults: Map<string, CollaborationResult> = new Map();
  private onStatusUpdate?: (taskId: string, status: string, progress?: number) => void;

  constructor() {
    this.planningAgent = new PlanningAgent();
    this.executionAgent = new ExecutionAgent();
    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    eventBus.on('agent-message', (data: unknown) => {
      const message = data as AgentMessage;
      this.handleAgentMessage(message);
    });
  }

  private async handleAgentMessage(message: AgentMessage): Promise<void> {
    logger.debug({ messageType: message.type, taskId: (message as any).taskId }, 'Received agent message');

    switch (message.type) {
      case 'task_decomposition_response':
        await this.executionAgent.handleMessage(message);
        await this.scheduleInitialTasks(message as TaskDecompositionResponse);
        break;

      case 'execute_task_response':
        await this.planningAgent.handleMessage(message);
        break;

      case 'task_status_update':
        await this.planningAgent.handleMessage(message);
        await this.notifyStatusUpdate(message as TaskStatusUpdate);
        break;

      case 'task_completed':
        await this.handleTaskCompleted(message as TaskCompleted);
        break;

      case 'task_failed':
        await this.handleTaskFailed(message as TaskFailed);
        break;

      default:
        logger.warn({ messageType: message.type }, 'Unknown message type');
    }
  }

  private async scheduleInitialTasks(response: TaskDecompositionResponse): Promise<void> {
    const ctx = this.getContext(response.taskId);
    if (!ctx) return;

    ctx.subtasks = response.subtasks;
    ctx.status = 'executing';

    const readyTasks = response.subtasks.filter(subtask => subtask.dependencies.length === 0);
    
    for (const task of readyTasks) {
      const request: ExecuteTaskRequest = {
        type: 'execute_task_request',
        taskId: response.taskId,
        subtask: task,
        context: ctx.sharedContext,
      };
      await this.executionAgent.handleMessage(request);
    }
  }

  private async handleTaskCompleted(message: TaskCompleted): Promise<void> {
    logger.info({ taskId: message.taskId, durationMs: message.durationMs }, 'Task completed');

    const result: CollaborationResult = {
      taskId: message.taskId,
      success: true,
      summary: message.summary,
      durationMs: message.durationMs,
      subtaskResults: message.subtaskResults,
    };

    this.taskResults.set(message.taskId, result);
    
    if (this.onStatusUpdate) {
      this.onStatusUpdate(message.taskId, 'completed', 100);
    }
  }

  private async handleTaskFailed(message: TaskFailed): Promise<void> {
    logger.error({ taskId: message.taskId, error: message.error }, 'Task failed');

    const result: CollaborationResult = {
      taskId: message.taskId,
      success: false,
      summary: message.error,
      durationMs: Date.now() - (this.getContext(message.taskId)?.startTime || Date.now()),
      subtaskResults: message.partialResults || {},
      error: message.error,
    };

    this.taskResults.set(message.taskId, result);
    
    if (this.onStatusUpdate) {
      this.onStatusUpdate(message.taskId, 'failed', 0);
    }
  }

  private async notifyStatusUpdate(update: TaskStatusUpdate): Promise<void> {
    if (this.onStatusUpdate) {
      this.onStatusUpdate(update.taskId, update.status, update.progress);
    }
  }

  async startCollaboration(
    userInput: string,
    intent: string,
    options?: {
      maxDepth?: number;
      maxSubtasks?: number;
      onStatusUpdate?: (taskId: string, status: string, progress?: number) => void;
    }
  ): Promise<CollaborationResult> {
    const taskId = crypto.randomUUID();

    this.onStatusUpdate = options?.onStatusUpdate;

    const ctx: CollaborationContext = {
      taskId,
      userInput,
      intent,
      subtasks: [],
      completedSubtasks: [],
      failedSubtasks: [],
      sharedContext: {},
      startTime: Date.now(),
      status: 'planning',
    };
    this.contexts.set(taskId, ctx);

    if (this.onStatusUpdate) {
      this.onStatusUpdate(taskId, 'planning', 0);
    }

    const request: TaskDecompositionRequest = {
      type: 'task_decomposition_request',
      taskId,
      userInput,
      intent,
      maxDepth: options?.maxDepth ?? 3,
      maxSubtasks: options?.maxSubtasks ?? 20,
    };

    await this.planningAgent.handleMessage(request);

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        resolve({
          taskId,
          success: false,
          summary: '任务超时',
          durationMs: Date.now() - ctx.startTime,
          subtaskResults: {},
          error: '任务执行超时',
        });
      }, 5 * 60 * 1000);

      const checkInterval = setInterval(() => {
        const result = this.taskResults.get(taskId);
        if (result) {
          clearTimeout(timeout);
          clearInterval(checkInterval);
          resolve(result);
        }
      }, 100);
    });
  }

  private getContext(taskId: string): CollaborationContext | undefined {
    return this.contexts.get(taskId);
  }

  getTaskResult(taskId: string): CollaborationResult | undefined {
    return this.taskResults.get(taskId);
  }

  getPlanningAgent(): PlanningAgent {
    return this.planningAgent;
  }

  getExecutionAgent(): ExecutionAgent {
    return this.executionAgent;
  }

  getAllContexts(): Map<string, CollaborationContext> {
    return this.contexts;
  }

  clearContext(taskId: string): void {
    this.contexts.delete(taskId);
    this.taskResults.delete(taskId);
  }

  clearAllContexts(): void {
    this.contexts.clear();
    this.taskResults.clear();
  }
}