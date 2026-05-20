import type { ProviderType } from '../types.js';

// ==================== 任务与步骤类型 ====================

/**
 * 任务步骤接口
 */
export interface TaskStep {
  id: number;
  description: string;
  tool?: string;
  args?: Record<string, unknown>;
  status: 'pending' | 'running' | 'done' | 'error' | 'skipped';
  result?: string;
  error?: string;
}

/**
 * 任务接口
 */
export interface Task {
  id: string;
  userInput: string;
  intent?: string;
  steps: TaskStep[];
  currentStep: number;
  status: 'planning' | 'executing' | 'completed' | 'failed' | 'timeout';
  result?: string;
  startedAt: number;
  completedAt?: number;
}

// ==================== 推理器类型 ====================

/**
 * 推理器配置
 */
export interface ReasonerConfig {
  /** LLM 提供商类型，不指定则用全局默认 */
  provider?: ProviderType;
  /** 模型名称，不指定则用提供商默认模型 */
  model?: string;
  /** 生成温度，默认 0.3（推理任务需要低温度以保证稳定输出） */
  temperature?: number;
  /** 最大生成 token 数，默认 2048 */
  maxTokens?: number;
  /** 超时时间（毫秒），默认 60000 */
  timeout?: number;
}

/**
 * 通用推理步骤的上下文
 */
export interface ReasonContext {
  /** 用户原始任务描述 */
  taskDescription: string;
  /** 识别的意图（如 bug-hunter、fullstack） */
  intent: string;
  /** 当前步骤描述（如"分析错误原因"） */
  stepDescription: string;
  /** 之前步骤的执行结果，作为上下文传入 */
  previousResults: string[];
  /** 当前可用的工具列表 */
  availableTools: string[];
}

/**
 * 代码生成上下文
 */
export interface CodeContext {
  /** 用户原始任务描述 */
  taskDescription: string;
  /** 识别的意图 */
  intent: string;
  /** 编程语言（如 TypeScript、Python） */
  language?: string;
  /** 具体需求列表 */
  requirements: string[];
  /** 之前步骤的执行结果 */
  previousResults: string[];
}

/**
 * 代码分析上下文
 */
export interface AnalyzeContext {
  /** 要分析的代码内容 */
  code: string;
  /** 任务描述 */
  taskDescription: string;
  /** 分析关注点（如 "安全"、"性能"、"bug"、"可读性"） */
  focus?: string;
}

// ==================== 上下文管理类型 ====================

/**
 * 上下文消息接口
 */
export interface ContextMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
  timestamp: number;
  /** 0-1，用于智能截断 */
  importance?: number;
}

// ==================== 输出验证类型 ====================

/**
 * 验证结果接口
 */
export interface ValidationResult {
  /** 验证是否通过 */
  valid: boolean;
  /** 错误信息列表 */
  errors: string[];
  /** 改进建议列表（可选） */
  suggestions?: string[];
}

/**
 * 输出模式定义接口
 */
export interface OutputSchema {
  /** 输出内容类型 */
  type: 'code' | 'json' | 'markdown' | 'text';
  /** 必须包含的内容列表 */
  required?: string[];
  /** 必须匹配的正则表达式模式 */
  patterns?: RegExp[];
  /** 禁止匹配的正则表达式模式 */
  forbidden?: RegExp[];
  /** 最大长度限制 */
  maxLength?: number;
  /** 最小长度限制 */
  minLength?: number;
}

// ==================== 信任管理类型 ====================

/**
 * 信任级别枚举
 * 从 SAFE 到 CRITICAL 递增，级别越高风险越大
 */
export enum TrustLevel {
  SAFE = 'safe',
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

/**
 * 信任问题接口
 * 描述检测到的单个信任问题
 */
export interface TrustIssue {
  /** 问题描述 */
  description: string;
  /** 信任级别 */
  level: TrustLevel;
  /** 问题类别 */
  category: 'hallucination' | 'dangerous_op' | 'sensitive_info' | 'uncertainty' | 'quality';
  /** 修复建议 */
  suggestion?: string;
}

/**
 * 信任报告接口
 */
export interface TrustReport {
  /** 是否需要用户确认 */
  requiresConfirmation: boolean;
  /** 检测到的问题列表 */
  issues: TrustIssue[];
  /** 报告摘要 */
  summary: string;
  /** 整体信任级别 */
  overallLevel: TrustLevel;
}
