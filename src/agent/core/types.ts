/**
 * Agent Core Types
 *
 * Core type definitions for the Agent system.
 * Extracted from core.ts for better modularity.
 */

import type { TaskStep, Task } from '../types.js';
import type { ContextManager } from '../context-manager.js';
import type { ContextBuilder } from '../context-builder.js';
import type { ChangeControlManager } from '../change-control.js';
import type { DecisionReflector } from '../decision-reflector.js';
import type { ExperienceStore } from '../experience-store.js';
import type { PersonalityManager } from '../personality.js';
import type { EmotionalStateManager } from '../emotional-state.js';
import type { KnowledgeGraph } from '../../memory/knowledgeGraph.js';
import type { DirtyProtect, AutoCommitEngine } from '../../git/index.js';
import type { KnowledgeEntry } from '../context-builder.js';
import type { CodeIndex } from '../../analysis/indexer/types.js';

/**
 * Agent 配置选项
 */
export interface AgentConfig {
  /** 项目根目录 */
  rootDir?: string;
  /** 是否启用代码库地图 */
  enableRepoMap?: boolean;
  /** 是否启用知识图谱 */
  enableKnowledgeGraph?: boolean;
  /** 是否启用变更控制 */
  enableChangeControl?: boolean;
  /** 步骤变更回调 */
  onStepChange?: (step: TaskStep) => void;
  /** 输出回调 */
  onOutput?: (text: string) => void;
}

/**
 * Agent 执行器状态
 */
export interface AgentState {
  /** 当前任务 */
  task: Task;
  /** 当前步骤索引 */
  currentStep: number;
  /** 是否正在执行 */
  isExecuting: boolean;
  /** 任务开始时间 */
  startTime: number;
  /** 当前决策ID */
  currentDecisionId?: string;
  /** 已变更的文件列表 */
  changedFiles: string[];
  /** 构建的上下文 */
  builtContext: string;
  /** 行为指导 */
  behaviorGuidelines: string;
}

/**
 * Agent 执行上下文
 * 包含执行过程中需要的所有管理器实例
 */
export interface AgentContext {
  /** 上下文管理器 */
  contextManager: ContextManager;
  /** 上下文构建器 */
  contextBuilder: ContextBuilder;
  /** 变更控制管理器 */
  changeControl: ChangeControlManager;
  /** 决策反射器 */
  decisionReflector: DecisionReflector;
  /** 经验存储 */
  experienceStore: ExperienceStore;
  /** 人格管理器 */
  personalityManager: PersonalityManager;
  /** 情绪状态管理器 */
  emotionalState: EmotionalStateManager;
  /** 知识图谱 */
  knowledgeGraph: KnowledgeGraph;
  /** Git 脏保护 */
  dirtyProtect: DirtyProtect;
  /** 自动提交引擎 */
  autoCommit: AutoCommitEngine;
  /** 代码索引 */
  codeIndex?: CodeIndex;
  /** 代码库地图 */
  repoMap?: string;
  /** 项目根目录 */
  rootDir: string;
}

/**
 * 工具调用定义
 */
export interface ToolCall {
  /** 工具名称 */
  tool: string;
  /** 工具参数 */
  args: Record<string, unknown>;
  /** 调用原因 */
  reasoning?: string;
}

/**
 * 工具执行结果
 */
export interface ToolResult {
  /** 是否成功 */
  success: boolean;
  /** 输出内容 */
  output?: string;
  /** 错误信息 */
  error?: string;
  /** 执行耗时（毫秒） */
  duration?: number;
}

/**
 * 执行阶段枚举
 */
export enum ExecutionPhase {
  /** 初始化 */
  INITIALIZING = 'initializing',
  /** 理解任务 */
  UNDERSTANDING = 'understanding',
  /** 规划步骤 */
  PLANNING = 'planning',
  /** 执行步骤 */
  EXECUTING = 'executing',
  /** 验证结果 */
  VALIDATING = 'validating',
  /** 反思总结 */
  REFLECTING = 'reflecting',
  /** 完成 */
  COMPLETED = 'completed',
  /** 失败 */
  FAILED = 'failed',
  /** 超时 */
  TIMEOUT = 'timeout',
}

/**
 * 任务类型推断结果
 */
export interface TaskTypeInference {
  /** 任务类型 */
  type: string;
  /** 置信度 */
  confidence: number;
  /** 推断依据 */
  reasoning: string;
}

/**
 * 经验学习上下文
 */
export interface ExperienceContext {
  /** 任务描述 */
  taskDescription: string;
  /** 任务类型 */
  taskType: string;
  /** 执行步骤 */
  steps: TaskStep[];
  /** 整体评分 */
  overallRating: number;
  /** 改进建议 */
  improvements: string[];
  /** 成功模式 */
  successes: string[];
  /** 失败模式 */
  failures: string[];
}

/**
 * 步骤执行上下文
 */
export interface StepExecutionContext {
  /** 步骤索引 */
  stepIndex: number;
  /** 步骤定义 */
  step: TaskStep;
  /** 全局上下文 */
  globalContext: Record<string, unknown>;
  /** 任务开始时间 */
  taskStartTime: number;
  /** 超时时间（毫秒） */
  timeoutMs: number;
}

/**
 * 状态转换结果
 */
export interface StateTransitionResult {
  /** 是否允许转换 */
  allowed: boolean;
  /** 新状态 */
  newState?: ExecutionPhase;
  /** 阻止原因 */
  reason?: string;
}

/**
 * 代理执行结果
 */
export interface AgentExecutionResult {
  /** 任务对象 */
  task: Task;
  /** 是否成功 */
  success: boolean;
  /** 执行时长（毫秒） */
  duration: number;
  /** 经验ID */
  experienceId?: string;
}

// Re-export types from parent module for convenience
export type { TaskStep, Task, KnowledgeEntry };
