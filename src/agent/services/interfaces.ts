/**
 * Agent 服务接口定义
 *
 * 定义 Agent 核心功能的服务接口，支持依赖注入和模块化测试。
 */

import type { Task, TaskStep } from '../types.js';
import type { ExecutionPhase, ToolResult } from '../core/types.js';

// ============================================================
// 任务协调器接口
// ============================================================

/**
 * 任务协调器 - 负责任务生命周期管理
 */
export interface ITaskCoordinator {
  /** 当前执行的任务 */
  readonly currentTask: Task | null;
  /** 当前步骤索引 */
  readonly currentStepIndex: number;

  /**
   * 初始化新任务
   * @param userInput 用户输入
   * @returns 创建的任务
   */
  initializeTask(userInput: string): Task;

  /**
   * 获取下一步骤
   * @returns 下一步骤或 null（如果任务完成）
   */
  getNextStep(): TaskStep | null;

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
  ): void;

  /**
   * 标记任务完成
   * @param success 是否成功
   * @param result 最终结果
   */
  completeTask(success: boolean, result?: string): void;

  /**
   * 标记任务失败
   * @param error 错误信息
   */
  failTask(error: string): void;

  /**
   * 检查是否超时
   * @param startTime 开始时间
   * @param timeoutMs 超时时间（毫秒）
   * @returns 是否超时
   */
  isTimeout(startTime: number, timeoutMs: number): boolean;
}

// ============================================================
// 执行引擎接口
// ============================================================

/**
 * 执行上下文
 */
export interface ExecutionContext {
  /** 任务ID */
  taskId: string;
  /** 用户输入 */
  userInput: string;
  /** 意图 */
  intent?: string;
  /** 步骤索引 */
  stepIndex: number;
  /** 共享上下文 */
  sharedContext: Record<string, unknown>;
  /** 输出回调 */
  onOutput?: (text: string) => void;
}

/**
 * 执行引擎 - 负责步骤执行
 */
export interface IExecutionEngine {
  /**
   * 执行工具步骤
   * @param step 任务步骤
   * @param context 执行上下文
   * @returns 执行结果
   */
  executeToolStep(step: TaskStep, context: ExecutionContext): Promise<ToolResult>;

  /**
   * 执行推理步骤
   * @param step 任务步骤
   * @param context 执行上下文
   * @returns 执行结果
   */
  executeReasoningStep(step: TaskStep, context: ExecutionContext): Promise<ToolResult>;

  /**
   * 检查步骤是否需要确认
   * @param step 任务步骤
   * @returns 是否需要确认
   */
  requiresConfirmation(step: TaskStep): boolean;

  /**
   * 格式化工具结果
   * @param result 工具结果
   * @returns 格式化后的字符串
   */
  formatToolResult(result: ToolResult): string;
}

// ============================================================
// 反思引擎接口
// ============================================================

/**
 * 反思结果
 */
export interface ReflectionResult {
  /** 反思内容 */
  content: string;
  /** 自校正次数 */
  corrections: number;
  /** 改进建议 */
  improvements: string[];
  /** 整体评分 */
  overallRating: number;
}

/**
 * 反思引擎 - 负责执行反思和学习
 */
export interface IReflectionEngine {
  /**
   * 执行步骤反思
   * @param step 任务步骤
   * @param context 执行上下文
   * @returns 反思结果
   */
  reflectOnStep(step: TaskStep, context: ExecutionContext): Promise<ReflectionResult>;

  /**
   * 执行任务级反思
   * @param task 完成的任务
   * @returns 反思结果
   */
  reflectOnTask(task: Task): Promise<ReflectionResult>;

  /**
   * 生成改进建议
   * @param task 任务
   * @returns 改进建议列表
   */
  generateImprovements(task: Task): Promise<string[]>;
}

// ============================================================
// 学习引擎接口
// ============================================================

/**
 * 经验条目
 */
export interface ExperienceEntry {
  /** 经验ID */
  id: string;
  /** 时间戳 */
  timestamp: string;
  /** 任务类型 */
  taskType: string;
  /** 任务描述 */
  taskDescription: string;
  /** 决策记录 */
  decisions: Array<{
    context: string;
    chosen: string;
    outcome: 'success' | 'failure' | 'partial';
    confidence: number;
    reasoning: string;
  }>;
  /** 经验教训 */
  lessons: string[];
  /** 改进建议 */
  improvements: string[];
  /** 模式识别 */
  patterns: string[];
  /** 情绪状态 */
  emotionalTone: 'excited' | 'confident' | 'neutral' | 'cautious' | 'frustrated';
}

/**
 * 学习引擎 - 负责经验管理和学习
 */
export interface ILearningEngine {
  /**
   * 从任务中学习
   * @param task 完成的任务
   * @param reflection 反思结果
   * @returns 经验条目
   */
  learnFromTask(task: Task, reflection: ReflectionResult): Promise<ExperienceEntry>;

  /**
   * 存储经验
   * @param experience 经验条目
   */
  storeExperience(experience: ExperienceEntry): Promise<void>;

  /**
   * 获取行为指导
   * @returns 行为指导字符串
   */
  getBehaviorGuidelines(): Promise<string>;

  /**
   * 加载历史经验
   */
  loadExperiences(): Promise<void>;
}

// ============================================================
// 状态管理器接口
// ============================================================

/**
 * 状态转换监听器
 */
export type StateTransitionListener = (
  from: ExecutionPhase,
  to: ExecutionPhase
) => void;

/**
 * 状态管理器 - 负责 Agent 状态管理
 */
export interface IStateManager {
  /** 当前阶段 */
  readonly currentPhase: ExecutionPhase;

  /**
   * 转换到指定阶段
   * @param phase 目标阶段
   * @returns 是否成功
   */
  transitionTo(phase: ExecutionPhase): boolean;

  /**
   * 检查是否允许转换
   * @param from 源阶段
   * @param to 目标阶段
   * @returns 是否允许
   */
  isValidTransition(from: ExecutionPhase, to: ExecutionPhase): boolean;

  /**
   * 注册状态转换监听器
   * @param listener 监听器函数
   */
  onTransition(listener: StateTransitionListener): void;

  /**
   * 获取阶段显示名称
   * @param phase 阶段
   * @returns 显示名称
   */
  getPhaseDisplayName(phase: ExecutionPhase): string;
}

// ============================================================
// 信任检查器接口
// ============================================================

/**
 * 信任问题
 */
export interface TrustIssue {
  /** 问题级别 */
  level: 'low' | 'medium' | 'high' | 'critical';
  /** 问题描述 */
  description: string;
  /** 建议操作 */
  suggestion?: string;
}

/**
 * 信任报告
 */
export interface TrustReport {
  /** 是否需要确认 */
  requiresConfirmation: boolean;
  /** 问题列表 */
  issues: TrustIssue[];
  /** 摘要 */
  summary: string;
}

/**
 * 信任检查器 - 负责安全检查
 */
export interface ITrustChecker {
  /**
   * 检查步骤结果
   * @param result 步骤结果
   * @param context 上下文信息
   * @returns 信任报告
   */
  checkStep(result: string, context: { intent?: string; toolUsed?: string }): TrustReport;

  /**
   * 询问用户确认
   * @param report 信任报告
   * @returns 用户是否确认
   */
  askUserConfirmation(report: TrustReport): Promise<boolean>;
}

// ============================================================
// 上下文管理器接口
// ============================================================

/**
 * 上下文管理器 - 负责管理 Agent 上下文
 */
export interface IContextManager {
  /**
   * 构建上下文
   * @param userInput 用户输入
   * @param maxTokens 最大令牌数
   * @returns 构建的上下文
   */
  buildContext(userInput: string, maxTokens: number): Promise<string>;

  /**
   * 添加工具结果到上下文
   * @param toolName 工具名称
   * @param result 工具结果
   * @param success 是否成功
   */
  addToolResult(toolName: string, result: string, success: boolean): Promise<void>;

  /**
   * 获取当前上下文
   * @returns 上下文字符串
   */
  getContext(): string;

  /**
   * 清空上下文
   */
  clearContext(): void;
}

// ============================================================
// 服务工厂接口
// ============================================================

/**
 * 服务工厂 - 用于创建和配置服务实例
 */
export interface IAgentServiceFactory {
  createTaskCoordinator(): ITaskCoordinator;
  createExecutionEngine(): IExecutionEngine;
  createReflectionEngine(): IReflectionEngine;
  createLearningEngine(): ILearningEngine;
  createStateManager(taskId: string): IStateManager;
  createTrustChecker(): ITrustChecker;
  createContextManager(maxTokens: number): IContextManager;
}
