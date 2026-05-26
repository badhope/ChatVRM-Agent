/**
 * 人格仓储实现（基础设施层）
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { DEVFLOW_DIR } from '../../../utils/index.js';
import type { PersonalityRepository } from '../../domain/repositories/personality.repository.js';
import type { AgentIdentity } from '../../domain/models/personality.model.js';
import { PersonalityService } from '../../domain/services/personality.service.js';

export class JsonPersonalityRepository implements PersonalityRepository {
  private filePath: string;

  constructor(configDir?: string) {
    this.filePath = path.join(configDir || DEVFLOW_DIR, 'personality.json');
  }

  async loadIdentity(): Promise<AgentIdentity | null> {
    try {
      const data = await fs.readFile(this.filePath, 'utf-8');
      const parsed = JSON.parse(data) as Partial<AgentIdentity>;
      return PersonalityService.mergeWithDefaults(parsed);
    } catch {
      return null;
    }
  }

  async saveIdentity(identity: AgentIdentity): Promise<void> {
    try {
      const dir = path.dirname(this.filePath);
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(this.filePath, JSON.stringify(identity, null, 2), 'utf-8');
    } catch (error) {
      console.debug('Failed to save personality data:', error);
    }
  }
}
