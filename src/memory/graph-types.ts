// ============================================================
// 记忆图谱类型定义
// ============================================================

/** 节点类型 */
export type NodeType = 'fact' | 'experience' | 'preference' | 'relation';

/** 边类型 */
export type EdgeType = 'related_to' | 'derived_from' | 'contradicts';

/** 记忆节点 */
export interface MemoryNode {
  /** 唯一标识 */
  id: string;
  /** 节点类型 */
  type: NodeType;
  /** 节点内容 */
  content: string;
  /** 重要性 (0-1) */
  importance: number;
  /** 标签 */
  tags: string[];
  /** 创建时间 (ISO 字符串) */
  createdAt: string;
  /** 最后访问时间 (ISO 字符串) */
  accessedAt: string;
  /** 过期时间 (ISO 字符串)，可选 */
  expiresAt?: string;
}

/** 记忆边 */
export interface MemoryEdge {
  /** 起始节点 ID */
  from: string;
  /** 目标节点 ID */
  to: string;
  /** 边类型 */
  type: EdgeType;
  /** 关系强度 (0-1) */
  strength: number;
}

/** 持久化数据结构 */
export interface GraphData {
  nodes: Record<string, MemoryNode>;
  edges: MemoryEdge[];
  version: string;
}

/** 搜索结果 */
export interface SearchResult {
  node: MemoryNode;
  score: number;
}

/** 统计信息 */
export interface GraphStats {
  totalNodes: number;
  totalEdges: number;
  nodesByType: Record<NodeType, number>;
  edgesByType: Record<EdgeType, number>;
  averageImportance: number;
  expiredNodes: number;
  storagePath: string;
}

/** 上下文查询结果 */
export interface ContextResult {
  nodes: MemoryNode[];
  edges: MemoryEdge[];
  query: string;
}
