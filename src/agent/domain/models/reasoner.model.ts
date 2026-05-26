/**
 * 推理器领域模型
 */

import type { ProviderType } from '../../../types.js';

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
