import path from 'path';
import fs from 'fs/promises';
import { MEMORY_DIR } from '../utils/index.js';
import { AsyncLock } from '../utils/async-lock.js';
import { GraphWrapper } from './graph-wrapper.js';
import type {
  NodeType,
  EdgeType,
  MemoryNode,
  MemoryEdge,
  GraphData,
  SearchResult,
  GraphStats,
  ContextResult,
} from './graph-types.js';
import { generateId, tokenize, computeRelevance, isExpired } from './graph-utils.js';

// Re-export 类型
export type {
  NodeType,
  EdgeType,
  MemoryNode,
  MemoryEdge,
  GraphData,
  SearchResult,
  GraphStats,
  ContextResult,
};

// ============================================================
// 常量
// ============================================================

const STORAGE_DIR = MEMORY_DIR;
const GRAPH_FILE = path.join(STORAGE_DIR, 'graph.json');
const GRAPH_VERSION = '1.0.0';

/** 重要性衰减因子，每次调用 decay 时乘以此值 */
const DECAY_FACTOR = 0.95;
/** 低于此重要性阈值的节点将被清理 */
const IMPORTANCE_THRESHOLD = 0.05;

// ============================================================
// 内部类型
// ============================================================

/** 节点属性 */
interface NodeAttrs {
  node: MemoryNode;
}

/** 边属性 */
interface EdgeAttrs {
  edge: MemoryEdge;
}

// ============================================================
// MemoryGraph 类
// ============================================================

/**
 * 基于图结构的记忆管理模块
 * 使用 graphlib 提供高效的图算法支持。
 *
 * 节点类型：
 *   - fact: 事实（可验证的信息）
 *   - experience: 经历（交互记录、历史事件）
 *   - preference: 偏好（用户习惯、配置选择）
 *   - relation: 关系（实体之间的关联描述）
 *
 * 边类型：
 *   - related_to: 相关联
 *   - derived_from: 派生自
 *   - contradicts: 矛盾
 *
 * 持久化位置：~/.devflow/memory/graph.json
 */
export class MemoryGraph {
  private graph: GraphWrapper;
  private nodes: Record<string, MemoryNode> = {};  // 用于快速查找
  private initialized = false;
  private initLock = new AsyncLock();
  private saveLock = new AsyncLock();
  private stateLock = new AsyncLock();

  constructor() {
    // 使用无向图，因为记忆关系通常是双向的
    this.graph = new GraphWrapper(false);
  }

  // ----------------------------------------------------------
  // 初始化与持久化
  // ----------------------------------------------------------

  /**
   * 初始化记忆图谱，加载已有数据
   */
  async init(): Promise<void> {
    await this.initLock.acquire(async () => {
      if (this.initialized) return;
      await fs.mkdir(STORAGE_DIR, { recursive: true });
      await this.load();
      this.initialized = true;
    });
  }

  /**
   * 从磁盘加载图谱数据
   */
  private async load(): Promise<void> {
    try {
      const data = await fs.readFile(GRAPH_FILE, 'utf-8');
      const parsed: GraphData = JSON.parse(data);
      this.loadFromData(parsed);
    } catch {
      this.nodes = {};
    }
  }

  /** 从数据加载到图中 */
  private loadFromData(data: GraphData): void {
    this.nodes = data.nodes || {};
    this.graph.clear();

    // 添加所有节点
    for (const [id, node] of Object.entries(this.nodes)) {
      this.graph.addNode(id, { node });
    }

    // 添加所有边
    for (const edge of data.edges || []) {
      if (this.graph.hasNode(edge.from) && this.graph.hasNode(edge.to)) {
        this.graph.addEdge(edge.from, edge.to, { edge });
      }
    }
  }

  /**
   * 将图谱数据持久化到磁盘
   */
  async save(): Promise<void> {
    await this.saveLock.acquire(async () => {
      await this.init();
      const data: GraphData = {
        nodes: this.nodes,
        edges: this.getAllEdgesFromGraph(),
        version: GRAPH_VERSION,
      };
      await fs.writeFile(GRAPH_FILE, JSON.stringify(data, null, 2), 'utf-8');
    });
  }

  /** 从图中获取所有边 */
  private getAllEdgesFromGraph(): MemoryEdge[] {
    const edges: MemoryEdge[] = [];
    for (const edge of this.graph.edges()) {
      const attrs = this.graph.getEdgeAttrs<EdgeAttrs>(edge.v, edge.w);
      if (attrs?.edge) {
        edges.push(attrs.edge);
      }
    }
    return edges;
  }

  // ----------------------------------------------------------
  // 节点操作
  // ----------------------------------------------------------

  /**
   * 添加记忆节点
   */
  async addNode(
    type: NodeType,
    content: string,
    tags?: string[],
    importance?: number,
    expiresAt?: string,
  ): Promise<MemoryNode> {
    return this.stateLock.acquire(async () => {
      await this.init();

      const now = new Date().toISOString();
      const node: MemoryNode = {
        id: generateId(),
        type,
        content,
        importance: Math.max(0, Math.min(1, importance ?? 0.5)),
        tags: tags || [],
        createdAt: now,
        accessedAt: now,
        expiresAt: expiresAt || undefined,
      };

      this.nodes[node.id] = node;
      this.graph.addNode(node.id, { node });
      await this.save();
      return node;
    });
  }

  /**
   * 根据 ID 获取节点
   */
  async getNode(id: string): Promise<MemoryNode | null> {
    return this.stateLock.acquire(async () => {
      await this.init();
      const node = this.nodes[id];
      if (!node) return null;
      node.accessedAt = new Date().toISOString();
      return node;
    });
  }

  /**
   * 删除节点及其关联的所有边
   */
  async removeNode(id: string): Promise<boolean> {
    return this.stateLock.acquire(async () => {
      await this.init();
      if (!this.nodes[id]) return false;

      delete this.nodes[id];
      this.graph.removeNode(id);
      await this.save();
      return true;
    });
  }

  // ----------------------------------------------------------
  // 边操作
  // ----------------------------------------------------------

  /**
   * 创建两个节点之间的关系边
   */
  async linkNodes(
    fromId: string,
    toId: string,
    type: EdgeType = 'related_to',
    strength?: number,
  ): Promise<MemoryEdge | null> {
    return this.stateLock.acquire(async () => {
      await this.init();

      if (!this.nodes[fromId] || !this.nodes[toId]) return null;
      if (fromId === toId) return null;

      const edge: MemoryEdge = {
        from: fromId,
        to: toId,
        type,
        strength: Math.max(0, Math.min(1, strength ?? 0.5)),
      };

      this.graph.addEdge(fromId, toId, { edge });
      await this.save();
      return edge;
    });
  }

  /**
   * 删除两个节点之间的边
   */
  async unlinkNodes(fromId: string, toId: string): Promise<boolean> {
    return this.stateLock.acquire(async () => {
      await this.init();
      const removed = this.graph.removeEdge(fromId, toId);
      if (removed) {
        await this.save();
      }
      return removed;
    });
  }

  // ----------------------------------------------------------
  // 搜索与查询
  // ----------------------------------------------------------

  /**
   * 关键词搜索节点内容
   */
  async search(query: string, limit = 20): Promise<SearchResult[]> {
    return this.stateLock.acquire(async () => {
      await this.init();

      if (!query.trim()) return [];

      const queryTokens = tokenize(query);
      const results: SearchResult[] = [];

      for (const node of Object.values(this.nodes)) {
        if (isExpired(node)) continue;

        const contentScore = computeRelevance(queryTokens, node.content);
        const tagScore = computeRelevance(queryTokens, node.tags.join(' '));
        const totalScore = contentScore + tagScore * 0.5;

        if (totalScore > 0) {
          results.push({ node, score: totalScore });
        }
      }

      results.sort((a, b) => b.score - a.score);
      return results.slice(0, limit);
    });
  }

  /**
   * 获取与指定节点关联的所有节点（支持多层遍历）
   */
  async getRelated(id: string, depth = 1): Promise<MemoryNode[]> {
    return this.stateLock.acquire(async () => {
      await this.init();

      if (!this.nodes[id]) return [];

      const visited = new Set<string>([id]);
      const result: MemoryNode[] = [];
      let frontier = [id];

      for (let d = 0; d < depth; d++) {
        const nextFrontier: string[] = [];

        for (const nodeId of frontier) {
          const neighbors = this.graph.neighbors(nodeId);

          for (const neighborId of neighbors) {
            if (visited.has(neighborId)) continue;
            visited.add(neighborId);
            nextFrontier.push(neighborId);

            const node = this.nodes[neighborId];
            if (node && !isExpired(node)) {
              result.push(node);
            }
          }
        }

        frontier = nextFrontier;
      }

      return result;
    });
  }

  /**
   * 基于上下文查询获取相关子图
   */
  async getContext(query: string, expandDepth = 1, maxNodes = 30): Promise<ContextResult> {
    return this.stateLock.acquire(async () => {
      await this.init();

      const searchResults = await this.search(query, maxNodes);

      if (searchResults.length === 0) {
        return { nodes: [], edges: [], query };
      }

      const seedNodeIds = new Set(searchResults.map(r => r.node.id));
      const allNodeIds = new Set<string>(seedNodeIds);

      for (const seedId of seedNodeIds) {
        const related = await this.getRelated(seedId, expandDepth);
        for (const node of related) {
          if (allNodeIds.size >= maxNodes) break;
          allNodeIds.add(node.id);
        }
        if (allNodeIds.size >= maxNodes) break;
      }

      const subEdges = this.getAllEdgesFromGraph().filter(
        e => allNodeIds.has(e.from) && allNodeIds.has(e.to),
      );

      const subNodes = Array.from(allNodeIds)
        .map(id => this.nodes[id])
        .filter((n): n is MemoryNode => !!n && !isExpired(n));

      return { nodes: subNodes, edges: subEdges, query };
    });
  }

  // ----------------------------------------------------------
  // 维护操作
  // ----------------------------------------------------------

  /**
   * 衰减所有节点的重要性，并清理已过期和低重要性的节点
   */
  async decayImportance(): Promise<number> {
    return this.stateLock.acquire(async () => {
      await this.init();

      let removedCount = 0;
      const toRemove: string[] = [];

      for (const [id, node] of Object.entries(this.nodes)) {
        if (isExpired(node)) {
          toRemove.push(id);
          continue;
        }

        node.importance *= DECAY_FACTOR;

        if (node.importance < IMPORTANCE_THRESHOLD) {
          toRemove.push(id);
        }
      }

      for (const id of toRemove) {
        delete this.nodes[id];
        this.graph.removeNode(id);
        removedCount++;
      }

      if (removedCount > 0) {
        await this.save();
      }

      return removedCount;
    });
  }

  /**
   * 获取图谱统计信息
   */
  async getStats(): Promise<GraphStats> {
    return this.stateLock.acquire(async () => {
      await this.init();

      const nodesByType: Record<NodeType, number> = {
        fact: 0,
        experience: 0,
        preference: 0,
        relation: 0,
      };
      const edgesByType: Record<EdgeType, number> = {
        related_to: 0,
        derived_from: 0,
        contradicts: 0,
      };

      let totalImportance = 0;
      let expiredNodes = 0;
      const now = Date.now();

      for (const node of Object.values(this.nodes)) {
        nodesByType[node.type]++;
        totalImportance += node.importance;
        if (node.expiresAt && new Date(node.expiresAt).getTime() < now) {
          expiredNodes++;
        }
      }

      for (const edge of this.getAllEdgesFromGraph()) {
        edgesByType[edge.type]++;
      }

      const totalNodes = Object.keys(this.nodes).length;

      return {
        totalNodes,
        totalEdges: this.graph.edgeCount(),
        nodesByType,
        edgesByType,
        averageImportance: totalNodes > 0
          ? Math.round((totalImportance / totalNodes) * 100) / 100
          : 0,
        expiredNodes,
        storagePath: GRAPH_FILE,
      };
    });
  }

  /**
   * 获取所有节点（可选按类型过滤）
   */
  async getAllNodes(type?: NodeType): Promise<MemoryNode[]> {
    return this.stateLock.acquire(async () => {
      await this.init();
      let nodes = Object.values(this.nodes);
      if (type) {
        nodes = nodes.filter(n => n.type === type);
      }
      return nodes.filter(n => !isExpired(n));
    });
  }

  /**
   * 获取所有边（可选按类型过滤）
   */
  async getAllEdges(type?: EdgeType): Promise<MemoryEdge[]> {
    return this.stateLock.acquire(async () => {
      await this.init();
      let edges = this.getAllEdgesFromGraph();
      if (type) {
        edges = edges.filter(e => e.type === type);
      }
      return edges;
    });
  }

  /**
   * 清空整个图谱
   */
  async clear(): Promise<void> {
    return this.stateLock.acquire(async () => {
      await this.init();
      this.nodes = {};
      this.graph.clear();
      await this.save();
    });
  }

  // ----------------------------------------------------------
  // 图算法扩展方法
  // ----------------------------------------------------------

  /**
   * 检测图中是否有环
   */
  async hasCycles(): Promise<boolean> {
    await this.init();
    return this.graph.hasCycles();
  }

  /**
   * 查找图中的所有环
   */
  async findCycles(): Promise<string[][]> {
    await this.init();
    return this.graph.findCycles();
  }

  /**
   * 查找两节点间的最短路径
   */
  async shortestPath(fromId: string, toId: string): Promise<string[]> {
    await this.init();
    return this.graph.shortestPath(fromId, toId);
  }
}

// ============================================================
// 全局单例
// ============================================================

export const memoryGraph = new MemoryGraph();
