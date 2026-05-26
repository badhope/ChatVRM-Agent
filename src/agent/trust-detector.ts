/**
 * 信任管理器 - 问题检测器
 *
 * 此文件为重导出模块，保持向后兼容性。
 * 实际实现已拆分到 trust/ 子目录。
 *
 * @module trust-detector
 */

// ==================== Re-export from trust submodules ====================

// Types
export type {
  SeverityLevel,
  DetectionPattern,
  PatternCategory,
  DetectionContext,
} from './trust/index.js';

// Patterns
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
} from './trust/index.js';

// Severity
export {
  SEVERITY_LEVELS,
  getSeverityLevel,
  sortIssuesBySeverity,
  deduplicateAndSortIssues,
  isHighSeverity,
  createIssueFromPattern,
} from './trust/index.js';

// Context
export {
  isTestFile,
  shouldSkipInTest,
  getToolContext,
  detectShellContext,
  detectDatabaseContext,
  detectFileContext,
  detectNetworkContext,
  detectWithContext,
} from './trust/index.js';

// Detector
export { TrustDetector, detectIssues } from './trust/index.js';
