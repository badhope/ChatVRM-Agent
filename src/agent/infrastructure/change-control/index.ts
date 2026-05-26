/**
 * 变更控制系统 - 入口文件
 *
 * 重新导出所有子模块的公共接口，提供统一的访问入口。
 */

// Re-export from main change-control module
export { ChangeControlManager } from '../../change-control.js';

// Re-export from risk-assessor submodule
export {
  assessFileRisk,
  getRiskStyle,
  getRiskLabel,
  getRiskColor,
  isRiskAtOrAbove,
  isAutoApprovable,
  RiskLevel,
  RISK_LEVEL_WEIGHT,
  RISK_LEVEL_LABEL,
  RISK_LEVEL_STYLE,
  RISK_RULES,
  assessRisk,
} from './risk-assessor.js';

// Re-export from approval submodule
export { formatRiskSummary, requestApproval, isInteractiveMode, backupFile, createSnapshot, rollback } from './approval.js';

// Re-export types
export type { ChangeRecord, ApprovalResult, RiskAssessmentResult } from './types.js';
