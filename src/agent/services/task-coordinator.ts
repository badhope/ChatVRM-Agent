/**
 * Task Coordinator - 任务协调器实现
 *
 * 负责任务生命周期管理、步骤编排和状态转换。
 */

import type { Task, TaskStep } from '../types.js';
import type { ITaskCoordinator } from './interfaces.js';
import { TASK_TIMEOUT_MS } from '../../constants/index.js';

/**
 * 任务协调器实现
 */
export class TaskCoordinator implements ITaskCoordinator {
  private _currentTask: Task | null = null;
  private _currentStepIndex: number = 0;
  private _taskStartTime: number = 0;
  private _stepStartTimes: Map<number, number> = new Map();

  /**
   * 获取当前任务
   */
  get currentTask(): Task | null {
    return this._currentTask;
  }

  /**
   * 获取当前步骤索引
   */
  get currentStepIndex(): number {
    return this._currentStepIndex;
  }

  /**
   * 获取任务开始时间
   */
  get taskStartTime(): number {
    return this._taskStartTime;
  }

  /**
   * 初始化新任务
   * @param userInput 用户输入
   * @returns 创建的任务
   */
  initializeTask(userInput: string): Task {
    const task: Task = {
      id: crypto.randomUUID(),
      userInput,
      steps: [],
      currentStep: 0,
      status: 'planning',
      startedAt: Date.now(),
    };

    this._currentTask = task;
    this._currentStepIndex = 0;
    this._taskStartTime = Date.now();
    this._stepStartTimes.clear();

    return task;
  }

  /**
   * 设置任务步骤
   * @param steps 步骤列表
   */
  setSteps(steps: TaskStep[]): void {
    if (!this._currentTask) {
      throw new Error('No active task. Call initializeTask first.');
    }
    this._currentTask.steps = steps;
  }

  /**
   * 获取下一步骤
   * @returns 下一步骤或 null（如果任务完成）
   */
  getNextStep(): TaskStep | null {
    if (!this._currentTask) {
      return null;
    }

    if (this._currentStepIndex >= this._currentTask.steps.length) {
      return null;
    }

    return this._currentTask.steps[this._currentStepIndex];
  }

  /**
   * 前进到下一步
   * @returns 是否还有更多步骤
   */
  advanceStep(): boolean {
    if (!this._currentTask) {
      return false;
    }

    this._currentStepIndex++;
    this._currentTask.currentStep = this._currentStepIndex;

    return this._currentStepIndex < this._currentTask.steps.length;
  }

  /**
   * 更新步骤状态
   * @param stepIndex 步骤索引
   * @param status 新状态
   * @param result 执行结果（可选）
   */
  updateStepStatus(
    stepIndex: number,
    status: TaskStep['status'],
    result?: string
  ): void {
    if (!this._currentTask) {
      throw new Error('No active task.');
    }

    const step = this._currentTask.steps[stepIndex];
    if (!step) {
      throw new Error(`Step ${stepIndex} not found.`);
    }

    step.status = status;
    if (result !== undefined) {
      step.result = result;
    }

    // 记录步骤时间戳
    if (status === 'running') {
      this._stepStartTimes.set(stepIndex, Date.now());
    }
  }

  /**
   * 获取步骤执行时长
   * @param stepIndex 步骤索引
   * @returns 执行时长（毫秒）
   */
  getStepDuration(stepIndex: number): number {
    const startTime = this._stepStartTimes.get(stepIndex);
    if (!startTime) {
      return 0;
    }
    return Date.now() - startTime;
  }

  /**
   * 标记任务完成
   * @param success 是否成功
   * @param result 最终结果
   */
  completeTask(success: boolean, result?: string): void {
    if (!this._currentTask) {
      throw new Error('No active task.');
    }

    this._currentTask.status = success ? 'completed' : 'failed';
    this._currentTask.result = result;
    this._currentTask.completedAt = Date.now();
  }

  /**
   * 标记任务失败
   * @param error 错误信息
   */
  failTask(error: string): void {
    if (!this._currentTask) {
      throw new Error('No active task.');
    }

    this._currentTask.status = 'failed';
    this._currentTask.result = error;
    this._currentTask.completedAt = Date.now();
  }

  /**
   * 标记任务超时
   */
  timeoutTask(): void {
    if (!this._currentTask) {
      throw new Error('No active task.');
    }

    this._currentTask.status = 'timeout';
    this._currentTask.completedAt = Date.now();
  }

  /**
   * 检查是否超时
   * @param startTime 开始时间
   * @param timeoutMs 超时时间（毫秒）
   * @returns 是否超时
   */
  isTimeout(startTime: number, timeoutMs: number = TASK_TIMEOUT_MS): boolean {
    return Date.now() - startTime > timeoutMs;
  }

  /**
   * 获取任务持续时间
   * @returns 持续时间（毫秒）
   */
  getDuration(): number {
    if (!this._currentTask) {
      return 0;
    }

    const endTime = this._currentTask.completedAt || Date.now();
    return endTime - this._taskStartTime;
  }

  /**
   * 获取任务统计信息
   * @returns 统计信息
   */
  getStats(): {
    totalSteps: number;
    completedSteps: number;
    errorSteps: number;
    skippedSteps: number;
    duration: number;
  } {
    if (!this._currentTask) {
      return {
        totalSteps: 0,
        completedSteps: 0,
        errorSteps: 0,
        skippedSteps: 0,
        duration: 0,
      };
    }

    const steps = this._currentTask.steps;
    return {
      totalSteps: steps.length,
      completedSteps: steps.filter(s => s.status === 'done').length,
      errorSteps: steps.filter(s => s.status === 'error').length,
      skippedSteps: steps.filter(s => s.status === 'skipped').length,
      duration: this.getDuration(),
    };
  }

  /**
   * 重置协调器
   */
  reset(): void {
    this._currentTask = null;
    this._currentStepIndex = 0;
    this._taskStartTime = 0;
    this._stepStartTimes.clear();
  }

  /**
   * 检查是否有正在进行的任务
   * @returns 是否有活动任务
   */
  hasActiveTask(): boolean {
    return this._currentTask !== null &&
           this._currentTask.status !== 'completed' &&
           this._currentTask.status !== 'failed' &&
           this._currentTask.status !== 'timeout';
  }

  /**
   * 获取已完成的步骤结果
   * @returns 结果列表
   */
  getCompletedResults(): string[] {
    if (!this._currentTask) {
      return [];
    }

    return this._currentTask.steps
      .filter(s => s.status === 'done' && s.result)
      .map(s => s.result!);
  }

  /**
   * 获取变更的文件列表
   * @returns 文件路径列表
   */
  getChangedFiles(): string[] {
    if (!this._currentTask) {
      return [];
    }

    const changedFiles: string[] = [];
    for (const step of this._currentTask.steps) {
      if (step.tool === 'write_file' && step.args?.path) {
        changedFiles.push(String(step.args.path));
      } else if (step.tool === 'edit_file' && step.args?.path) {
        changedFiles.push(String(step.args.path));
      }
    }

    return [...new Set(changedFiles)];
  }
}
