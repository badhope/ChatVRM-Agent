/**
 * Agent Module
 *
 * 统一导出 Agent 相关的所有类型、类和函数。
 * 提供向后兼容的 API 设计。
 */

// ==================== Core Types ====================
export type {
  TaskStep,
  Task,
  ReasonerConfig,
  ReasonContext,
  CodeContext,
  AnalyzeContext,
  ContextMessage,
  ValidationResult,
  OutputSchema,
  TrustIssue,
  TrustReport,
} from './types.js';

export { TrustLevel } from './types.js';

// ==================== Core Module Types ====================
export {
  ExecutionPhase,
  type AgentConfig,
  type AgentState,
  type AgentContext,
  type ToolCall,
  type ToolResult,
  type StepExecutionContext,
  type AgentExecutionResult,
  type ExperienceContext,
  type StateTransitionResult,
  type TaskTypeInference,
} from './core/types.js';

// ==================== State Machine ====================
export {
  AgentStateMachine,
  createStateMachine,
  isValidTransition,
  getPhaseDisplayName,
} from './core/state-machine.js';

// ==================== Tool Executor ====================
export {
  executeToolStep,
  executeReasoningStep,
  isStepTimeout,
  getRemainingTime,
  formatToolResult,
  requiresConfirmation,
  type ToolExecutionOptions,
} from './core/tool-executor.js';

// ==================== Response Parser ====================
export {
  extractJsonBlock,
  extractJsonObject,
  parseToolCall,
  parseMultipleToolCalls,
  extractReasoning,
  extractSteps,
  parseIntent,
  parseConfidence,
  safeJsonParse,
  validateResponseFields,
  extractCodeBlock,
  type ParseResult,
} from './core/response-parser.js';

// ==================== Main Core ====================
export {
  AgentExecutor,
  runAgentTask,
} from './core.js';

// Re-export types from core for convenience
export type { TaskStep as AgentTaskStep, Task as AgentTask } from './types.js';

// ==================== Intent Recognizer ====================
export { IntentRecognizer, type IntentResult } from './intent-recognizer.js';

// ==================== Task Planner ====================
export { planTask } from './task-planner.js';

// ==================== Step Executor ====================
export { executeStep } from './step-executor.js';

// ==================== Reasoner ====================
export {
  reasonStep,
  reasonWithSelfCorrection,
  generateCode,
  analyzeCode,
} from './reasoner.js';

// ==================== Trust System ====================
export {
  detectIssues,
  generateTrustReport,
  askUserConfirmation,
  TrustLevel as TrustLevelValue,
  type TrustIssue as TrustIssueType,
  // 新增导出
  TrustDetector,
  type DetectionContext,
  calculateTrustScore,
  getScoreGrade,
  shouldRequireConfirmation,
  formatTrustOutput,
  askHighRiskConfirmation,
  performTrustCheck,
  batchTrustCheck,
  type TrustReport as TrustReportType,
  type ConfirmationOptions,
} from './trust.js';

// Import generateTrustReport for type inference
import { generateTrustReport } from './trust.js';

// TrustReport type is the return type of generateTrustReport
export type TrustReportReturnType = ReturnType<typeof generateTrustReport>;

// ==================== Output Validator (with Zod) ====================
export {
  OutputValidator,
  JsonSchema,
  CodeBlockSchema,
  MarkdownHeadingSchema,
  ToolCallSchema,
  MultipleToolCallsSchema,
  DEFAULT_SCHEMAS,
  DEFAULT_ZOD_SCHEMAS,
  createObjectSchema,
  createArraySchema,
  createStringSchema,
} from './output-validator.js';

// Import zod for external use
export { z } from 'zod';

// ==================== Context Management ====================
export { ContextManager } from './context-manager.js';
export { ContextBuilder, contextBuilder } from './context-builder.js';

// ==================== Decision & Learning ====================
export { DecisionReflector } from './decision-reflector.js';
export { ExperienceStore, type Experience } from './experience-store.js';

// ==================== Personality & Emotion ====================
export { PersonalityManager } from './personality.js';
export { EmotionalStateManager } from './emotional-state.js';

// ==================== Change Control ====================
export { ChangeControlManager } from './change-control.js';

// ==================== Utilities ====================
export {
  parseToolArgsFromAI,
  generateSummary,
} from './agent-utils.js';

// ==================== Version ====================
export const AGENT_MODULE_VERSION = '2.1.0';
