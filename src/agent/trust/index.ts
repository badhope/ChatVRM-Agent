/**
 * Trust 模块统一导出
 *
 * 提供信任检测相关的所有类型、类和函数。
 */

// ==================== Types ====================
export type {
  SeverityLevel,
  DetectionPattern,
  PatternCategory,
} from './types.js';

// ==================== Patterns ====================
export {
  FILE_SYSTEM_PATTERNS,
  NETWORK_PATTERNS,
  CODE_PATTERNS,
  DATABASE_PATTERNS,
  SENSITIVE_PATTERNS,
  SYSTEM_PATTERNS,
  UNCERTAINTY_PATTERNS,
  HALLUCINATION_PATTERNS,
  ALL_DETECTION_PATTERNS,
  getAllPatterns,
  getPatternsByCategory,
} from './patterns.js';

// ==================== Severity ====================
export {
  SEVERITY_LEVELS,
  getSeverityLevel,
  sortIssuesBySeverity,
  deduplicateAndSortIssues,
  isHighSeverity,
  createIssueFromPattern,
} from './severity.js';

// ==================== Context ====================
export type { DetectionContext } from './context.js';

export {
  isTestFile,
  shouldSkipInTest,
  getToolContext,
  detectShellContext,
  detectDatabaseContext,
  detectFileContext,
  detectNetworkContext,
  detectWithContext,
} from './context.js';

// ==================== Detector ====================
export {
  TrustDetector,
  detectIssues,
} from './detector.js';
