export type TrustLevel = 'safe' | 'low_risk' | 'medium_risk' | 'high_risk';

export interface TrustIssue {
  type: string;
  level: TrustLevel;
  description: string;
  suggestion: string;
}

export interface TrustVerdict {
  level: TrustLevel;
  score: number;
  requiresConfirmation: boolean;
  issues: TrustIssue[];
  summary: string;
}

export interface ITrustPort {
  evaluate(output: string, context: string): Promise<TrustVerdict>;
  detectIssues(output: string, context: string): TrustIssue[];
}