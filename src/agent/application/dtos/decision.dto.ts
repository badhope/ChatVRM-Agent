/**
 * 决策 DTO
 * 应用层数据传输对象
 */

export interface DecisionRequest {
  taskId: string;
  description: string;
  context: Record<string, unknown>;
  alternatives: DecisionAlternativeDTO[];
  confidence: number;
}

export interface DecisionAlternativeDTO {
  id: string;
  title: string;
  description: string;
  pros: string[];
  cons: string[];
}

export interface DecisionResponse {
  decisionId: string;
  taskId: string;
  chosenAlternativeId: string;
  rationale: string;
  confidence: number;
  timestamp: string;
}

export interface RecordDecisionOutcomeRequest {
  decisionId: string;
  success: boolean;
  result: string;
  gapAnalysis?: string;
  lessonsLearned?: string[];
}
