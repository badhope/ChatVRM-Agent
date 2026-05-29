import { createLogger, Logger } from '../services/logger.js';
import cron, { ScheduledTask } from 'node-cron';

export interface ScheduleConfig {
  id: string;
  name: string;
  cron: string;
  task: Task;
  options?: ScheduleOptions;
  metadata?: Record<string, any>;
}

export interface ScheduleOptions {
  timezone?: string;
  paused?: boolean;
  startImmediately?: boolean;
  maxRuns?: number;
  retryOnError?: boolean;
  retryAttempts?: number;
  retryDelay?: number;
}

export interface Task {
  id: string;
  type: 'function' | 'script' | 'workflow';
  handler: TaskHandler;
  timeout?: number;
  retryable?: boolean;
}

export type TaskHandler = (context: TaskContext) => Promise<TaskResult>;

export interface TaskContext {
  scheduleId: string;
  runCount: number;
  lastRun?: Date;
  metadata?: Record<string, any>;
  env?: Record<string, string>;
}

export interface TaskResult {
  success: boolean;
  output?: any;
  error?: string;
  duration?: number;
  metadata?: Record<string, any>;
}

export interface ScheduleInfo {
  id: string;
  name: string;
  cron: string;
  nextRun?: Date;
  lastRun?: Date;
  runCount: number;
  status: 'active' | 'paused' | 'error' | 'completed';
  options: ScheduleOptions;
}

export interface SchedulerStats {
  totalSchedules: number;
  activeSchedules: number;
  pausedSchedules: number;
  totalRuns: number;
  successfulRuns: number;
  failedRuns: number;
  averageExecutionTime: number;
}

export class TaskScheduler {
  private logger: Logger;
  private schedules: Map<string, ScheduleConfig> = new Map();
  private runningTasks: Map<string, ScheduledTask> = new Map();
  private taskHistory: Map<string, TaskHistoryEntry[]> = new Map();
  private maxHistorySize = 100;

  constructor() {
    this.logger = createLogger('TaskScheduler');
  }

  public async createSchedule(config: ScheduleConfig): Promise<ScheduleInfo> {
    if (this.schedules.has(config.id)) {
      throw new Error(`Schedule already exists: ${config.id}`);
    }

    if (!cron.validate(config.cron)) {
      throw new Error(`Invalid cron expression: ${config.cron}`);
    }

    const schedule: ScheduleConfig = {
      ...config,
      options: {
        paused: false,
        startImmediately: false,
        retryOnError: true,
        retryAttempts: 3,
        retryDelay: 5000,
        ...config.options
      }
    };

    this.schedules.set(config.id, schedule);
    this.taskHistory.set(config.id, []);

    this.logger.info({
      id: config.id,
      name: config.name,
      cron: config.cron
    }, 'Schedule created');

    if (!schedule.options?.paused) {
      await this.startSchedule(config.id);
    }

    return this.getScheduleInfo(config.id);
  }

  public async updateSchedule(id: string, updates: Partial<ScheduleConfig>): Promise<ScheduleInfo> {
    const schedule = this.schedules.get(id);

    if (!schedule) {
      throw new Error(`Schedule not found: ${id}`);
    }

    if (updates.cron && !cron.validate(updates.cron)) {
      throw new Error(`Invalid cron expression: ${updates.cron}`);
    }

    const wasRunning = this.runningTasks.has(id);

    if (wasRunning) {
      await this.stopSchedule(id);
    }

    const updatedSchedule: ScheduleConfig = {
      ...schedule,
      ...updates,
      options: {
        ...schedule.options,
        ...updates.options
      }
    };

    this.schedules.set(id, updatedSchedule);

    if (wasRunning && !updatedSchedule.options?.paused) {
      await this.startSchedule(id);
    }

    this.logger.info({ id }, 'Schedule updated');

    return this.getScheduleInfo(id);
  }

  public async deleteSchedule(id: string): Promise<void> {
    if (!this.schedules.has(id)) {
      throw new Error(`Schedule not found: ${id}`);
    }

    await this.stopSchedule(id);

    this.schedules.delete(id);
    this.taskHistory.delete(id);

    this.logger.info({ id }, 'Schedule deleted');
  }

  public async startSchedule(id: string): Promise<void> {
    const schedule = this.schedules.get(id);

    if (!schedule) {
      throw new Error(`Schedule not found: ${id}`);
    }

    if (this.runningTasks.has(id)) {
      this.logger.warn({ id }, 'Schedule already running');
      return;
    }

    if (schedule.options?.paused) {
      this.logger.warn({ id }, 'Schedule is paused');
      return;
    }

    const scheduledTask = cron.schedule(
      schedule.cron,
      async () => {
        await this.executeTask(id);
      },
      {
        timezone: schedule.options?.timezone
      }
    );

    this.runningTasks.set(id, scheduledTask);

    if (schedule.options?.startImmediately) {
      await this.executeTask(id);
    }

    this.logger.info({ id, cron: schedule.cron }, 'Schedule started');
  }

  public async stopSchedule(id: string): Promise<void> {
    const task = this.runningTasks.get(id);

    if (!task) {
      return;
    }

    task.stop();
    this.runningTasks.delete(id);

    this.logger.info({ id }, 'Schedule stopped');
  }

  public async pauseSchedule(id: string): Promise<void> {
    const schedule = this.schedules.get(id);

    if (!schedule) {
      throw new Error(`Schedule not found: ${id}`);
    }

    if (schedule.options?.paused) {
      return;
    }

    await this.stopSchedule(id);

    schedule.options = {
      ...schedule.options,
      paused: true
    };

    this.schedules.set(id, schedule);

    this.logger.info({ id }, 'Schedule paused');
  }

  public async resumeSchedule(id: string): Promise<void> {
    const schedule = this.schedules.get(id);

    if (!schedule) {
      throw new Error(`Schedule not found: ${id}`);
    }

    if (!schedule.options?.paused) {
      return;
    }

    schedule.options = {
      ...schedule.options,
      paused: false
    };

    this.schedules.set(id, schedule);
    await this.startSchedule(id);

    this.logger.info({ id }, 'Schedule resumed');
  }

  public async runNow(id: string): Promise<TaskResult> {
    if (!this.schedules.has(id)) {
      throw new Error(`Schedule not found: ${id}`);
    }

    this.logger.info({ id }, 'Running schedule immediately');
    return this.executeTask(id);
  }

  public getScheduleInfo(id: string): ScheduleInfo {
    const schedule = this.schedules.get(id);

    if (!schedule) {
      throw new Error(`Schedule not found: ${id}`);
    }

    const history = this.taskHistory.get(id) || [];
    const lastRun = history.length > 0 ? history[history.length - 1] : undefined;
    const runCount = history.length;
    const status = this.getScheduleStatus(schedule);

    let nextRun: Date | undefined;
    if (!schedule.options?.paused) {
      nextRun = this.getNextRunDate(schedule.cron, schedule.options?.timezone);
    }

    return {
      id: schedule.id,
      name: schedule.name,
      cron: schedule.cron,
      nextRun,
      lastRun: lastRun?.timestamp,
      runCount,
      status,
      options: schedule.options || {}
    };
  }

  public listSchedules(): ScheduleInfo[] {
    const schedules: ScheduleInfo[] = [];

    for (const [id] of this.schedules) {
      schedules.push(this.getScheduleInfo(id));
    }

    return schedules;
  }

  public getTaskHistory(scheduleId: string, limit?: number): TaskHistoryEntry[] {
    const history = this.taskHistory.get(scheduleId) || [];
    
    if (limit) {
      return history.slice(-limit);
    }

    return history;
  }

  public getStats(): SchedulerStats {
    let totalRuns = 0;
    let successfulRuns = 0;
    let failedRuns = 0;
    let totalDuration = 0;

    for (const history of this.taskHistory.values()) {
      for (const entry of history) {
        totalRuns++;
        if (entry.result.success) {
          successfulRuns++;
        } else {
          failedRuns++;
        }
        if (entry.result.duration) {
          totalDuration += entry.result.duration;
        }
      }
    }

    let activeSchedules = 0;
    let pausedSchedules = 0;

    for (const schedule of this.schedules.values()) {
      if (schedule.options?.paused) {
        pausedSchedules++;
      } else {
        activeSchedules++;
      }
    }

    return {
      totalSchedules: this.schedules.size,
      activeSchedules,
      pausedSchedules,
      totalRuns,
      successfulRuns,
      failedRuns,
      averageExecutionTime: totalRuns > 0 ? totalDuration / totalRuns : 0
    };
  }

  private async executeTask(scheduleId: string): Promise<TaskResult> {
    const schedule = this.schedules.get(scheduleId);

    if (!schedule) {
      throw new Error(`Schedule not found: ${scheduleId}`);
    }

    const history = this.taskHistory.get(scheduleId) || [];
    const runCount = history.length + 1;

    const context: TaskContext = {
      scheduleId,
      runCount,
      lastRun: history.length > 0 ? history[history.length - 1].timestamp : undefined,
      metadata: schedule.metadata,
      env: process.env as Record<string, string>
    };

    const startTime = Date.now();

    try {
      this.logger.info({
        scheduleId,
        runCount,
        type: schedule.task.type
      }, 'Executing scheduled task');

      const result = await Promise.race([
        schedule.task.handler(context),
        new Promise<never>((_, reject) => 
          setTimeout(() => reject(new Error('Task timeout')), 
            schedule.task.timeout || 300000)
        )
      ]);

      const duration = Date.now() - startTime;

      const taskResult: TaskResult = {
        success: true,
        output: result,
        duration
      };

      this.recordTaskExecution(scheduleId, taskResult);

      this.logger.info({
        scheduleId,
        duration
      }, 'Task executed successfully');

      return taskResult;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const duration = Date.now() - startTime;

      this.logger.error({
        scheduleId,
        error: errorMessage
      }, 'Task execution failed');

      if (schedule.options?.retryOnError && schedule.options?.retryAttempts && schedule.options?.retryAttempts > 0) {
        await this.retryTask(scheduleId, context, schedule.options.retryAttempts, schedule.options?.retryDelay || 5000);
      }

      const taskResult: TaskResult = {
        success: false,
        error: errorMessage,
        duration
      };

      this.recordTaskExecution(scheduleId, taskResult);

      return taskResult;
    }
  }

  private async retryTask(
    scheduleId: string,
    context: TaskContext,
    attempts: number,
    delay: number
  ): Promise<void> {
    for (let i = 0; i < attempts; i++) {
      this.logger.info({
        scheduleId,
        attempt: i + 1,
        maxAttempts: attempts
      }, 'Retrying task');

      await new Promise(resolve => setTimeout(resolve, delay));

      const schedule = this.schedules.get(scheduleId);
      if (!schedule) return;

      try {
        await schedule.task.handler(context);
        this.logger.info({ scheduleId, attempt: i + 1 }, 'Retry successful');
        return;
      } catch (error) {
        this.logger.warn({
          scheduleId,
          attempt: i + 1,
          error
        }, 'Retry failed');
      }
    }

    this.logger.error({ scheduleId }, 'All retry attempts failed');
  }

  private recordTaskExecution(scheduleId: string, result: TaskResult): void {
    const history = this.taskHistory.get(scheduleId) || [];

    const entry: TaskHistoryEntry = {
      timestamp: new Date(),
      result
    };

    history.push(entry);

    if (history.length > this.maxHistorySize) {
      history.shift();
    }

    this.taskHistory.set(scheduleId, history);
  }

  private getScheduleStatus(schedule: ScheduleConfig): 'active' | 'paused' | 'error' | 'completed' {
    if (schedule.options?.paused) {
      return 'paused';
    }

    if (schedule.options?.maxRuns) {
      const history = this.taskHistory.get(schedule.id) || [];
      if (history.length >= schedule.options.maxRuns) {
        return 'completed';
      }
    }

    const recentHistory = this.getRecentHistory(schedule.id);
    if (recentHistory.length > 0 && !recentHistory[recentHistory.length - 1].result.success) {
      return 'error';
    }

    return 'active';
  }

  private getRecentHistory(scheduleId: string, count: number = 5): TaskHistoryEntry[] {
    const history = this.taskHistory.get(scheduleId) || [];
    return history.slice(-count);
  }

  private getNextRunDate(cronExpression: string, timezone?: string): Date {
    try {
      const cronInstance = cron.schedule(cronExpression, () => {});
      cronInstance.stop();
      return new Date(Date.now() + 60000);
    } catch {
      return new Date(Date.now() + 60000);
    }
  }

  public async shutdown(): Promise<void> {
    this.logger.info({}, 'Shutting down scheduler...');

    for (const [id] of this.runningTasks) {
      await this.stopSchedule(id);
    }

    this.schedules.clear();
    this.taskHistory.clear();

    this.logger.info({}, 'Scheduler shut down');
  }
}

interface TaskHistoryEntry {
  timestamp: Date;
  result: TaskResult;
}

export default TaskScheduler;
