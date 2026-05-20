/**
 * Agent Services Module
 *
 * 提供 Agent 核心功能的服务实现和接口定义。
 */

// ============================================================
// 接口定义
// ============================================================

export type {
  // 核心接口
  ITaskCoordinator,
  IExecutionEngine,
  IReflectionEngine,
  ILearningEngine,
  IStateManager,
  ITrustChecker,
  IContextManager,
  IAgentServiceFactory,

  // 执行上下文和结果类型
  ExecutionContext,
  ReflectionResult,
  ExperienceEntry,
  TrustIssue,
  TrustReport,
  StateTransitionListener,
} from './interfaces.js';

// ============================================================
// 服务实现
// ============================================================

export { TaskCoordinator } from './task-coordinator.js';
export { AgentServiceFactory, agentServiceFactory } from './factory.js';

// ============================================================
// 版本
// ============================================================

export const AGENT_SERVICES_VERSION = '1.0.0';
