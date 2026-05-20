/**
 * 经验存储模块
 *
 * 持久化存储 Agent 的执行经验，将反思结果转化为可复用的行为指导。
 * 核心功能：
 * 1. 经验持久化 - 将每次任务的决策、结果、教训保存到磁盘
 * 2. 经验检索 - 根据任务类型检索相关历史经验
 * 3. 模式提取 - 从历史中提取成功/失败模式
 * 4. 行为指导生成 - 将经验转化为可注入系统提示的指导原则
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { MEMORY_DIR } from '../utils/index.js';
import { createLogger } from '../services/logger.js';

const logger = createLogger('ExperienceStore');

// ==================== 接口定义 ====================

export interface Experience {
  id: string;
  timestamp: string;
  taskType: string;           // e.g. 'bug-fix', 'refactor', 'feature'
  taskDescription: string;
  decisions: Array<{
    context: string;
    chosen: string;
    outcome: 'success' | 'failure' | 'partial';
    confidence: number;
    reasoning: string;
  }>;
  lessons: string[];          // extracted lessons
  improvements: string[];     // improvement suggestions
  patterns: string[];         // error/success patterns detected
  emotionalTone: 'confident' | 'cautious' | 'frustrated' | 'excited' | 'neutral';
}

// ==================== ExperienceStore ====================

export class ExperienceStore {
  private experiences: Experience[] = [];
  private filePath: string;

  constructor(configDir?: string) {
    this.filePath = path.join(configDir || MEMORY_DIR, 'experiences.json');
  }

  /**
   * 从磁盘加载经验数据
   */
  async load(): Promise<void> {
    try {
      const data = await fs.readFile(this.filePath, 'utf-8');
      this.experiences = JSON.parse(data);
    } catch {
      // 文件不存在或解析失败时，使用空数组
      this.experiences = [];
    }
  }

  /**
   * 将经验数据持久化到磁盘
   */
  async save(): Promise<void> {
    try {
      const dir = path.dirname(this.filePath);
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(this.filePath, JSON.stringify(this.experiences, null, 2), 'utf-8');
    } catch (error) {
      // 持久化失败不应阻断主流程
      logger.warn({ error }, '保存失败');
    }
  }

  /**
   * 添加一条新经验
   */
  async addExperience(exp: Experience): Promise<void> {
    this.experiences.push(exp);

    // 限制存储数量，保留最近 200 条经验，防止无限增长
    if (this.experiences.length > 200) {
      this.experiences = this.experiences.slice(-200);
    }

    await this.save();
  }

  /**
   * 根据任务类型检索相关经验
   */
  async getRelevantExperiences(taskType: string, limit: number = 10): Promise<Experience[]> {
    // 按任务类型匹配，优先返回同类型的经验
    const relevant = this.experiences
      .filter(exp => exp.taskType === taskType)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    // 如果同类型经验不足，补充最近的其他类型经验
    if (relevant.length < limit) {
      const others = this.experiences
        .filter(exp => exp.taskType !== taskType)
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

      const remaining = limit - relevant.length;
      relevant.push(...others.slice(0, remaining));
    }

    return relevant.slice(0, limit);
  }

  /**
   * 提取成功和失败模式
   */
  async getPatterns(): Promise<{ successPatterns: string[]; failurePatterns: string[] }> {
    const successPatterns: string[] = [];
    const failurePatterns: string[] = [];

    for (const exp of this.experiences) {
      for (const pattern of exp.patterns) {
        // 根据情绪基调分类：confident/excited 通常关联成功，frustrated 关联失败
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

      // 也根据决策结果提取模式
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

  /**
   * 获取所有提取的教训
   */
  async getLessons(): Promise<string[]> {
    const lessonSet = new Set<string>();

    for (const exp of this.experiences) {
      for (const lesson of exp.lessons) {
        lessonSet.add(lesson);
      }
    }

    return Array.from(lessonSet);
  }

  /**
   * 将历史经验转化为可注入系统提示的行为指导
   *
   * 生成的指导原则是简洁的、可操作的，不会过度占用上下文窗口。
   * 最多返回 8 条指导，按相关性和频率排序。
   */
  async generateBehaviorGuidelines(): Promise<string> {
    if (this.experiences.length === 0) {
      return '';
    }

    const guidelines: string[] = [];
    const seenGuidelines = new Set<string>();

    // 1. 从失败教训中提取指导（优先级最高）
    const failureExps = this.experiences.filter(
      exp => exp.emotionalTone === 'frustrated' || exp.emotionalTone === 'cautious'
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

    // 2. 从失败模式中提取指导
    const { failurePatterns } = await this.getPatterns();
    for (const pattern of failurePatterns) {
      const guideline = this.patternToGuideline(pattern);
      if (guideline && !seenGuidelines.has(guideline)) {
        seenGuidelines.add(guideline);
        guidelines.push(guideline);
      }
    }

    // 3. 从成功经验中提取正面指导（补充）
    const successExps = this.experiences.filter(
      exp => exp.emotionalTone === 'confident' || exp.emotionalTone === 'excited'
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

    // 限制指导数量，避免过度占用上下文
    const finalGuidelines = guidelines.slice(0, 8);

    if (finalGuidelines.length === 0) {
      return '';
    }

    const header = '## 基于过往经验的指导\n';
    const body = finalGuidelines.map(g => `- ${g}`).join('\n');
    return header + body;
  }

  /**
   * 从教训文本中提取简洁的行为指导
   */
  private extractGuideline(text: string): string | null {
    if (!text || text.length < 5) return null;

    // 移除 emoji 前缀
    let cleaned = text
      .replace(/^[✅❌💡⚠️🔄]+(\s*)/, '')
      .replace(/^(成功经验|改进方向|建议改进|经验教训|教训)[:：]\s*/i, '')
      .trim();

    // 截断过长的指导
    if (cleaned.length > 100) {
      cleaned = cleaned.substring(0, 100).replace(/[，,。；;]?\s*$/, '...');
    }

    return cleaned || null;
  }

  /**
   * 将模式描述转化为行为指导
   */
  private patternToGuideline(pattern: string): string | null {
    if (!pattern || pattern.length < 5) return null;

    // 将 "失败模式: xxx" 转化为 "避免 xxx"
    if (pattern.startsWith('失败模式:')) {
      const detail = pattern.replace('失败模式:', '').trim();
      return `避免${detail}`;
    }

    // 将 "成功模式: xxx" 转化为 "优先考虑 xxx"
    if (pattern.startsWith('成功模式:')) {
      const detail = pattern.replace('成功模式:', '').trim();
      return `优先考虑${detail}`;
    }

    return pattern.length <= 100 ? pattern : pattern.substring(0, 100);
  }

  /**
   * 获取经验总数
   */
  getExperienceCount(): number {
    return this.experiences.length;
  }
}
