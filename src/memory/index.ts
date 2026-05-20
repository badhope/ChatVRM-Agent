// ============================================================
// Memory 模块 - 统一导出
// ============================================================

// 导出记忆管理器
export { MemoryManager, memoryManager } from './manager.js';
export type { MemoryInteraction, MemoryRecord, MemoryStats } from './manager.js';
export type { ConsolidationConfig, ConsolidationResult } from './manager.js';

// 导出 GraphWrapper（基于 graphlib 的图包装器）
export { GraphWrapper } from './graph-wrapper.js';
export type {
  NodeAttributes,
  EdgeAttributes,
  Edge,
  DijkstraResult,
} from './graph-wrapper.js';

// 导出知识图谱
export { KnowledgeGraph, knowledgeGraph } from './knowledgeGraph.js';
export type {
  EntityType,
  RelationshipType,
  Entity,
  Relationship,
  PathNode,
  KnowledgeGraphStats,
  KnowledgeGraphData,
  MemoryEntry,
} from './knowledgeGraph.js';

// 导出记忆图谱
export { MemoryGraph, memoryGraph } from './memoryGraph.js';
export type {
  NodeType,
  EdgeType,
  MemoryNode,
  MemoryEdge,
  GraphData,
  SearchResult,
  GraphStats,
  ContextResult,
} from './memoryGraph.js';

// 导出图谱类型
export type {
  MemoryNode as GraphMemoryNode,
  MemoryEdge as GraphMemoryEdge,
} from './graph-types.js';

// 导出图谱工具函数
export {
  generateId,
  tokenize,
  computeRelevance,
  isExpired,
} from './graph-utils.js';

// Re-export 知识图谱子模块
export {
  ENTITY_TYPES,
  RELATIONSHIP_TYPES,
} from './knowledge-graph/index.js';
export {
  TECH_KEYWORDS,
  classifyEntityType,
  classifyRelationship,
  extractEntities,
  extractRelationships,
} from './knowledge-graph/index.js';
export {
  findPath,
  findAllConnected,
} from './knowledge-graph/index.js';
