/**
 * 经验仓储基础设施实现
 * 使用 JSON 文件系统进行持久化
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { MEMORY_DIR } from '../../../utils/index.js';
import type { ExperienceRepository } from '../../domain/repositories/experience.repository.js';
import type { Experience } from '../../domain/models/experience.model.js';

export class JsonExperienceRepository implements ExperienceRepository {
  private experiences: Experience[] = [];
  private filePath: string;

  constructor(configDir?: string) {
    this.filePath = path.join(configDir || MEMORY_DIR, 'experiences.json');
  }

  async loadAll(): Promise<void> {
    try {
      const data = await fs.readFile(this.filePath, 'utf-8');
      this.experiences = JSON.parse(data);
    } catch {
      this.experiences = [];
    }
  }

  async saveAll(): Promise<void> {
    try {
      const dir = path.dirname(this.filePath);
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(this.filePath, JSON.stringify(this.experiences, null, 2), 'utf-8');
    } catch (error) {
      // 持久化失败不应阻断主流程
    }
  }

  async addExperience(experience: Experience): Promise<void> {
    this.experiences.push(experience);

    if (this.experiences.length > 200) {
      this.experiences = this.experiences.slice(-200);
    }
  }

  async getExperience(id: string): Promise<Experience | null> {
    return this.experiences.find((exp) => exp.id === id) || null;
  }

  async getAllExperiences(): Promise<Experience[]> {
    return [...this.experiences];
  }

  async getExperienceCount(): Promise<number> {
    return this.experiences.length;
  }

  getExperienceCountSync(): number {
    return this.experiences.length;
  }

  async generateBehaviorGuidelines(): Promise<string> {
    if (this.experiences.length === 0) {
      return '';
    }

    const guidelines: string[] = [];
    const seenGuidelines = new Set<string>();

    const failureExps = this.experiences.filter(
      (exp) => exp.emotionalTone === 'frustrated' || exp.emotionalTone === 'cautious'
    );

    for (const exp of failureExps) {
      for (const lesson of exp.lessons) {
        const guideline = this.extractGuideline(lesson);
        if (guideline && !seenGuidelines.has(guideline)) {
          seenGuidelines.add(guideline);
          guidelines.push(guideline);
        }
      }
      for (const improvement of exp.improvements) {
        const guideline = this.extractGuideline(improvement);
        if (guideline && !seenGuidelines.has(guideline)) {
          seenGuidelines.add(guideline);
          guidelines.push(guideline);
        }
      }
    }

    const { failurePatterns } = await this.getPatterns();
    for (const pattern of failurePatterns) {
      const guideline = this.patternToGuideline(pattern);
      if (guideline && !seenGuidelines.has(guideline)) {
        seenGuidelines.add(guideline);
        guidelines.push(guideline);
      }
    }

    const successExps = this.experiences.filter(
      (exp) => exp.emotionalTone === 'confident' || exp.emotionalTone === 'excited'
    );

    for (const exp of successExps.slice(-5)) {
      for (const lesson of exp.lessons) {
        const guideline = this.extractGuideline(lesson);
        if (guideline && !seenGuidelines.has(guideline)) {
          seenGuidelines.add(guideline);
          guidelines.push(guideline);
        }
      }
    }

    const finalGuidelines = guidelines.slice(0, 8);

    if (finalGuidelines.length === 0) {
      return '';
    }

    const header = '## 基于过往经验的指导\n';
    const body = finalGuidelines.map((g) => `- ${g}`).join('\n');
    return header + body;
  }

  private async getPatterns(): Promise<{ successPatterns: string[]; failurePatterns: string[] }> {
    const successPatterns: string[] = [];
    const failurePatterns: string[] = [];

    for (const exp of this.experiences) {
      for (const pattern of exp.patterns) {
        if (exp.emotionalTone === 'confident' || exp.emotionalTone === 'excited') {
          if (!successPatterns.includes(pattern)) {
            successPatterns.push(pattern);
          }
        } else if (exp.emotionalTone === 'frustrated' || exp.emotionalTone === 'cautious') {
          if (!failurePatterns.includes(pattern)) {
            failurePatterns.push(pattern);
          }
        }
      }

      for (const decision of exp.decisions) {
        if (decision.outcome === 'success' && decision.reasoning) {
          const pattern = `成功模式: ${decision.chosen} - ${decision.reasoning.substring(0, 80)}`;
          if (!successPatterns.includes(pattern)) {
            successPatterns.push(pattern);
          }
        } else if (decision.outcome === 'failure' && decision.reasoning) {
          const pattern = `失败模式: ${decision.chosen} - ${decision.reasoning.substring(0, 80)}`;
          if (!failurePatterns.includes(pattern)) {
            failurePatterns.push(pattern);
          }
        }
      }
    }

    return {
      successPatterns: successPatterns.slice(0, 15),
      failurePatterns: failurePatterns.slice(0, 15),
    };
  }

  private extractGuideline(text: string): string | null {
    if (!text || text.length < 5) return null;

    let cleaned = text
      .replace(/^[✅❌💡⚠️🔄]+(\s*)/, '')
      .replace(/^(成功经验|改进方向|建议改进|经验教训|教训)[:：]\s*/i, '')
      .trim();

    if (cleaned.length > 100) {
      cleaned = cleaned.substring(0, 100).replace(/[，,。；;]?\s*$/, '...');
    }

    return cleaned || null;
  }

  private patternToGuideline(pattern: string): string | null {
    if (!pattern || pattern.length < 5) return null;

    if (pattern.startsWith('失败模式:')) {
      const detail = pattern.replace('失败模式:', '').trim();
      return `避免${detail}`;
    }

    if (pattern.startsWith('成功模式:')) {
      const detail = pattern.replace('成功模式:', '').trim();
      return `优先考虑${detail}`;
    }

    return pattern.length <= 100 ? pattern : pattern.substring(0, 100);
  }
}
