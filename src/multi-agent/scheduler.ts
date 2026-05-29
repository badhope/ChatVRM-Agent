import { EventEmitter } from 'eventemitter3';
import { createLogger, Logger } from '../services/logger.js';
import type { Task } from '../agent/types.js';
import type { AgentResult } from '../plugins/types.js';

type AgentStatus = 'idle' | 'working' | 'busy' | 'offline';

export interface Agent {
  id: string;
  name: string;
  execute(task: Task): Promise<unknown>;
  getStatus(): AgentStatus;
  getCapabilities(): string[];
}

export interface SubTask {
  id: string;
  description: string;
  priority: number;
  dependencies: string[];
  assignedAgent?: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  result?: unknown;
  error?: string;
  capabilities?: string[];
}

export interface MultiAgentConfig {
  maxConcurrentAgents: number;
  taskTimeout: number;
  retryAttempts: number;
  enableCommunication: boolean;
  enableLoadBalancing: boolean;
}

export interface AgentRegistryEntry {
  agent: Agent;
  status: AgentStatus;
  currentTask?: string;
  capabilities: string[];
  load: number;
  lastHeartbeat: number;
}

export interface LoadBalancingStrategy {
  type: 'round-robin' | 'least-loaded' | 'capability-based' | 'random';
  select(agents: AgentRegistryEntry[]): AgentRegistryEntry | null;
}

export interface CommunicationMessage {
  id: string;
  from: string;
  to: string;
  type: 'request' | 'response' | 'broadcast' | 'notification';
  payload: unknown;
  timestamp: number;
  correlationId?: string;
}

export interface SubTaskResult {
  subTaskId: string;
  success?: boolean;
  output?: unknown;
  duration?: number;
  error?: string;
}

export class AgentScheduler extends EventEmitter {
  private logger: Logger;
  private agents: Map<string, AgentRegistryEntry> = new Map();
  private tasks: Map<string, SubTask[]> = new Map();
  private results: Map<string, unknown> = new Map();
  private messageQueue: CommunicationMessage[] = [];
  private config: MultiAgentConfig;
  private loadBalancingStrategy: LoadBalancingStrategy;

  constructor(config?: Partial<MultiAgentConfig>) {
    super();
    this.logger = createLogger('AgentScheduler');
    this.config = {
      maxConcurrentAgents: 5,
      taskTimeout: 300000,
      retryAttempts: 3,
      enableCommunication: true,
      enableLoadBalancing: true,
      ...config
    };

    this.loadBalancingStrategy = new LeastLoadedStrategy();
  }

  public registerAgent(agent: Agent, capabilities?: string[]): void {
    const entry: AgentRegistryEntry = {
      agent,
      status: 'idle',
      capabilities: capabilities || [],
      load: 0,
      lastHeartbeat: Date.now()
    };

    this.agents.set(agent.id, entry);

    this.logger.info({
      agentId: agent.id,
      capabilities: entry.capabilities
    }, 'Agent registered');

    this.emit('agent:registered', { agentId: agent.id, capabilities });
  }

  public unregisterAgent(agentId: string): void {
    const entry = this.agents.get(agentId);

    if (!entry) {
      throw new Error(`Agent not found: ${agentId}`);
    }

    if (entry.currentTask) {
      this.logger.warn({
        agentId,
        currentTask: entry.currentTask
      }, 'Unregistering busy agent');
    }

    this.agents.delete(agentId);
    this.logger.info({ agentId }, 'Agent unregistered');
    this.emit('agent:unregistered', { agentId });
  }

  public async schedule(task: Task): Promise<AgentResult> {
    this.logger.info({
      taskId: task.id,
      input: task.userInput.substring(0, 50)
    }, 'Scheduling task');

    try {
      const subTasks = this.decomposeTask(task);

      for (const subTask of subTasks) {
        const taskList = this.tasks.get(task.id) || [];
        taskList.push(subTask);
        this.tasks.set(task.id, taskList);
      }

      const subResults = await this.executeSubTasks(subTasks, task.id);

      const result = this.mergeResults(subResults, task.id);

      this.emit('task:completed', { taskId: task.id, result });
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error({ taskId: task.id, error: errorMessage }, 'Task scheduling failed');

      const result: AgentResult = {
        success: false,
        output: '',
        error: errorMessage
      };

      this.emit('task:failed', { taskId: task.id, error: errorMessage });
      return result;
    }
  }

  public decomposeTask(task: Task): SubTask[] {
    const subTasks: SubTask[] = [];

    const parts = this.splitTask(task.userInput);

    for (let i = 0; i < parts.length; i++) {
      subTasks.push({
        id: `${task.id}-sub-${i}`,
        description: parts[i],
        priority: 0,
        dependencies: i > 0 ? [`${task.id}-sub-${i - 1}`] : [],
        status: 'pending'
      });
    }

    if (parts.length === 0) {
      subTasks.push({
        id: `${task.id}-sub-0`,
        description: task.userInput,
        priority: 0,
        dependencies: [],
        status: 'pending'
      });
    }

    this.logger.debug({
      taskId: task.id,
      subTaskCount: subTasks.length
    }, 'Task decomposed');

    return subTasks;
  }

  private splitTask(input: string): string[] {
    const sentences = input.split(/[.!?]+/).filter(s => s.trim().length > 0);
    const parts: string[] = [];
    let currentPart = '';

    for (const sentence of sentences) {
      currentPart += sentence.trim() + '. ';

      if (currentPart.length > 500) {
        parts.push(currentPart.trim());
        currentPart = '';
      }
    }

    if (currentPart.trim()) {
      parts.push(currentPart.trim());
    }

    return parts;
  }

  private async executeSubTasks(subTasks: SubTask[], taskId: string): Promise<SubTaskResult[]> {
    const results: SubTaskResult[] = [];
    const executingTasks: Map<string, Promise<SubTaskResult>> = new Map();
    const completedTasks: Set<string> = new Set();

    for (const subTask of subTasks) {
      if (subTask.dependencies.length > 0) {
        const pendingDeps = subTask.dependencies.filter(d => !completedTasks.has(d));
        if (pendingDeps.length > 0) {
          await this.waitForDependencies(pendingDeps, taskId);
        }
      }

      const agent = this.selectAgent(subTask);

      if (!agent) {
        subTask.status = 'failed';
        subTask.error = 'No available agent';
        results.push({ subTaskId: subTask.id, error: 'No agent available' });
        continue;
      }

      const entry = this.agents.get(agent.id)!;
      entry.currentTask = subTask.id;
      entry.load++;
      subTask.status = 'running';

      const executePromise = this.executeOnAgent(subTask, agent, taskId);

      executePromise.then(result => {
        completedTasks.add(subTask.id);
        results.push(result);

        entry.currentTask = undefined;
        entry.load--;

        subTask.status = result.success ? 'completed' : 'failed';
        if (result.error) {
          subTask.error = result.error;
        }
        subTask.result = result;

        this.emit('subtask:completed', {
          taskId,
          subTaskId: subTask.id,
          success: result.success
        });
      }).catch(error => {
        completedTasks.add(subTask.id);
        entry.currentTask = undefined;
        entry.load--;

        subTask.status = 'failed';
        subTask.error = error.message;
        results.push({ subTaskId: subTask.id, error: error.message });

        this.emit('subtask:failed', {
          taskId,
          subTaskId: subTask.id,
          error: error.message
        });
      });

      executingTasks.set(subTask.id, executePromise);

      if (executingTasks.size >= this.config.maxConcurrentAgents) {
        await Promise.race(executingTasks.values());
        executingTasks.delete(subTask.id);
      }
    }

    await Promise.all(executingTasks.values());

    return results;
  }

  private async waitForDependencies(dependencies: string[], taskId: string): Promise<void> {
    const checkInterval = 100;
    const maxWait = this.config.taskTimeout;
    const startTime = Date.now();

    while (Date.now() - startTime < maxWait) {
      const taskList = this.tasks.get(taskId) || [];
      const allCompleted = dependencies.every(depId => {
        const depTask = taskList.find(t => t.id === depId);
        return depTask && depTask.status === 'completed';
      });

      if (allCompleted) {
        return;
      }

      const anyFailed = dependencies.some(depId => {
        const depTask = taskList.find(t => t.id === depId);
        return depTask && depTask.status === 'failed';
      });

      if (anyFailed) {
        throw new Error('One or more dependencies failed');
      }

      await new Promise(resolve => setTimeout(resolve, checkInterval));
    }

    throw new Error('Dependency wait timeout');
  }

  private selectAgent(task: SubTask): Agent | null {
    if (!this.config.enableLoadBalancing) {
      const availableAgents = Array.from(this.agents.values())
        .filter(a => a.status === 'idle' && a.load === 0);

      return availableAgents.length > 0 ? availableAgents[0].agent : null;
    }

    let agents = Array.from(this.agents.values())
      .filter(a => a.status === 'idle' || a.status === 'working');

    if (task.capabilities && task.capabilities.length > 0) {
      agents = agents.filter(a =>
        task.capabilities!.some(c => a.capabilities.includes(c))
      );
    }

    const selected = this.loadBalancingStrategy.select(agents);
    return selected ? selected.agent : null;
  }

  private async executeOnAgent(
    task: SubTask,
    agent: Agent,
    parentTaskId: string
  ): Promise<SubTaskResult> {
    this.logger.debug({
      taskId: task.id,
      agentId: agent.id
    }, 'Executing on agent');

    const startTime = Date.now();

    try {
      const result = await Promise.race([
        agent.execute({
          id: task.id,
          userInput: task.description,
          steps: [],
          currentStep: 0,
          status: 'executing' as const,
          startedAt: Date.now()
        }),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Task timeout')), this.config.taskTimeout)
        )
      ]);

      const duration = Date.now() - startTime;

      return {
        subTaskId: task.id,
        success: (result as any).success ?? true,
        output: (result as any).output ?? result,
        duration
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      if (this.config.retryAttempts > 0) {
        return this.retryTask(task, agent, parentTaskId, this.config.retryAttempts);
      }

      return {
        subTaskId: task.id,
        success: false,
        output: '',
        error: errorMessage
      };
    }
  }

  private async retryTask(
    task: SubTask,
    agent: Agent,
    parentTaskId: string,
    attempts: number
  ): Promise<SubTaskResult> {
    for (let i = 0; i < attempts; i++) {
      try {
        this.logger.info({
          taskId: task.id,
          attempt: i + 1,
          maxAttempts: attempts
        }, 'Retrying task');

        const result = await this.executeOnAgent(task, agent, parentTaskId);

        if (result.success) {
          return result;
        }
      } catch (error) {
        this.logger.warn({
          taskId: task.id,
          attempt: i + 1,
          error: error
        }, 'Retry failed');
      }
    }

    return {
      subTaskId: task.id,
      success: false,
      output: '',
      error: `Failed after ${attempts} attempts`
    };
  }

  private mergeResults(subResults: SubTaskResult[], taskId: string): AgentResult {
    const success = subResults.every(r => r.success);
    const output = subResults.map(r => r.output).join('\n\n');

    const taskList = this.tasks.get(taskId);
    const failedTasks = taskList?.filter(t => t.status === 'failed') || [];

    return {
      success,
      output: success ? output : `Completed with ${failedTasks.length} failed subtask(s)`
    };
  }

  public sendMessage(message: CommunicationMessage): void {
    if (!this.config.enableCommunication) {
      return;
    }

    this.messageQueue.push(message);

    this.emit('message:sent', message);

    this.logger.debug({
      from: message.from,
      to: message.to,
      type: message.type
    }, 'Message sent');

    if (message.type === 'broadcast') {
      this.emit('message:broadcast', message);
    } else {
      this.emit('message:delivered', message);
    }
  }

  public broadcast(message: Omit<CommunicationMessage, 'id' | 'type' | 'timestamp'>): void {
    const fullMessage: CommunicationMessage = {
      ...message,
      id: this.generateMessageId(),
      type: 'broadcast',
      timestamp: Date.now()
    };

    this.sendMessage(fullMessage);
  }

  public request(requesterId: string, targetId: string, payload: unknown): Promise<CommunicationMessage> {
    return new Promise((resolve, reject) => {
      const correlationId = this.generateMessageId();

      const message: CommunicationMessage = {
        id: this.generateMessageId(),
        from: requesterId,
        to: targetId,
        type: 'request',
        payload,
        timestamp: Date.now(),
        correlationId
      };

      const timeout = setTimeout(() => {
        const index = this.messageQueue.findIndex(m => m.id === message.id);
        if (index !== -1) {
          this.messageQueue.splice(index, 1);
        }
        reject(new Error('Request timeout'));
      }, this.config.taskTimeout);

      this.sendMessage(message);

      const handler = (response: CommunicationMessage) => {
        if (response.correlationId === correlationId) {
          clearTimeout(timeout);
          this.off('message:response', handler);
          resolve(response);
        }
      };

      this.on('message:response', handler);
    });
  }

  public getAgentStatus(agentId: string): AgentStatus | null {
    const entry = this.agents.get(agentId);
    return entry ? entry.status : null;
  }

  public getAvailableAgents(): AgentRegistryEntry[] {
    return Array.from(this.agents.values())
      .filter(a => a.status === 'idle');
  }

  public getAllAgents(): Map<string, AgentRegistryEntry> {
    return new Map(this.agents);
  }

  public setLoadBalancingStrategy(strategy: LoadBalancingStrategy): void {
    this.loadBalancingStrategy = strategy;
    this.logger.info({ type: strategy.type }, 'Load balancing strategy updated');
  }

  private generateMessageId(): string {
    return `msg_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  public getTaskStatus(taskId: string): Map<string, string> | null {
    const taskList = this.tasks.get(taskId);

    if (!taskList) {
      return null;
    }

    const status = new Map<string, string>();
    for (const task of taskList) {
      status.set(task.id, task.status);
    }

    return status;
  }

  public cancelTask(taskId: string): void {
    const taskList = this.tasks.get(taskId);

    if (!taskList) {
      return;
    }

    for (const task of taskList) {
      if (task.status === 'pending' || task.status === 'running') {
        task.status = 'failed';
        task.error = 'Task cancelled';

        if (task.assignedAgent) {
          const entry = this.agents.get(task.assignedAgent);
          if (entry) {
            entry.currentTask = undefined;
            entry.load--;
          }
        }
      }
    }

    this.emit('task:cancelled', { taskId });
    this.logger.info({ taskId }, 'Task cancelled');
  }

  public clearCompletedTasks(): void {
    for (const [taskId, taskList] of this.tasks.entries()) {
      const allCompleted = taskList.every(
        t => t.status === 'completed' || t.status === 'failed'
      );

      if (allCompleted) {
        this.tasks.delete(taskId);
      }
    }

    this.logger.info({}, 'Completed tasks cleared');
  }
}

class LeastLoadedStrategy implements LoadBalancingStrategy {
  public readonly type = 'least-loaded';

  select(agents: AgentRegistryEntry[]): AgentRegistryEntry | null {
    if (agents.length === 0) {
      return null;
    }

    return agents.reduce((min, agent) =>
      agent.load < min.load ? agent : min
    );
  }
}

class RoundRobinStrategy implements LoadBalancingStrategy {
  public readonly type = 'round-robin';
  private currentIndex = 0;

  select(agents: AgentRegistryEntry[]): AgentRegistryEntry | null {
    if (agents.length === 0) {
      return null;
    }

    const agent = agents[this.currentIndex % agents.length];
    this.currentIndex++;

    return agent;
  }
}

class CapabilityBasedStrategy implements LoadBalancingStrategy {
  public readonly type = 'capability-based';

  select(agents: AgentRegistryEntry[]): AgentRegistryEntry | null {
    if (agents.length === 0) {
      return null;
    }

    const capableAgents = agents.filter(a => a.capabilities.length > 0);

    if (capableAgents.length === 0) {
      return agents[0];
    }

    return capableAgents.reduce((min, agent) =>
      agent.load < min.load ? agent : min
    );
  }
}

export default AgentScheduler;
