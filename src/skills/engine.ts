import { EventEmitter } from 'eventemitter3';
import { createLogger, Logger } from '../services/logger.js';
import {
  SkillDefinition,
  SkillContext,
  SkillResult,
  SkillMatch,
  SkillRegistryEntry,
  SkillExecutionStats,
  SkillExecutionContext,
  SkillValidatorResult
} from './definition.js';

export class SkillEngine extends EventEmitter {
  private logger: Logger;
  private registry: Map<string, SkillDefinition> = new Map();
  private executionHistory: Map<string, SkillExecutionStats> = new Map();
  private maxHistorySize = 1000;

  constructor() {
    super();
    this.logger = createLogger('SkillEngine');
  }

  public async register(skill: SkillDefinition): Promise<void> {
    const validation = this.validate(skill);

    if (!validation.valid) {
      throw new Error(`Invalid skill definition: ${validation.errors.map(e => e.message).join(', ')}`);
    }

    this.registry.set(skill.name, skill);

    this.executionHistory.set(skill.name, {
      totalExecutions: 0,
      successfulExecutions: 0,
      failedExecutions: 0,
      averageExecutionTime: 0
    });

    this.logger.info({ name: skill.name, version: skill.version }, 'Skill registered');
    this.emit('skill:registered', skill);
  }

  public async unregister(skillName: string): Promise<void> {
    if (!this.registry.has(skillName)) {
      throw new Error(`Skill not found: ${skillName}`);
    }

    this.registry.delete(skillName);
    this.logger.info({ name: skillName }, 'Skill unregistered');
    this.emit('skill:unregistered', skillName);
  }

  public async get(skillName: string): Promise<SkillDefinition | null> {
    return this.registry.get(skillName) || null;
  }

  public async list(): Promise<SkillDefinition[]> {
    return Array.from(this.registry.values());
  }

  public async match(query: string, context?: SkillContext): Promise<SkillMatch[]> {
    const normalizedQuery = query.toLowerCase().trim();
    const matches: SkillMatch[] = [];

    for (const skill of this.registry.values()) {
      const score = this.calculateMatchScore(skill, normalizedQuery, context);

      if (score > 0.3) {
        matches.push({
          skill,
          score,
          matchedTrigger: this.findBestTrigger(skill, normalizedQuery) || ''
        });
      }
    }

    return matches.sort((a, b) => b.score - a.score);
  }

  public async execute(
    skillName: string,
    context: SkillContext,
    parameters?: Record<string, any>
  ): Promise<SkillResult> {
    const skill = this.registry.get(skillName);

    if (!skill) {
      return {
        success: false,
        output: '',
        error: `Skill not found: ${skillName}`
      };
    }

    const startTime = Date.now();

    try {
      const action = this.selectBestAction(skill, context.message);

      const executionContext: SkillExecutionContext = {
        skill,
        action,
        parameters: parameters || {},
        context
      };

      const result = await this.executeAction(executionContext);

      this.recordExecution(skillName, true, Date.now() - startTime);

      this.logger.info({ skill: skillName, action: action.name, duration: Date.now() - startTime }, 'Skill executed successfully');

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      this.recordExecution(skillName, false, Date.now() - startTime);

      this.logger.error({ skill: skillName, error: errorMessage }, 'Skill execution failed');

      return {
        success: false,
        output: '',
        error: errorMessage
      };
    }
  }

  public async executeByMatch(
    query: string,
    context: SkillContext,
    parameters?: Record<string, any>
  ): Promise<SkillResult> {
    const matches = await this.match(query, context);

    if (matches.length === 0) {
      return {
        success: false,
        output: '',
        error: 'No matching skill found'
      };
    }

    const bestMatch = matches[0];

    return this.execute(bestMatch.skill.name, context, parameters);
  }

  public validate(skill: SkillDefinition): SkillValidatorResult {
    const errors: Array<{ field: string; message: string }> = [];
    const warnings: Array<{ field: string; message: string }> = [];

    if (!skill.name || skill.name.trim() === '') {
      errors.push({ field: 'name', message: 'Skill name is required' });
    } else if (!/^[a-z0-9-]+$/.test(skill.name)) {
      errors.push({ field: 'name', message: 'Skill name must contain only lowercase letters, numbers, and hyphens' });
    }

    if (!skill.description || skill.description.trim() === '') {
      errors.push({ field: 'description', message: 'Skill description is required' });
    }

    if (!skill.version || !/^\d+\.\d+\.\d+$/.test(skill.version)) {
      errors.push({ field: 'version', message: 'Version must be in semver format (e.g., 1.0.0)' });
    }

    if (!skill.triggers || skill.triggers.length === 0) {
      errors.push({ field: 'triggers', message: 'At least one trigger is required' });
    }

    if (!skill.actions || skill.actions.length === 0) {
      errors.push({ field: 'actions', message: 'At least one action is required' });
    }

    for (const action of skill.actions || []) {
      if (!action.name) {
        errors.push({ field: 'actions.name', message: 'Action name is required' });
      }
      if (!action.handler) {
        errors.push({ field: 'actions.handler', message: 'Action handler is required' });
      }
    }

    if (!skill.metadata?.createdAt) {
      warnings.push({ field: 'metadata.createdAt', message: 'Creation date is recommended' });
    }

    if (!skill.author) {
      warnings.push({ field: 'author', message: 'Author information is recommended' });
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  private calculateMatchScore(
    skill: SkillDefinition,
    query: string,
    context?: SkillContext
  ): number {
    let score = 0;

    for (const trigger of skill.triggers) {
      const normalizedTrigger = trigger.toLowerCase();

      if (normalizedTrigger === query) {
        score += 1.0;
      } else if (normalizedTrigger.includes(query)) {
        score += 0.8;
      } else if (query.includes(normalizedTrigger)) {
        score += 0.6;
      } else {
        const similarity = this.calculateSimilarity(query, normalizedTrigger);
        if (similarity > 0.5) {
          score += similarity * 0.5;
        }
      }
    }

    const descriptionWords = skill.description.toLowerCase().split(/\s+/);
    const queryWords = query.split(/\s+/);

    for (const queryWord of queryWords) {
      for (const descWord of descriptionWords) {
        if (descWord.includes(queryWord) || queryWord.includes(descWord)) {
          score += 0.1;
        }
      }
    }

    for (const tag of skill.tags) {
      if (query.includes(tag.toLowerCase())) {
        score += 0.2;
      }
    }

    if (context) {
      const stats = this.executionHistory.get(skill.name);
      if (stats && stats.totalExecutions > 0) {
        const successRate = stats.successfulExecutions / stats.totalExecutions;
        score *= (0.5 + successRate * 0.5);
      }
    }

    return Math.min(1.0, score);
  }

  private findBestTrigger(skill: SkillDefinition, query: string): string | null {
    let bestTrigger: string | null = null;
    let bestScore = 0;

    for (const trigger of skill.triggers) {
      const score = this.calculateTriggerScore(trigger, query);
      if (score > bestScore) {
        bestScore = score;
        bestTrigger = trigger;
      }
    }

    return bestTrigger;
  }

  private calculateTriggerScore(trigger: string, query: string): number {
    const normalizedTrigger = trigger.toLowerCase();
    const normalizedQuery = query.toLowerCase();

    if (normalizedTrigger === normalizedQuery) return 1.0;
    if (normalizedTrigger.startsWith(normalizedQuery)) return 0.9;
    if (normalizedTrigger.endsWith(normalizedQuery)) return 0.8;
    if (normalizedTrigger.includes(normalizedQuery)) return 0.7;

    return this.calculateSimilarity(normalizedQuery, normalizedTrigger);
  }

  private calculateSimilarity(str1: string, str2: string): number {
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;

    if (longer.length === 0) return 1.0;

    const editDistance = this.levenshteinDistance(longer, shorter);
    return (longer.length - editDistance) / longer.length;
  }

  private levenshteinDistance(str1: string, str2: string): number {
    const m = str1.length;
    const n = str2.length;
    const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));

    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;

    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        if (str1[i - 1] === str2[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1];
        } else {
          dp[i][j] = 1 + Math.min(
            dp[i - 1][j],
            dp[i][j - 1],
            dp[i - 1][j - 1]
          );
        }
      }
    }

    return dp[m][n];
  }

  private selectBestAction(skill: SkillDefinition, message: string): SkillDefinition['actions'][0] {
    if (skill.actions.length === 1) {
      return skill.actions[0];
    }

    const normalizedMessage = message.toLowerCase();

    for (const action of skill.actions) {
      if (normalizedMessage.includes(action.name.toLowerCase())) {
        return action;
      }
    }

    return skill.actions[0];
  }

  private async executeAction(context: SkillExecutionContext): Promise<SkillResult> {
    const { skill, action, parameters, context: skillContext } = context;

    this.logger.debug({ skill: skill.name, action: action.name, handler: action.handler }, 'Executing action');

    const output = `Executed ${skill.name}/${action.name} with context: ${skillContext.message}`;

    return {
      success: true,
      output,
      data: {
        skill: skill.name,
        action: action.name,
        parameters,
        timestamp: Date.now()
      },
      metadata: {
        skillVersion: skill.version,
        actionHandler: action.handler
      }
    };
  }

  private recordExecution(skillName: string, success: boolean, duration: number): void {
    const stats = this.executionHistory.get(skillName);

    if (!stats) return;

    stats.totalExecutions++;

    if (success) {
      stats.successfulExecutions++;
    } else {
      stats.failedExecutions++;
    }

    const totalTime = stats.averageExecutionTime * (stats.totalExecutions - 1) + duration;
    stats.averageExecutionTime = totalTime / stats.totalExecutions;
    stats.lastExecution = Date.now();

    if (this.executionHistory.size > this.maxHistorySize) {
      const oldestKey = this.executionHistory.keys().next().value as string | undefined;
      if (oldestKey) {
        this.executionHistory.delete(oldestKey);
      }
    }
  }

  public getExecutionStats(skillName: string): SkillExecutionStats | null {
    return this.executionHistory.get(skillName) || null;
  }

  public getAllStats(): Map<string, SkillExecutionStats> {
    return new Map(this.executionHistory);
  }

  public async learnFromTask(
    task: string,
    solution: string,
    context: SkillContext
  ): Promise<SkillDefinition | null> {
    this.logger.info({ task }, 'Learning from task');

    const skillName = this.extractSkillName(task);
    const triggers = this.extractTriggers(task);
    const description = this.generateDescription(task, solution);

    const skill: SkillDefinition = {
      name: skillName,
      description,
      version: '1.0.0',
      tags: ['learned'],
      triggers,
      actions: [
        {
          name: 'execute',
          description: `Execute the ${skillName} task`,
          handler: 'execute',
          returns: 'SkillResult'
        }
      ],
      examples: [
        {
          trigger: triggers[0],
          description,
          expectedOutput: solution
        }
      ],
      metadata: {
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    };

    const validation = this.validate(skill);
    if (validation.valid) {
      await this.register(skill);
      this.logger.info({ name: skillName }, 'Learned skill created');
      return skill;
    }

    this.logger.warn({ errors: validation.errors }, 'Could not learn skill, validation failed');
    return null;
  }

  private extractSkillName(task: string): string {
    const words = task.toLowerCase().split(/\s+/);
    const significantWords = words.filter(w => w.length > 3);

    return significantWords.slice(0, 3).join('-').replace(/[^a-z0-9-]/g, '');
  }

  private extractTriggers(task: string): string[] {
    const triggers: string[] = [];

    const words = task.toLowerCase().split(/\s+/);
    if (words.length > 0) {
      triggers.push(words[0]);
    }

    triggers.push(task.toLowerCase());

    return [...new Set(triggers)];
  }

  private generateDescription(task: string, solution: string): string {
    const taskSummary = task.length > 100 ? task.substring(0, 97) + '...' : task;
    return `Learned skill to: ${taskSummary}`;
  }

  public clearHistory(): void {
    this.executionHistory.clear();
    this.logger.info('Execution history cleared');
  }

  public exportSkills(): SkillDefinition[] {
    return Array.from(this.registry.values());
  }

  public async importSkills(skills: SkillDefinition[]): Promise<{
    imported: number;
    failed: number;
    errors: string[];
  }> {
    let imported = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const skill of skills) {
      try {
        await this.register(skill);
        imported++;
      } catch (error) {
        failed++;
        errors.push(`Failed to import ${skill.name}: ${error}`);
      }
    }

    return { imported, failed, errors };
  }
}

export default SkillEngine;
