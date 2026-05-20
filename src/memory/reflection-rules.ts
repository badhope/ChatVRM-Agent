/**
 * 反思引擎
 * 从记忆中生成洞察和反思报告。
 *
 * 采用混合方案：
 * - 设置 LLM 反思器后，使用 LLM 进行深度分析
 * - 未设置时，回退到基本统计分析（词频、模式检测）
 * - 通过 setLLMReflector() 注入 LLM 反思函数实现渐进式迁移
 */

// ============================================================
// 类型定义
// ============================================================

import { createLogger } from '../services/logger.js';

const logger = createLogger('ReflectionEngine');

/** 记忆洞察 */
export interface MemoryInsight {
  id: string;
  type: 'preference' | 'fact' | 'pattern' | 'summary';
  content: string;
  sourceIds: string[];
  confidence: number;
  createdAt: number;
  accessedAt: number;
  accessCount: number;
}

/** 反思报告 */
export interface ReflectionReport {
  id: string;
  createdAt: number;
  totalMemories: number;
  insightsGenerated: number;
  insights: MemoryInsight[];
}

/** 记忆条目（用于反思输入） */
export interface MemoryForReflection {
  id: string;
  input: string;
  output: string;
  timestamp: string;
}

/** LLM 反思函数签名 */
export type LLMReflectorFn = (memories: MemoryForReflection[]) => Promise<MemoryInsight[]>;

// ============================================================
// 基本统计分析常量
// ============================================================

/** 停用词集合 */
const STOP_WORDS = new Set([
  '什么', '怎么', '如何', '可以', '这个', '那个', '一个', '没有',
  '不是', '就是', '已经', '如果', '但是', '因为', '所以', '或者',
  'the', 'is', 'are', 'was', 'were', 'be', 'have', 'has', 'do',
  'can', 'will', 'would', 'should', 'could', 'may', 'might',
]);

/** 偏好提取模式 */
const PREFERENCE_PATTERNS = [
  /(?:喜欢|偏好|常用|最爱|习惯|倾向于|更愿意)(.{2,20}?)(?:[。，！？\n]|$)/g,
  /(?:用|使用|采用|选择)(.{2,20}?)(?:来|去|做|写|开发|编程)/g,
];

/** 事实提取模式 */
const FACT_PATTERNS = [
  /(?:我是|我叫|我的名字是|我姓)(.{2,10}?)(?:[。，！？\n]|$)/g,
];

// ============================================================
// ReflectionEngine 类
// ============================================================

/**
 * 反思引擎
 *
 * 支持两种模式：
 * 1. LLM 模式：通过 setLLMReflector() 注入 LLM 反思函数，进行深度分析
 * 2. 回退模式：使用基本统计分析生成洞察
 */
export class ReflectionEngine {
  private llmReflector: LLMReflectorFn | null = null;

  /**
   * 注入 LLM 反思函数
   *
   * @param fn - LLM 反思函数，接收记忆列表，返回洞察列表
   */
  setLLMReflector(fn: LLMReflectorFn): void {
    this.llmReflector = fn;
  }

  /**
   * 对记忆进行反思，生成洞察报告
   *
   * @param memories - 记忆条目数组
   * @returns 反思报告
   */
  async reflect(memories: MemoryForReflection[]): Promise<ReflectionReport> {
    if (!memories || memories.length === 0) {
      return {
        id: crypto.randomUUID(),
        createdAt: Date.now(),
        totalMemories: 0,
        insightsGenerated: 0,
        insights: [],
      };
    }

    let insights: MemoryInsight[];

    if (this.llmReflector) {
      try {
        insights = await this.llmReflector(memories);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error({ error }, `LLM 反思失败，回退到统计分析: ${message}`);
        insights = this.reflectWithStats(memories);
      }
    } else {
      insights = this.reflectWithStats(memories);
    }

    return {
      id: crypto.randomUUID(),
      createdAt: Date.now(),
      totalMemories: memories.length,
      insightsGenerated: insights.length,
      insights,
    };
  }

  /**
   * 使用基本统计分析生成洞察
   *
   * @param memories - 记忆条目数组
   * @returns 洞察列表
   */
  reflectWithStats(memories: MemoryForReflection[]): MemoryInsight[] {
    const insights: MemoryInsight[] = [];

    // 1. 提取用户偏好
    for (const mem of memories) {
      const text = `${mem.input} ${mem.output}`;
      for (const pattern of PREFERENCE_PATTERNS) {
        let match: RegExpExecArray | null;
        while ((match = pattern.exec(text)) !== null) {
          insights.push({
            id: crypto.randomUUID(),
            type: 'preference',
            content: `用户偏好: ${match[0].trim()}`,
            sourceIds: [mem.id],
            confidence: 0.7,
            createdAt: Date.now(),
            accessedAt: Date.now(),
            accessCount: 0,
          });
        }
      }
    }

    // 2. 提取事实
    for (const mem of memories) {
      for (const pattern of FACT_PATTERNS) {
        let match: RegExpExecArray | null;
        while ((match = pattern.exec(mem.input)) !== null) {
          insights.push({
            id: crypto.randomUUID(),
            type: 'fact',
            content: `用户信息: ${match[0].trim()}`,
            sourceIds: [mem.id],
            confidence: 0.9,
            createdAt: Date.now(),
            accessedAt: Date.now(),
            accessCount: 0,
          });
        }
      }
    }

    // 3. 提取高频主题
    const themes = this.extractThemes(memories.map(m => `${m.input} ${m.output}`));
    if (themes.length > 0) {
      const topThemes = themes.slice(0, 5);
      insights.push({
        id: crypto.randomUUID(),
        type: 'pattern',
        content: `用户常讨论的主题: ${topThemes.map(t => t.theme).join('、')}（出现 ${topThemes.reduce((s, t) => s + t.count, 0)} 次）`,
        sourceIds: memories.map(m => m.id),
        confidence: Math.min(1, topThemes[0].count / memories.length),
        createdAt: Date.now(),
        accessedAt: Date.now(),
        accessCount: 0,
      });
    }

    // 4. 生成摘要
    if (memories.length >= 3) {
      const timeRange = memories.length >= 2
        ? `${memories[memories.length - 1].timestamp} ~ ${memories[0].timestamp}`
        : memories[0].timestamp;

      insights.push({
        id: crypto.randomUUID(),
        type: 'summary',
        content: `用户在 ${timeRange} 期间进行了 ${memories.length} 次对话，主要涉及: ${themes.slice(0, 3).map(t => t.theme).join('、')}`,
        sourceIds: memories.map(m => m.id),
        confidence: 0.8,
        createdAt: Date.now(),
        accessedAt: Date.now(),
        accessCount: 0,
      });
    }

    return insights;
  }

  /**
   * 从一组记忆文本中提取高频主题
   *
   * @param texts - 文本数组
   * @returns 主题及其出现次数
   */
  private extractThemes(texts: string[]): Array<{ theme: string; count: number }> {
    const themeMap = new Map<string, number>();

    for (const text of texts) {
      const chineseSegments = text.match(/[\u4e00-\u9fa5]{2,4}/g) || [];
      const englishWords = text.match(/[a-zA-Z]{2,}/g) || [];
      const allTokens = [...chineseSegments, ...englishWords.map(w => w.toLowerCase())];

      for (const token of allTokens) {
        if (STOP_WORDS.has(token)) continue;
        themeMap.set(token, (themeMap.get(token) || 0) + 1);
      }
    }

    return Array.from(themeMap.entries())
      .map(([theme, count]) => ({ theme, count }))
      .filter(t => t.count >= 2)
      .sort((a, b) => b.count - a.count)
      .slice(0, 20);
  }
}
