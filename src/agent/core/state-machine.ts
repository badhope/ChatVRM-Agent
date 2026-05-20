/**
 * Agent State Machine
 *
 * Manages agent state transitions and validation.
 * Handles the lifecycle of an agent task from initialization to completion.
 */

import { ExecutionPhase, type StateTransitionResult, type Task } from './types.js';
import { agentLogger } from '../../services/logger.js';

/**
 * 有效的状态转换图
 * 定义从每个状态可以转换到哪些状态
 */
const VALID_TRANSITIONS: Record<ExecutionPhase, ExecutionPhase[]> = {
  [ExecutionPhase.INITIALIZING]: [
    ExecutionPhase.UNDERSTANDING,
    ExecutionPhase.FAILED,
  ],
  [ExecutionPhase.UNDERSTANDING]: [
    ExecutionPhase.PLANNING,
    ExecutionPhase.FAILED,
    ExecutionPhase.TIMEOUT,
  ],
  [ExecutionPhase.PLANNING]: [
    ExecutionPhase.EXECUTING,
    ExecutionPhase.FAILED,
    ExecutionPhase.TIMEOUT,
  ],
  [ExecutionPhase.EXECUTING]: [
    ExecutionPhase.VALIDATING,
    ExecutionPhase.FAILED,
    ExecutionPhase.TIMEOUT,
  ],
  [ExecutionPhase.VALIDATING]: [
    ExecutionPhase.REFLECTING,
    ExecutionPhase.COMPLETED,
    ExecutionPhase.FAILED,
    ExecutionPhase.TIMEOUT,
  ],
  [ExecutionPhase.REFLECTING]: [
    ExecutionPhase.COMPLETED,
    ExecutionPhase.FAILED,
    ExecutionPhase.TIMEOUT,
  ],
  [ExecutionPhase.COMPLETED]: [],
  [ExecutionPhase.FAILED]: [],
  [ExecutionPhase.TIMEOUT]: [],
};

/**
 * 状态显示名称映射
 */
const PHASE_DISPLAY_NAMES: Record<ExecutionPhase, string> = {
  [ExecutionPhase.INITIALIZING]: '初始化',
  [ExecutionPhase.UNDERSTANDING]: '理解任务',
  [ExecutionPhase.PLANNING]: '规划步骤',
  [ExecutionPhase.EXECUTING]: '执行任务',
  [ExecutionPhase.VALIDATING]: '验证结果',
  [ExecutionPhase.REFLECTING]: '反思总结',
  [ExecutionPhase.COMPLETED]: '已完成',
  [ExecutionPhase.FAILED]: '失败',
  [ExecutionPhase.TIMEOUT]: '超时',
};

/**
 * 状态机类
 * 管理 Agent 执行状态的生命周期
 */
export class AgentStateMachine {
  private currentPhase: ExecutionPhase = ExecutionPhase.INITIALIZING;
  private phaseStartTime: number = Date.now();
  private phaseHistory: Array<{ phase: ExecutionPhase; startTime: number; endTime?: number }> = [];
  private taskId: string;

  constructor(taskId: string) {
    this.taskId = taskId;
    this.recordPhaseEntry();
  }

  /**
   * 获取当前状态
   */
  getCurrentPhase(): ExecutionPhase {
    return this.currentPhase;
  }

  /**
   * 获取当前状态显示名称
   */
  getCurrentPhaseName(): string {
    return PHASE_DISPLAY_NAMES[this.currentPhase];
  }

  /**
   * 获取当前阶段持续时间（毫秒）
   */
  getCurrentPhaseDuration(): number {
    return Date.now() - this.phaseStartTime;
  }

  /**
   * 获取完整的状态历史
   */
  getPhaseHistory(): Array<{ phase: ExecutionPhase; startTime: number; endTime?: number }> {
    return [...this.phaseHistory];
  }

  /**
   * 验证并执行状态转换
   * @param targetPhase 目标状态
   * @returns 转换结果
   */
  transitionTo(targetPhase: ExecutionPhase): StateTransitionResult {
    // 检查是否是相同状态
    if (targetPhase === this.currentPhase) {
      return { allowed: true, newState: targetPhase };
    }

    // 检查转换是否有效
    const validTargets = VALID_TRANSITIONS[this.currentPhase];
    if (!validTargets.includes(targetPhase)) {
      return {
        allowed: false,
        reason: `Invalid transition from ${this.currentPhase} to ${targetPhase}. ` +
                `Valid targets: ${validTargets.join(', ')}`,
      };
    }

    // 执行转换
    this.completeCurrentPhase();
    this.currentPhase = targetPhase;
    this.phaseStartTime = Date.now();
    this.recordPhaseEntry();

    agentLogger.debug(
      { taskId: this.taskId, phase: targetPhase },
      `State transitioned to ${targetPhase}`
    );

    return { allowed: true, newState: targetPhase };
  }

  /**
   * 强制设置状态（用于错误恢复）
   * @param phase 目标状态
   */
  forceSetPhase(phase: ExecutionPhase): void {
    this.completeCurrentPhase();
    this.currentPhase = phase;
    this.phaseStartTime = Date.now();
    this.recordPhaseEntry();

    agentLogger.warn(
      { taskId: this.taskId, phase },
      `State forcefully set to ${phase}`
    );
  }

  /**
   * 检查是否可以转换到指定状态
   * @param targetPhase 目标状态
   * @returns 是否可以转换
   */
  canTransitionTo(targetPhase: ExecutionPhase): boolean {
    if (targetPhase === this.currentPhase) return true;
    return VALID_TRANSITIONS[this.currentPhase].includes(targetPhase);
  }

  /**
   * 获取有效的下一个状态列表
   */
  getValidNextPhases(): ExecutionPhase[] {
    return [...VALID_TRANSITIONS[this.currentPhase]];
  }

  /**
   * 检查当前是否处于终止状态
   */
  isInTerminalState(): boolean {
    return [
      ExecutionPhase.COMPLETED,
      ExecutionPhase.FAILED,
      ExecutionPhase.TIMEOUT,
    ].includes(this.currentPhase);
  }

  /**
   * 检查当前是否处于可执行状态
   */
  isExecutable(): boolean {
    return [
      ExecutionPhase.INITIALIZING,
      ExecutionPhase.UNDERSTANDING,
      ExecutionPhase.PLANNING,
      ExecutionPhase.EXECUTING,
      ExecutionPhase.VALIDATING,
      ExecutionPhase.REFLECTING,
    ].includes(this.currentPhase);
  }

  /**
   * 将任务状态映射到执行阶段
   * @param taskStatus 任务状态
   * @returns 对应的执行阶段
   */
  static mapTaskStatusToPhase(taskStatus: Task['status']): ExecutionPhase {
    switch (taskStatus) {
      case 'planning':
        return ExecutionPhase.PLANNING;
      case 'executing':
        return ExecutionPhase.EXECUTING;
      case 'completed':
        return ExecutionPhase.COMPLETED;
      case 'failed':
        return ExecutionPhase.FAILED;
      case 'timeout':
        return ExecutionPhase.TIMEOUT;
      default:
        return ExecutionPhase.INITIALIZING;
    }
  }

  /**
   * 将执行阶段映射到任务状态
   * @param phase 执行阶段
   * @returns 对应的任务状态
   */
  static mapPhaseToTaskStatus(phase: ExecutionPhase): Task['status'] {
    switch (phase) {
      case ExecutionPhase.PLANNING:
        return 'planning';
      case ExecutionPhase.EXECUTING:
      case ExecutionPhase.VALIDATING:
      case ExecutionPhase.REFLECTING:
        return 'executing';
      case ExecutionPhase.COMPLETED:
        return 'completed';
      case ExecutionPhase.FAILED:
        return 'failed';
      case ExecutionPhase.TIMEOUT:
        return 'timeout';
      default:
        return 'planning';
    }
  }

  /**
   * 记录阶段进入
   */
  private recordPhaseEntry(): void {
    this.phaseHistory.push({
      phase: this.currentPhase,
      startTime: this.phaseStartTime,
    });
  }

  /**
   * 完成当前阶段
   */
  private completeCurrentPhase(): void {
    const currentEntry = this.phaseHistory[this.phaseHistory.length - 1];
    if (currentEntry && !currentEntry.endTime) {
      currentEntry.endTime = Date.now();
    }
  }
}

/**
 * 创建状态机实例的工厂函数
 * @param taskId 任务ID
 * @returns 新的状态机实例
 */
export function createStateMachine(taskId: string): AgentStateMachine {
  return new AgentStateMachine(taskId);
}

/**
 * 验证状态转换
 * @param fromPhase 起始状态
 * @param toPhase 目标状态
 * @returns 是否有效
 */
export function isValidTransition(fromPhase: ExecutionPhase, toPhase: ExecutionPhase): boolean {
  if (fromPhase === toPhase) return true;
  return VALID_TRANSITIONS[fromPhase]?.includes(toPhase) ?? false;
}

/**
 * 获取阶段的显示名称
 * @param phase 执行阶段
 * @returns 显示名称
 */
export function getPhaseDisplayName(phase: ExecutionPhase): string {
  return PHASE_DISPLAY_NAMES[phase] || phase;
}
