/**
 * 决策仓储接口（领域层）
 */

import type { Decision, Reflection, DecisionStats } from '../models/decision.model.js';

export interface DecisionRepository {
  saveDecision(decision: Decision): Promise<void>;
  getDecision(id: string): Promise<Decision | null>;
  getDecisionsByTask(taskId: string): Promise<Decision[]>;
  saveReflection(reflection: Reflection): Promise<void>;
  getReflection(id: string): Promise<Reflection | null>;
  getReflectionsByTask(taskId: string): Promise<Reflection[]>;
  getStats(): Promise<DecisionStats>;
  loadAll(): Promise<void>;
  saveAll(): Promise<void>;
}
