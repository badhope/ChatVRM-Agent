/**
 * 知识提取器
 * 从文本中提取实体和关系，支持 LLM 驱动的 NER。
 *
 * 采用混合方案：
 * - 设置 LLM 提取器后，使用 LLM 进行深度实体/关系提取
 * - 未设置时，回退到轻量级正则提取（仅处理基本模式）
 * - 通过 setLLMExtractor() 注入 LLM 提取函数实现渐进式迁移
 */

import type { EntityType, RelationshipType } from './knowledge-types.js';
import { createLogger } from '../services/logger.js';

const logger = createLogger('KnowledgeExtractor');

// ============================================================
// 类型定义
// ============================================================

/** 提取出的实体 */
export interface ExtractedEntity {
  type: EntityType;
  label: string;
  attributes?: Record<string, string>;
}

/** 提取出的关系 */
export interface ExtractedRelation {
  fromLabel: string;
  toLabel: string;
  type: RelationshipType;
  weight: number;
}

/** 提取结果 */
export interface ExtractionResult {
  entities: ExtractedEntity[];
  relationships: ExtractedRelation[];
}

/** LLM 提取函数签名 */
export type LLMExtractorFn = (text: string) => Promise<ExtractionResult>;

// ============================================================
// 轻量级回退提取规则
// ============================================================

/** 基本身份提取模式 */
const IDENTITY_PATTERNS = [
  /我是\s*([^\s,，。.!！?？]+)/g,
  /我叫\s*([^\s,，。.!！?？]+)/g,
  /名字是\s*([^\s,，。.!！?？]+)/g,
];

/** 基本使用关系模式 */
const USAGE_PATTERNS = [
  /(?:使用|用了|在用|正在用|采用)\s*([^\s,，。.!！?？]+)/g,
];

/** 基本偏好关系模式 */
const PREFERENCE_PATTERNS = [
  /(?:喜欢|偏好|常用|最爱)\s*([^\s,，。.!！?？]+)/g,
];

/** 基本项目提及模式 */
const PROJECT_PATTERNS = [
  /(?:项目叫|项目名为|项目名是)\s*([^\s,，。.!！?？]+)/g,
];

/**
 * 根据名称推断实体类型（轻量版）
 * @param name - 实体名称
 * @returns 推断的实体类型
 */
export function inferEntityType(name: string): EntityType {
  // 编程语言文件后缀
  if (/\.(js|ts|py|rs|go|java|rb|php|swift|kt|dart|c|cpp|h|cs|lua|pl|r|m|sh|ps1)$/i.test(name)) {
    return 'tech';
  }

  // 驼峰命名或短横线命名（常见框架/库名）
  if (/^[A-Z][a-zA-Z0-9]*$/.test(name) || /^[a-z]+-[a-z]+(-[a-z]+)*$/.test(name)) {
    return 'tech';
  }

  return 'concept';
}

// ============================================================
// KnowledgeExtractor 类
// ============================================================

/**
 * 知识提取器
 *
 * 支持两种模式：
 * 1. LLM 模式：通过 setLLMExtractor() 注入 LLM 提取函数，进行深度 NER
 * 2. 回退模式：使用轻量级正则提取基本实体和关系
 */
export class KnowledgeExtractor {
  private llmExtractor: LLMExtractorFn | null = null;

  /**
   * 注入 LLM 提取函数
   *
   * @param fn - LLM 提取函数，接收文本，返回结构化的实体和关系
   */
  setLLMExtractor(fn: LLMExtractorFn): void {
    this.llmExtractor = fn;
  }

  /**
   * 从文本中提取实体和关系
   *
   * @param text - 输入文本
   * @returns 提取结果（实体和关系列表）
   */
  async extract(text: string): Promise<ExtractionResult> {
    if (!text || !text.trim()) {
      return { entities: [], relationships: [] };
    }

    // 优先使用 LLM 提取器
    if (this.llmExtractor) {
      try {
        return await this.llmExtractor(text);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error({ error }, `LLM 提取失败，回退到正则: ${message}`);
      }
    }

    // 回退到正则提取
    return this.extractWithRegex(text);
  }

  /**
   * 使用正则进行轻量级提取
   *
   * @param text - 输入文本
   * @returns 提取结果
   */
  private extractWithRegex(text: string): ExtractionResult {
    const entities: ExtractedEntity[] = [];
    const relationships: ExtractedRelation[] = [];
    const seenEntities = new Set<string>();
    const seenRelations = new Set<string>();
    let currentUserLabel: string | undefined;

    const addEntity = (type: EntityType, label: string): void => {
      const key = `${type}:${label}`;
      if (!seenEntities.has(key)) {
        entities.push({ type, label });
        seenEntities.add(key);
      }
    };

    const addRelation = (from: string, type: RelationshipType, to: string, weight: number): void => {
      const key = `${from}:${type}:${to}`;
      if (!seenRelations.has(key)) {
        relationships.push({ fromLabel: from, toLabel: to, type, weight });
        seenRelations.add(key);
      }
    };

    // 提取身份信息
    for (const pattern of IDENTITY_PATTERNS) {
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(text)) !== null) {
        const name = match[1].trim();
        if (name) {
          addEntity('person', name);
          currentUserLabel = name;
        }
      }
    }

    // 提取使用关系
    for (const pattern of USAGE_PATTERNS) {
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(text)) !== null) {
        const target = match[1].trim();
        if (target && currentUserLabel) {
          const type = inferEntityType(target);
          addEntity(type, target);
          addRelation(currentUserLabel, 'uses', target, 0.6);
        }
      }
    }

    // 提取偏好关系
    for (const pattern of PREFERENCE_PATTERNS) {
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(text)) !== null) {
        const target = match[1].trim();
        if (target && currentUserLabel) {
          const type = inferEntityType(target);
          addEntity(type, target);
          addRelation(currentUserLabel, 'likes', target, 0.7);
        }
      }
    }

    // 提取项目信息
    for (const pattern of PROJECT_PATTERNS) {
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(text)) !== null) {
        const projectName = match[1].trim();
        if (projectName) {
          addEntity('project', projectName);
          if (currentUserLabel) {
            addRelation(currentUserLabel, 'created', projectName, 0.8);
          }
        }
      }
    }

    return { entities, relationships };
  }
}
