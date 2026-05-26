/**
 * Agent Module
 *
 * 统一导出 Agent 相关的所有类型、类和函数。
 * 使用新的 DDD 架构
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
} from './infrastructure/core/types.js';

// ==================== State Machine ====================
export {
  AgentStateMachine,
  createStateMachine,
  isValidTransition,
  getPhaseDisplayName,
} from './infrastructure/core/state-machine.js';

// ==================== Tool Executor ====================
export {
  executeToolStep,
  executeReasoningStep,
  isStepTimeout,
  getRemainingTime,
  formatToolResult,
  requiresConfirmation,
  type ToolExecutionOptions,
} from './infrastructure/core/tool-executor.js';

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
} from './infrastructure/core/response-parser.js';

// ==================== Main Core ====================
export { AgentExecutor, runAgentTask } from './core.js';

// Re-export types from core for convenience
export type { TaskStep as AgentTaskStep, Task as AgentTask } from './types.js';

// ==================== Intent Recognizer ====================
export { IntentRecognizer, type IntentResult } from './infrastructure/common/intent-recognizer.js';

// ==================== Task Planner ====================
export { planTask } from './infrastructure/common/task-planner.js';

// ==================== Step Executor ====================
export { executeStep } from './infrastructure/core/tool-executor.js';

// ==================== Reasoner ====================
export { reasonStep, reasonWithSelfCorrection, generateCode, analyzeCode } from './infrastructure/common/reasoner.js';

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
} from './infrastructure/trust/trust.js';

// Import generateTrustReport for type inference
import { generateTrustReport } from './infrastructure/trust/trust.js';

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
} from './infrastructure/output-validator/output-validator.js';

// Import zod for external use
export { z } from 'zod';

// ==================== Context Management ====================
export { ContextManager } from './infrastructure/common/context-manager.js';
export { ContextBuilder, contextBuilder } from './infrastructure/common/context-builder.js';

// ==================== 新架构 (DDD) 导出 ====================

// Domain Models
export {
  // Personality
  DEFAULT_PERSONALITY,
  createDefaultIdentity,
  type PersonalityTraits,
  type AgentIdentity,
} from './domain/models/personality.model.js';

export {
  // Emotion
  EMOTION_PRIORITY,
  EMOTION_DESCRIPTION,
  MOOD_DELTA,
  type Emotion,
  type EmotionalEvent,
  type EmotionalState,
  type EmotionSuggestion,
} from './domain/models/emotion.model.js';

export {
  // Decision
  type Decision,
  type DecisionContext,
  type DecisionResult,
} from './domain/models/decision.model.js';

export {
  // Experience
  type Experience,
  type ExperiencePattern,
  type LearningInsight,
} from './domain/models/experience.model.js';

// Domain Services
export {
  PersonalityService,
  EmotionService,
  DecisionService,
  ExperienceService,
} from './domain/services/index.js';

// Application Services
export {
  PersonalityApplicationService,
  EmotionApplicationService,
  DecisionApplicationService,
  ExperienceApplicationService,
} from './application/services/index.js';

// Controllers
export { PersonalityController } from './interfaces/controllers/personality.controller.js';
export { DecisionController } from './interfaces/controllers/decision.controller.js';

// Repositories
export { PersonalityRepository } from './domain/repositories/personality.repository.js';
export { DecisionRepository } from './domain/repositories/decision.repository.js';
export { ExperienceRepository } from './domain/repositories/experience.repository.js';

// Infrastructure
export { JsonPersonalityRepository } from './infrastructure/repositories/personality.repository.js';
export { JsonDecisionRepository } from './infrastructure/repositories/decision.repository.js';
export { JsonExperienceRepository } from './infrastructure/repositories/experience.repository.js';
export { emotionalMachine } from './infrastructure/state-machines/emotional.machine.js';

// ==================== Version ====================
export const AGENT_MODULE_VERSION = '3.0.0';
