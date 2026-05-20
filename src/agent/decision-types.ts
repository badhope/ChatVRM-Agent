/**
 * 决策反思器 - 类型定义
 *
 * 包含决策记录、反思、改进建议等核心数据结构。
 */

// ==================== 接口定义 ====================

/**
 * 决策记录接口
 */
export interface Decision {
  id: string;
  taskId: string;
  description: string;
  context: Record<string, any>;
  alternatives: Alternative[];
  chosenAlternative: string;
  rationale: string;
  confidence: number;
  timestamp: Date;
  outcome?: DecisionOutcome;
}

/**
 * 备选方案接口
 */
export interface Alternative {
  id: string;
  description: string;
  pros: string[];
  cons: string[];
  risk: number;
  benefits: number;
}

/**
 * 决策结果接口
 */
export interface DecisionOutcome {
  success: boolean;
  actualResult: string;
  expectedResult: string;
  gapAnalysis: string;
  lessonsLearned: string[];
  timestamp: Date;
}

/**
 * 反思记录接口
 */
export interface Reflection {
  id: string;
  taskId: string;
  taskDescription: string;
  executionSummary: string;
  decisions: Decision[];
  successes: string[];
  failures: string[];
  improvements: ImprovementSuggestion[];
  overallRating: number;
  timestamp: Date;
}

/**
 * 改进建议接口
 */
export interface ImprovementSuggestion {
  id: string;
  category: 'process' | 'tool' | 'skill' | 'workflow' | 'other';
  priority: 'high' | 'medium' | 'low';
  description: string;
  recommendation: string;
  estimatedImpact: number;
}

/**
 * 反思查询接口
 */
export interface ReflectionQuery {
  taskId?: string;
  skillName?: string;
  dateRange?: { start: Date; end: Date };
  successThreshold?: number;
}

/**
 * 决策统计接口
 */
export interface DecisionStats {
  totalDecisions: number;
  avgConfidence: number;
  successRate: number;
  mostCommonCategories: string[];
  improvementOpportunities: number;
}
