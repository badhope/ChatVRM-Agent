/**
 * 变更控制系统 - 入口文件
 *
 * 重新导出所有子模块的公共接口，提供统一的访问入口。
 * 导入方式：
 *
 * @example
 * ```typescript
 * // 从入口文件导入所有公共接口
 * import { ChangeControlManager, RiskLevel, backupFile } from '../agent/change-control/index.js';
 *
 * // 或者直接从子模块导入（更精确的控制）
 * import { ChangeControlManager } from '../agent/change-control.js';
 * import { assessFileRisk, getRiskColor } from './risk-assessor.js';
 * ```
 */

// Re-export from main change-control module
export {
  ChangeControlManager,
  RiskLevel,
  RISK_LEVEL_WEIGHT,
  RISK_LEVEL_LABEL,
  RISK_LEVEL_STYLE,
  RISK_RULES,
  assessRisk,
  backupFile,
  createSnapshot,
  rollback,
} from '../change-control.js';

// Re-export types (types.js is in same subdirectory)
export type { ChangeRecord } from './types.js';
export type { ApprovalResult, RiskAssessmentResult } from './types.js';

// Re-export from risk-assessor submodule
export {
  assessFileRisk,
  getRiskStyle,
  getRiskLabel,
  getRiskColor,
  isRiskAtOrAbove,
  isAutoApprovable,
} from './risk-assessor.js';

// Re-export from approval submodule
export {
  formatRiskSummary,
  requestApproval,
  isInteractiveMode,
} from './approval.js';
