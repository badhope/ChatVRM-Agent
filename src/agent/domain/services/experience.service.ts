/**
 * 经验领域服务
 * 纯业务逻辑，无基础设施依赖
 */

import type { Experience, EmotionalTone } from '../models/experience.model.js';

export interface PatternResult {
  successPatterns: string[];
  failurePatterns: string[];
}

export class ExperienceService {
  static extractPatterns(experiences: Experience[]): PatternResult {
    const successPatterns: string[] = [];
    const failurePatterns: string[] = [];

    for (const exp of experiences) {
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

  static inferTaskType(userInput: string, intent?: string): string {
    const input = userInput.toLowerCase();

    if (/bug|fix|修复|错误|报错|异常|error|fail|crash/.test(input)) return 'bug-fix';
    if (/refactor|重构|优化|整理|clean|improve/.test(input)) return 'refactor';
    if (/feature|功能|新增|添加|实现|create|add|implement/.test(input)) return 'feature';
    if (/test|测试|单元|e2e|spec/.test(input)) return 'testing';
    if (/review|审查|检查|check/.test(input)) return 'review';
    if (/doc|文档|readme|comment/.test(input)) return 'documentation';
    if (/deploy|部署|发布|release|build/.test(input)) return 'deployment';

    if (intent) {
      return intent.replace(/-/g, '_');
    }

    return 'general';
  }

  static calculateSuccessRate(experiences: Experience[]): number {
    if (experiences.length === 0) return 0;

    const successfulCount = experiences.filter(
      (exp) => exp.emotionalTone === 'confident' || exp.emotionalTone === 'excited'
    ).length;

    return successfulCount / experiences.length;
  }

  static extractGuideline(text: string): string | null {
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

  static patternToGuideline(pattern: string): string | null {
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

  static inferEmotionalTone(
    hasErrors: boolean,
    hasSkipped: boolean,
    allSuccess: boolean,
    overallRating: number
  ): EmotionalTone {
    if (allSuccess && overallRating >= 0.8) return 'excited';
    if (allSuccess) return 'confident';
    if (hasErrors) return 'frustrated';
    if (hasSkipped) return 'cautious';
    return 'neutral';
  }

  static createExperience(
    taskId: string,
    taskType: string,
    taskDescription: string,
    decisions: Experience['decisions'],
    lessons: string[],
    improvements: string[],
    patterns: string[],
    emotionalTone: EmotionalTone
  ): Experience {
    return {
      id: `exp-${taskId}`,
      timestamp: new Date().toISOString(),
      taskType,
      taskDescription,
      decisions,
      lessons,
      improvements,
      patterns,
      emotionalTone,
    };
  }

  static getRelevantExperiences(
    experiences: Experience[],
    taskType: string,
    limit: number = 10
  ): Experience[] {
    const relevant = experiences
      .filter((exp) => exp.taskType === taskType)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    if (relevant.length < limit) {
      const others = experiences
        .filter((exp) => exp.taskType !== taskType)
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

      const remaining = limit - relevant.length;
      relevant.push(...others.slice(0, remaining));
    }

    return relevant.slice(0, limit);
  }
}
