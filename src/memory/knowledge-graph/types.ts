// ============================================================
// 知识图谱核心类型定义
// ============================================================

/** 实体类型 */
export type EntityType = 'person' | 'project' | 'tech' | 'concept' | 'skill';

/** 关系类型 */
export type RelationshipType = 'uses' | 'knows' | 'likes' | 'created' | 'related_to';

/** 实体 */
export interface Entity {
  id: string;
  type: EntityType;
  label: string;
  attributes: Record<string, string>;
  createdAt: string;
}

/** 关系 */
export interface Relationship {
  id: string;
  fromId: string;
  toId: string;
  type: RelationshipType;
  weight: number;
  createdAt: string;
}

/** 持久化存储结构 */
export interface KnowledgeGraphData {
  entities: Record<string, Entity>;
  relationships: Relationship[];
}

/** 路径中的节点 */
export interface PathNode {
  entityId: string;
  label: string;
  type: EntityType;
  relationshipType: RelationshipType;
}

/** 统计信息 */
export interface KnowledgeGraphStats {
  entityCount: number;
  relationshipCount: number;
  entityByType: Record<EntityType, number>;
  relationshipByType: Record<RelationshipType, number>;
}

/** 记忆条目 */
export interface MemoryEntry {
  input: string;
  output?: string;
  timestamp?: string | Date;
  tags?: string[];
}

// ============================================================
// 常量定义
// ============================================================

/** 所有支持的实体类型 */
export const ENTITY_TYPES: readonly EntityType[] = ['person', 'project', 'tech', 'concept', 'skill'];

/** 所有支持的关系类型 */
export const RELATIONSHIP_TYPES: readonly RelationshipType[] = ['uses', 'knows', 'likes', 'created', 'related_to'];
