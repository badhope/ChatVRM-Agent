/**
 * 经验领域模型
 */

export type EmotionalTone = 'neutral' | 'excited' | 'confident' | 'cautious' | 'frustrated';

export interface ExperienceDecision {
  context: string;
  chosen: string;
  outcome: 'success' | 'failure' | 'partial';
  confidence: number;
  reasoning: string;
}

export interface Experience {
  id: string;
  timestamp: string;
  taskType: string;
  taskDescription: string;
  decisions: ExperienceDecision[];
  lessons: string[];
  improvements: string[];
  patterns: string[];
  emotionalTone: EmotionalTone;
}
