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
  /(?:My name|I am|I'm)\s*([A-Za-z][a-zA-Z\s]+)/gi,
];

/** 基本使用关系模式 */
const USAGE_PATTERNS = [
  /(?:使用|用了|在用|正在用|采用)\s*([^\s,，。.!！?？]+)/g,
  /(?:use|using|used)\s*([A-Za-z][a-zA-Z0-9]+)/gi,
];

/** 基本偏好关系模式 */
const PREFERENCE_PATTERNS = [
  /(?:喜欢|偏好|常用|最爱)\s*([^\s,，。.!！?？]+)/g,
  /(?:like|prefer|favorite)\s*([A-Za-z][a-zA-Z0-9]+)/gi,
];

/** 基本项目提及模式 */
const PROJECT_PATTERNS = [
  /(?:项目叫|项目名为|项目名是)\s*([^\s,，。.!！?？]+)/g,
  /(?:project|project name)\s*(?:is|called|:)\s*([A-Za-z][a-zA-Z0-9_-]+)/gi,
];

/** 技能相关模式 */
const SKILL_PATTERNS = [
  /(?:擅长|精通|熟悉|了解)\s*([^\s,，。.!！?]+)/g,
  /(?:skilled|expert|proficient|familiar)\s*(?:in|with)\s*([A-Za-z][a-zA-Z0-9\s]+)/gi,
  /(?:years?|yrs?)\s*(?:of\s*)?(?:experience|exp)\s*(?:in|with)\s*([A-Za-z][a-zA-Z0-9\s]+)/gi,
];

/** 知识相关模式 */
const KNOWLEDGE_PATTERNS = [
  /(?:知道|了解|认识)\s*([^\s,，。.!！?？]+)/g,
  /(?:know|understand|know about)\s*([A-Za-z][a-zA-Z0-9\s]+)/gi,
];

/** 技术栈模式 */
const TECH_STACK_PATTERNS = [
  /(?:技术栈|tech stack)\s*(?:是|:)\s*([^\s,，。.!！?]+)/g,
  /(?:技术栈|tech stack)\s*(?:包括|包含)\s*([^\s,，。.!！?]+)/g,
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

    const addRelation = (
      from: string,
      type: RelationshipType,
      to: string,
      weight: number
    ): void => {
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

    // 提取技能信息
    for (const pattern of SKILL_PATTERNS) {
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(text)) !== null) {
        const skill = match[1].trim();
        if (skill && currentUserLabel) {
          addEntity('skill', skill);
          addRelation(currentUserLabel, 'knows', skill, 0.7);
        }
      }
    }

    // 提取知识信息
    for (const pattern of KNOWLEDGE_PATTERNS) {
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(text)) !== null) {
        const knowledge = match[1].trim();
        if (knowledge && currentUserLabel) {
          const type = inferEntityType(knowledge);
          addEntity(type, knowledge);
          addRelation(currentUserLabel, 'knows', knowledge, 0.5);
        }
      }
    }

    // 提取技术栈信息
    for (const pattern of TECH_STACK_PATTERNS) {
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(text)) !== null) {
        const techStack = match[1].trim();
        if (techStack && currentUserLabel) {
          // 技术栈通常是多个技术的组合，用逗号或"和"分隔
          const techs = techStack.split(/[,，、和and]+/).map(t => t.trim()).filter(Boolean);
          for (const tech of techs) {
            addEntity('tech', tech);
            addRelation(currentUserLabel, 'uses', tech, 0.8);
          }
        }
      }
    }

    // 提取代码中的技术术语
    const codeBlocks = text.match(/```[\s\S]*?```/g) || [];
    for (const block of codeBlocks) {
      // 提取import语句中的模块名
      const importMatches = block.match(/import\s+.*?from\s+['"]([^'"]+)['"]/g) || [];
      for (const match of importMatches) {
        const moduleMatch = match.match(/['"]([^'"]+)['"]/);
        if (moduleMatch && currentUserLabel) {
          const module = moduleMatch[1];
          if (!module.startsWith('.') && !module.startsWith('@')) {
            addEntity('tech', module);
            addRelation(currentUserLabel, 'uses', module, 0.6);
          }
        }
      }

      // 提取函数调用中的技术关键词
      const techKeywords = ['React', 'Vue', 'Angular', 'Node', 'Express', 'Django', 'Flask', 'Spring', 'Laravel', 'Rails'];
      for (const keyword of techKeywords) {
        if (block.includes(keyword) && currentUserLabel) {
          addEntity('tech', keyword);
          addRelation(currentUserLabel, 'uses', keyword, 0.5);
        }
      }
    }

    // 智能推断：根据上下文推断实体关系
    this.inferRelationships(entities, relationships, currentUserLabel);

    return { entities, relationships };
  }

  /**
   * 智能推断关系
   * 根据已有实体和上下文自动推断额外的隐含关系
   */
  private inferRelationships(
    entities: ExtractedEntity[],
    relationships: ExtractedRelation[],
    userLabel?: string
  ): void {
    const techEntities = entities.filter(e => e.type === 'tech');
    const projectEntities = entities.filter(e => e.type === 'project');
    const skillEntities = entities.filter(e => e.type === 'skill');

    // 如果有项目且有技术，推断项目使用技术
    for (const project of projectEntities) {
      for (const tech of techEntities) {
        const exists = relationships.some(
          r => r.fromLabel === project.label && r.toLabel === tech.label && r.type === 'uses'
        );
        if (!exists) {
          relationships.push({
            fromLabel: project.label,
            toLabel: tech.label,
            type: 'uses',
            weight: 0.6,
          });
        }
      }
    }

    // 如果有技能，推断用户掌握技能
    if (userLabel) {
      for (const skill of skillEntities) {
        const exists = relationships.some(
          r => r.fromLabel === userLabel && r.toLabel === skill.label && r.type === 'knows'
        );
        if (!exists) {
          relationships.push({
            fromLabel: userLabel,
            toLabel: skill.label,
            type: 'knows',
            weight: 0.5,
          });
        }
      }
    }
  }
}
