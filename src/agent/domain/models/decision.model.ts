/**
 * 决策领域模型
 */

export interface Alternative {
  id: string;
  title: string;
  description: string;
  pros: string[];
  cons: string[];
}

export interface DecisionOutcome {
  success: boolean;
  result: string;
  timestamp: Date;
  gapAnalysis?: string;
  lessonsLearned?: string[];
}

export interface ImprovementSuggestion {
  priority: 'high' | 'medium' | 'low';
  description: string;
  recommendation: string;
  estimatedImpact?: number;
  category?: string;
}

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

export interface ReflectionQuery {
  taskId?: string;
  since?: Date;
  limit?: number;
  dateRange?: {
    start?: Date;
    end?: Date;
  };
  successThreshold?: number;
}

export interface DecisionStats {
  totalDecisions: number;
  successRate: number;
  averageConfidence: number;
  topPatterns: Array<{ pattern: string; count: number }>;
  improvementOpportunities?: number;
  mostCommonCategories?: string[];
}

export interface Decision {
  id: string;
  taskId: string;
  description: string;
  context: Record<string, unknown>;
  alternatives: Alternative[];
  chosenAlternative: string;
  rationale: string;
  confidence: number;
  timestamp: Date;
  outcome?: DecisionOutcome;
}
