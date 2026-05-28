import { createLogger } from '../../../services/logger.js';
import { eventBus } from './event-bus.js';
import { callLLM } from './llm-caller.js';
import { PLANNING_AGENT_PROMPT } from './prompts.js';
import type {
  AgentMessage,
  TaskDecompositionRequest,
  TaskDecompositionResponse,
  ExecuteTaskRequest,
  ExecuteTaskResponse,
  TaskStatusUpdate,
  TaskCompleted,
  TaskFailed,
  SubTask,
  CollaborationContext,
} from './agent-protocol.js';

const logger = createLogger('PlanningAgent');

interface LLMDecompositionResponse {
  subtasks: Array<{
    id: string;
    description: string;
    tool?: string;
    args?: Record<string, unknown>;
    dependencies: string[];
    priority: number;
    estimatedTimeMs?: number;
  }>;
  strategy: string;
  estimatedTotalTimeMs: number;
}

interface DecompositionSubTask {
  id: string;
  description: string;
  tool?: string;
  dependencies: string[];
  status: 'pending';
}

export class PlanningAgent {
  private agentId: string;
  private collaborationContexts: Map<string, CollaborationContext> = new Map();
  private messageHandlers: Map<string, (msg: AgentMessage, ctx: CollaborationContext) => Promise<void>>;

  constructor(agentId: string = 'planning-agent') {
    this.agentId = agentId;
    this.messageHandlers = this.setupMessageHandlers();
  }

  private setupMessageHandlers(): Map<string, (msg: AgentMessage, ctx: CollaborationContext) => Promise<void>> {
    const handlers = new Map<string, (msg: AgentMessage, ctx: CollaborationContext) => Promise<void>>();
    handlers.set('task_decomposition_request', (msg: AgentMessage, ctx: CollaborationContext) => 
      this.handleDecompositionRequest(msg as TaskDecompositionRequest, ctx));
    handlers.set('execute_task_response', (msg: AgentMessage, ctx: CollaborationContext) => 
      this.handleExecuteResponse(msg as ExecuteTaskResponse, ctx));
    handlers.set('task_status_update', (msg: AgentMessage, ctx: CollaborationContext) => 
      this.handleStatusUpdate(msg as TaskStatusUpdate, ctx));
    handlers.set('task_completed', (msg: AgentMessage, ctx: CollaborationContext) => 
      this.handleTaskCompleted(msg as TaskCompleted, ctx));
    handlers.set('task_failed', (msg: AgentMessage, ctx: CollaborationContext) => 
      this.handleTaskFailed(msg as TaskFailed, ctx));
    return handlers;
  }

  async handleMessage(message: AgentMessage): Promise<void> {
    const handler = this.messageHandlers.get(message.type);
    if (!handler) {
      logger.warn({ messageType: message.type }, 'Unknown message type');
      return;
    }

    const ctx = this.getOrCreateContext((message as any).taskId);
    await handler(message, ctx);
  }

  private getOrCreateContext(taskId: string): CollaborationContext {
    let ctx = this.collaborationContexts.get(taskId);
    if (!ctx) {
      ctx = {
        taskId,
        userInput: '',
        intent: 'general',
        subtasks: [],
        completedSubtasks: [],
        failedSubtasks: [],
        sharedContext: {},
        startTime: Date.now(),
        status: 'planning',
      };
      this.collaborationContexts.set(taskId, ctx);
    }
    return ctx;
  }

  private async handleDecompositionRequest(
    message: TaskDecompositionRequest,
    ctx: CollaborationContext
  ): Promise<void> {
    logger.info({ taskId: message.taskId, userInput: message.userInput }, 'Received task decomposition request');

    ctx.userInput = message.userInput;
    ctx.intent = message.intent;

    const subtasks = await this.decomposeTask(
      message.userInput,
      message.intent,
      message.maxDepth ?? 3,
      message.maxSubtasks ?? 20
    );

    ctx.subtasks = subtasks;
    ctx.status = 'planning';

    const response: TaskDecompositionResponse = {
      type: 'task_decomposition_response',
      taskId: message.taskId,
      subtasks,
      strategy: this.generateStrategy(subtasks),
      estimatedTotalTimeMs: this.estimateTotalTime(subtasks),
    };

    logger.info({ taskId: message.taskId, subtaskCount: subtasks.length }, 'Task decomposition completed');
    await this.sendMessage(response);
  }

  private async decomposeTask(
    userInput: string,
    intent: string,
    maxDepth: number,
    maxSubtasks: number
  ): Promise<SubTask[]> {
    // 首先尝试使用 LLM 进行智能任务分解
    try {
      const llmSubtasks = await this.decomposeTaskWithLLM(userInput, intent, maxSubtasks);
      if (llmSubtasks.length > 0) {
        logger.info({ count: llmSubtasks.length }, 'LLM 任务分解成功');
        return llmSubtasks;
      }
    } catch (error) {
      logger.warn({ error: error instanceof Error ? error.message : String(error) }, 'LLM 任务分解失败，回退到规则模式');
    }

    // 如果 LLM 失败，回退到规则模式
    return this.decomposeTaskWithRules(userInput, intent, maxSubtasks);
  }

  private async decomposeTaskWithLLM(
    userInput: string,
    intent: string,
    maxSubtasks: number
  ): Promise<SubTask[]> {
    const userMessage = `请分解以下任务：
任务描述：${userInput}
任务意图：${intent}
最大子任务数：${maxSubtasks}

请输出JSON格式的任务分解结果。`;

    const messages = [
      { role: 'system' as const, content: PLANNING_AGENT_PROMPT },
      { role: 'user' as const, content: userMessage },
    ];

    const response = await callLLM(messages, { temperature: 0.3, maxTokens: 2048 });

    // 解析 LLM 响应
    const parsed = this.parseLLMDecompositionResponse(response);

    if (!parsed || parsed.subtasks.length === 0) {
      throw new Error('LLM 返回无效的任务分解结果');
    }

    // 转换为标准格式
    return parsed.subtasks
      .slice(0, maxSubtasks)
      .map((subtask, index) => ({
        id: subtask.id,
        description: subtask.description,
        tool: subtask.tool,
        args: subtask.args,
        dependencies: subtask.dependencies,
        priority: subtask.priority || index + 1,
        estimatedTimeMs: subtask.estimatedTimeMs,
        status: 'pending' as const,
      }));
  }

  private parseLLMDecompositionResponse(response: string): LLMDecompositionResponse | null {
    try {
      // 尝试提取 JSON
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return null;
      }

      const parsed = JSON.parse(jsonMatch[0]);

      // 验证必要字段
      if (!parsed.subtasks || !Array.isArray(parsed.subtasks)) {
        return null;
      }

      return {
        subtasks: parsed.subtasks,
        strategy: parsed.strategy || 'LLM 生成的执行策略',
        estimatedTotalTimeMs: parsed.estimatedTotalTimeMs || 30000,
      };
    } catch {
      return null;
    }
  }

  private decomposeTaskWithRules(
    userInput: string,
    intent: string,
    maxSubtasks: number
  ): Promise<SubTask[]> {
    const subtasks: SubTask[] = [];

    const decompositionPatterns: Record<string, (input: string) => DecompositionSubTask[]> = {
      'bug-hunter': this.decomposeBugFixTask.bind(this),
      'fullstack': this.decomposeDevelopmentTask.bind(this),
      'documentation': this.decomposeDocumentationTask.bind(this),
      'code-review': this.decomposeReviewTask.bind(this),
      'search': this.decomposeSearchTask.bind(this),
      'devops': this.decomposeDevopsTask.bind(this),
      'testing': this.decomposeTestingTask.bind(this),
      'refactor': this.decomposeRefactorTask.bind(this),
      'security': this.decomposeSecurityTask.bind(this),
      'database': this.decomposeDatabaseTask.bind(this),
    };

    const decomposer = decompositionPatterns[intent] || this.decomposeGeneralTask.bind(this);
    const baseSubtasks = decomposer(userInput);

    for (let index = 0; index < baseSubtasks.length && subtasks.length < maxSubtasks; index++) {
      const subtask = baseSubtasks[index];
      subtasks.push({
        ...subtask,
        priority: index + 1,
        dependencies: this.calculateDependencies(subtask),
      } as SubTask);
    }

    return Promise.resolve(subtasks);
  }

  private decomposeBugFixTask(input: string): DecompositionSubTask[] {
    return [
      { id: 'subtask-1', description: '搜索相关代码', tool: 'search_files', dependencies: [], status: 'pending' },
      { id: 'subtask-2', description: '定位问题位置', dependencies: ['subtask-1'], status: 'pending' },
      { id: 'subtask-3', description: '分析错误原因', dependencies: ['subtask-2'], status: 'pending' },
      { id: 'subtask-4', description: '制定修复方案', dependencies: ['subtask-3'], status: 'pending' },
      { id: 'subtask-5', description: '执行修复', tool: 'write_file', dependencies: ['subtask-4'], status: 'pending' },
      { id: 'subtask-6', description: '验证修复效果', tool: 'shell', dependencies: ['subtask-5'], status: 'pending' },
    ];
  }

  private decomposeDevelopmentTask(input: string): DecompositionSubTask[] {
    return [
      { id: 'subtask-1', description: '分析需求', dependencies: [], status: 'pending' },
      { id: 'subtask-2', description: '设计实现方案', dependencies: ['subtask-1'], status: 'pending' },
      { id: 'subtask-3', description: '编写代码', tool: 'write_file', dependencies: ['subtask-2'], status: 'pending' },
      { id: 'subtask-4', description: '编写测试', tool: 'write_file', dependencies: ['subtask-3'], status: 'pending' },
      { id: 'subtask-5', description: '运行测试', tool: 'shell', dependencies: ['subtask-4'], status: 'pending' },
    ];
  }

  private decomposeDocumentationTask(input: string): DecompositionSubTask[] {
    return [
      { id: 'subtask-1', description: '确认目标路径', dependencies: [], status: 'pending' },
      { id: 'subtask-2', description: '收集相关信息', dependencies: ['subtask-1'], status: 'pending' },
      { id: 'subtask-3', description: '生成文档内容', dependencies: ['subtask-2'], status: 'pending' },
      { id: 'subtask-4', description: '写入文件', tool: 'write_file', dependencies: ['subtask-3'], status: 'pending' },
      { id: 'subtask-5', description: '验证格式', tool: 'read_file', dependencies: ['subtask-4'], status: 'pending' },
    ];
  }

  private decomposeReviewTask(input: string): DecompositionSubTask[] {
    return [
      { id: 'subtask-1', description: '读取代码内容', tool: 'read_file', dependencies: [], status: 'pending' },
      { id: 'subtask-2', description: '代码质量分析', dependencies: ['subtask-1'], status: 'pending' },
      { id: 'subtask-3', description: '安全漏洞检查', dependencies: ['subtask-1'], status: 'pending' },
      { id: 'subtask-4', description: '性能评估', dependencies: ['subtask-1'], status: 'pending' },
      { id: 'subtask-5', description: '生成审查报告', dependencies: ['subtask-2', 'subtask-3', 'subtask-4'], status: 'pending' },
    ];
  }

  private decomposeSearchTask(input: string): DecompositionSubTask[] {
    return [
      { id: 'subtask-1', description: '分析搜索需求', dependencies: [], status: 'pending' },
      { id: 'subtask-2', description: '执行关键词搜索', tool: 'search_files', dependencies: ['subtask-1'], status: 'pending' },
      { id: 'subtask-3', description: '定位目标文件', tool: 'read_file', dependencies: ['subtask-2'], status: 'pending' },
      { id: 'subtask-4', description: '分析搜索结果', dependencies: ['subtask-3'], status: 'pending' },
    ];
  }

  private decomposeDevopsTask(input: string): DecompositionSubTask[] {
    return [
      { id: 'subtask-1', description: '检查环境配置', dependencies: [], status: 'pending' },
      { id: 'subtask-2', description: '验证依赖版本', tool: 'shell', dependencies: ['subtask-1'], status: 'pending' },
      { id: 'subtask-3', description: '执行部署命令', tool: 'shell', dependencies: ['subtask-2'], status: 'pending' },
      { id: 'subtask-4', description: '验证部署结果', tool: 'shell', dependencies: ['subtask-3'], status: 'pending' },
    ];
  }

  private decomposeTestingTask(input: string): DecompositionSubTask[] {
    return [
      { id: 'subtask-1', description: '分析测试需求', dependencies: [], status: 'pending' },
      { id: 'subtask-2', description: '编写测试用例', tool: 'write_file', dependencies: ['subtask-1'], status: 'pending' },
      { id: 'subtask-3', description: '执行测试', tool: 'shell', dependencies: ['subtask-2'], status: 'pending' },
      { id: 'subtask-4', description: '分析测试结果', dependencies: ['subtask-3'], status: 'pending' },
    ];
  }

  private decomposeRefactorTask(input: string): DecompositionSubTask[] {
    return [
      { id: 'subtask-1', description: '读取代码内容', tool: 'read_file', dependencies: [], status: 'pending' },
      { id: 'subtask-2', description: '识别代码坏味道', dependencies: ['subtask-1'], status: 'pending' },
      { id: 'subtask-3', description: '制定重构方案', dependencies: ['subtask-2'], status: 'pending' },
      { id: 'subtask-4', description: '执行重构', tool: 'write_file', dependencies: ['subtask-3'], status: 'pending' },
      { id: 'subtask-5', description: '验证重构结果', tool: 'shell', dependencies: ['subtask-4'], status: 'pending' },
    ];
  }

  private decomposeSecurityTask(input: string): DecompositionSubTask[] {
    return [
      { id: 'subtask-1', description: '读取代码内容', tool: 'read_file', dependencies: [], status: 'pending' },
      { id: 'subtask-2', description: '扫描安全漏洞', dependencies: ['subtask-1'], status: 'pending' },
      { id: 'subtask-3', description: '分析风险等级', dependencies: ['subtask-2'], status: 'pending' },
      { id: 'subtask-4', description: '生成安全报告', dependencies: ['subtask-3'], status: 'pending' },
    ];
  }

  private decomposeDatabaseTask(input: string): DecompositionSubTask[] {
    return [
      { id: 'subtask-1', description: '分析数据库需求', dependencies: [], status: 'pending' },
      { id: 'subtask-2', description: '编写 SQL 脚本', dependencies: ['subtask-1'], status: 'pending' },
      { id: 'subtask-3', description: '执行数据库命令', tool: 'shell', dependencies: ['subtask-2'], status: 'pending' },
      { id: 'subtask-4', description: '验证执行结果', dependencies: ['subtask-3'], status: 'pending' },
    ];
  }

  private decomposeGeneralTask(input: string): DecompositionSubTask[] {
    return [
      { id: 'subtask-1', description: '分析用户需求', dependencies: [], status: 'pending' },
      { id: 'subtask-2', description: '制定执行计划', dependencies: ['subtask-1'], status: 'pending' },
      { id: 'subtask-3', description: '执行主要步骤', dependencies: ['subtask-2'], status: 'pending' },
      { id: 'subtask-4', description: '验证结果', dependencies: ['subtask-3'], status: 'pending' },
    ];
  }

  private calculateDependencies(subtask: DecompositionSubTask): string[] {
    return subtask.dependencies || [];
  }

  private generateStrategy(subtasks: SubTask[]): string {
    const toolTasks = subtasks.filter(s => s.tool).length;
    const reasoningTasks = subtasks.length - toolTasks;
    
    return `顺序执行策略: ${subtasks.length} 个子任务，其中 ${toolTasks} 个工具执行任务，${reasoningTasks} 个推理任务。`;
  }

  private estimateTotalTime(subtasks: SubTask[]): number {
    const avgToolTime = 5000;
    const avgReasoningTime = 3000;
    
    return subtasks.reduce((acc, subtask) => {
      if (subtask.tool) return acc + avgToolTime;
      return acc + avgReasoningTime;
    }, 0);
  }

  private async handleExecuteResponse(
    message: ExecuteTaskResponse,
    ctx: CollaborationContext
  ): Promise<void> {
    logger.info({ taskId: message.taskId, subtaskId: message.subtaskId, success: message.success }, 'Received execute response');

    if (message.success) {
      ctx.completedSubtasks.push(message.subtaskId);
      if (message.context) {
        Object.assign(ctx.sharedContext, message.context);
      }
    } else {
      ctx.failedSubtasks.push(message.subtaskId);
    }

    await this.scheduleNextTask(ctx);
  }

  private async handleStatusUpdate(message: TaskStatusUpdate, ctx: CollaborationContext): Promise<void> {
    ctx.currentSubtaskId = message.subtaskId;
    
    const subtask = ctx.subtasks.find(s => s.id === message.subtaskId);
    if (subtask) {
      subtask.status = message.status;
    }
  }

  private async handleTaskCompleted(message: TaskCompleted, ctx: CollaborationContext): Promise<void> {
    logger.info({ taskId: message.taskId, durationMs: message.durationMs }, 'Task completed');
    ctx.status = 'completed';
    this.collaborationContexts.delete(message.taskId);
  }

  private async handleTaskFailed(message: TaskFailed, ctx: CollaborationContext): Promise<void> {
    logger.error({ taskId: message.taskId, error: message.error }, 'Task failed');
    ctx.status = 'failed';
    ctx.failedSubtasks.push(message.failedSubtaskId);
    this.collaborationContexts.delete(message.taskId);
  }

  private async scheduleNextTask(ctx: CollaborationContext): Promise<void> {
    const pendingTasks = ctx.subtasks.filter(s => s.status === 'pending');
    
    const readyTasks = pendingTasks.filter(subtask => {
      return subtask.dependencies.every(dep => ctx.completedSubtasks.includes(dep));
    });

    if (readyTasks.length > 0) {
      const nextTask = readyTasks.reduce((best, current) => {
        return current.priority < best.priority ? current : best;
      });

      nextTask.status = 'running';

      const request: ExecuteTaskRequest = {
        type: 'execute_task_request',
        taskId: ctx.taskId,
        subtask: nextTask,
        context: ctx.sharedContext,
      };

      await this.sendMessage(request);
    } else if (pendingTasks.length === 0) {
      await this.finalizeTask(ctx);
    }
  }

  private async finalizeTask(ctx: CollaborationContext): Promise<void> {
    const completedCount = ctx.completedSubtasks.length;
    const failedCount = ctx.failedSubtasks.length;
    const totalCount = ctx.subtasks.length;

    if (failedCount === 0) {
      const summary = `任务执行完成，共 ${completedCount}/${totalCount} 个子任务成功完成。`;
      
      const completedMsg: TaskCompleted = {
        type: 'task_completed',
        taskId: ctx.taskId,
        subtaskResults: {},
        summary,
        durationMs: Date.now() - ctx.startTime,
      };

      await this.sendMessage(completedMsg);
    } else {
      const failedMsg: TaskFailed = {
        type: 'task_failed',
        taskId: ctx.taskId,
        failedSubtaskId: ctx.failedSubtasks[0],
        error: `任务执行失败，${completedCount}/${totalCount} 完成，${failedCount} 失败。`,
      };

      await this.sendMessage(failedMsg);
    }
  }

  private async sendMessage(message: AgentMessage): Promise<void> {
    eventBus.emit('agent-message', message);
  }

  getAgentId(): string {
    return this.agentId;
  }

  getContext(taskId: string): CollaborationContext | undefined {
    return this.collaborationContexts.get(taskId);
  }
}