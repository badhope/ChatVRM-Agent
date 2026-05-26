/**
 * 人格仓储接口（抽象层）
 */

import type { AgentIdentity } from '../models/personality.model.js';

export interface PersonalityRepository {
  loadIdentity(): Promise<AgentIdentity | null>;
  saveIdentity(identity: AgentIdentity): Promise<void>;
}
