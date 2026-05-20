/**
 * 知识提取引擎
 * 从记忆记录中提取实体和关系的增强引擎。
 *
 * 该模块已简化为 KnowledgeExtractor 的薄包装器，
 * 委托核心提取逻辑给 knowledge-extractor.ts，
 * 同时保持与现有调用者的向后兼容性。
 */

import type { Entity, MemoryEntry, EntityType, RelationshipType } from './knowledge-types.js';
import {
  KnowledgeExtractor,
  inferEntityType,
  type LLMExtractorFn,
  type ExtractionResult,
} from './knowledge-extractor.js';

// ============================================================
// 向后兼容的类型导出
// ============================================================

/** 提取操作回调接口 */
export interface ExtractionCallbacks {
  addEntity: (type: EntityType, label: string, attributes?: Record<string, string>) => Promise<Entity>;
  addRelationship: (fromId: string, toId: string, type: RelationshipType, weight?: number) => Promise<unknown>;
  findEntity: (type: string, label: string) => Entity | undefined;
}

// ============================================================
// KnowledgeExtractionEngine 类
// ============================================================

/**
 * 知识提取引擎
 *
 * 薄包装器，委托给 KnowledgeExtractor。
 * 保持向后兼容的同时避免代码重复。
 */
export class KnowledgeExtractionEngine {
  private extractor: KnowledgeExtractor;

  constructor() {
    this.extractor = new KnowledgeExtractor();
  }

  /**
   * 注入 LLM 提取函数
   *
   * @param fn - LLM 提取函数
   */
  setLLMExtractor(fn: LLMExtractorFn): void {
    this.extractor.setLLMExtractor(fn);
  }

  /**
   * 从单条文本中提取实体和关系
   *
   * @param text - 输入文本
   * @returns 提取结果
   */
  async extract(text: string): Promise<ExtractionResult> {
    return this.extractor.extract(text);
  }
}

// ============================================================
// 向后兼容的导出函数
// ============================================================

/**
 * 从记忆记录中自动提取实体和关系（向后兼容函数）
 *
 * @param memories  - 记忆条目数组
 * @param callbacks - 提取操作回调
 * @returns 提取结果摘要
 */
export async function extractFromMemories(
  memories: MemoryEntry[],
  callbacks: ExtractionCallbacks,
): Promise<{ entitiesAdded: number; relationshipsAdded: number }> {
  const engine = new KnowledgeExtractionEngine();
  let entitiesAdded = 0;
  let relationshipsAdded = 0;

  let currentUserEntity: Entity | undefined;
  const processedEntities = new Set<string>();
  const processedRelationships = new Set<string>();

  for (const memory of memories) {
    const text = `${memory.input} ${memory.output || ''}`;
    const result = await engine.extract(text);

    for (const entity of result.entities) {
      const key = `${entity.type}:${entity.label}`;
      if (!processedEntities.has(key)) {
        await callbacks.addEntity(entity.type, entity.label, entity.attributes);
        processedEntities.add(key);
        entitiesAdded++;

        // 跟踪当前用户实体
        if (entity.type === 'person') {
          currentUserEntity = callbacks.findEntity('person', entity.label);
        }
      }
    }

    for (const rel of result.relationships) {
      if (!currentUserEntity) continue;

      // 查找目标实体
      const targetEntity = callbacks.findEntity(
        inferEntityType(rel.toLabel),
        rel.toLabel,
      );
      if (!targetEntity) continue;

      const relKey = `${currentUserEntity.id}:${rel.type}:${targetEntity.id}`;
      if (!processedRelationships.has(relKey)) {
        await callbacks.addRelationship(
          currentUserEntity.id,
          targetEntity.id,
          rel.type,
          rel.weight,
        );
        processedRelationships.add(relKey);
        relationshipsAdded++;
      }
    }
  }

  return { entitiesAdded, relationshipsAdded };
}

// 向后兼容：重新导出 inferEntityType
export { inferEntityType };
