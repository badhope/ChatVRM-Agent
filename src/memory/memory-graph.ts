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
 * 持久化位置：~/.personal-assistant/memory/graph.json
 */
export class MemoryGraph {
  protected graph: GraphWrapper;
  protected nodes: Record<string, MemoryNode> = {}; // 用于快速查找
  protected initialized = false;
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
  protected async load(): Promise<void> {
    try {
      const data = await fs.readFile(GRAPH_FILE, 'utf-8');
      const parsed: GraphData = JSON.parse(data);
      this.loadFromData(parsed);
    } catch {
      this.nodes = {};
    }
  }

  /** 从数据加载到图中 */
  protected loadFromData(data: GraphData): void {
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
    expiresAt?: string
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
    strength?: number
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

      const seedNodeIds = new Set(searchResults.map((r) => r.node.id));
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
        (e) => allNodeIds.has(e.from) && allNodeIds.has(e.to)
      );

      const subNodes = Array.from(allNodeIds)
        .map((id) => this.nodes[id])
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
        averageImportance:
          totalNodes > 0 ? Math.round((totalImportance / totalNodes) * 100) / 100 : 0,
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
        nodes = nodes.filter((n) => n.type === type);
      }
      return nodes.filter((n) => !isExpired(n));
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
        edges = edges.filter((e) => e.type === type);
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

// ============================================================
// 长期记忆系统增强
// ============================================================

/**
 * 记忆关联网络
 */
export interface MemoryAssociation {
  sourceId: string;
  targetId: string;
  strength: number;
  type: 'temporal' | 'semantic' | 'causal' | 'structural';
  createdAt: string;
}

/**
 * 记忆摘要
 */
export interface MemorySummary {
  id: string;
  content: string;
  keyPoints: string[];
  sentiment: 'positive' | 'neutral' | 'negative';
  topics: string[];
  sourceNodeIds: string[];
  createdAt: string;
}

/**
 * 增强版记忆图谱
 */
export class MemoryGraphEnhanced extends MemoryGraph {
  private associations: MemoryAssociation[] = [];
  private summaries: MemorySummary[] = [];
  private readonly MAX_ASSOCIATIONS = 500;
  private readonly MAX_SUMMARIES = 100;

  /**
   * 增强节点访问 - 更新重要性评分
   */
  async accessNode(id: string, interactionQuality?: number): Promise<MemoryNode | null> {
    const node = await this.getNode(id);
    if (!node) return null;

    // 访问时增加重要性
    const qualityBoost = interactionQuality ?? 0.1;
    node.importance = Math.min(1.0, node.importance + qualityBoost);

    // 记录时间衰减
    node.accessedAt = new Date().toISOString();

    // 保存更新
    await this.save();
    return node;
  }

  /**
   * 智能更新重要性评分
   * 基于访问频率、内容质量和时间因素
   */
  async updateImportanceScore(id: string): Promise<number> {
    const node = await this.getNode(id);
    if (!node) return 0;

    const now = Date.now();
    const lastAccess = new Date(node.accessedAt).getTime();
    const timeSinceAccess = now - lastAccess;

    // 时间衰减因子（24小时为基准）
    const hourFactor = timeSinceAccess / (24 * 60 * 60 * 1000);
    const timeDecay = Math.exp(-0.1 * hourFactor);

    // 基础重要性（保持在一定范围）
    const baseImportance = node.importance * timeDecay;

    // 根据节点类型调整
    let typeMultiplier = 1.0;
    switch (node.type) {
      case 'fact':
        typeMultiplier = 1.2; // 事实通常更重要
        break;
      case 'preference':
        typeMultiplier = 1.1; // 偏好中等重要
        break;
      case 'experience':
        typeMultiplier = 0.9; // 经历可以更快遗忘
        break;
      case 'relation':
        typeMultiplier = 1.0; // 关系保持中等
        break;
    }

    const newImportance = baseImportance * typeMultiplier;
    node.importance = Math.max(0.01, Math.min(1.0, newImportance));

    await this.save();
    return node.importance;
  }

  /**
   * 精细化遗忘机制
   * 支持多种遗忘策略
   */
  async intelligentDecay(
    strategy: 'aggressive' | 'balanced' | 'conservative' = 'balanced'
  ): Promise<{
    removed: number;
    decayed: number;
    preserved: number;
  }> {
    await this.init();

    let decayFactor: number;
    let threshold: number;

    switch (strategy) {
      case 'aggressive':
        decayFactor = 0.85;
        threshold = 0.1;
        break;
      case 'balanced':
        decayFactor = 0.92;
        threshold = 0.05;
        break;
      case 'conservative':
        decayFactor = 0.97;
        threshold = 0.02;
        break;
    }

    let removed = 0;
    let decayed = 0;
    let preserved = 0;

    const toRemove: string[] = [];

    for (const [id, node] of Object.entries(this.nodes)) {
      // 检查是否过期
      if (isExpired(node)) {
        toRemove.push(id);
        removed++;
        continue;
      }

      // 应用衰减
      const oldImportance = node.importance;
      node.importance *= decayFactor;

      if (node.importance < threshold) {
        toRemove.push(id);
        removed++;
      } else if (node.importance < oldImportance) {
        decayed++;
      } else {
        preserved++;
      }
    }

    // 删除低于阈值的节点
    for (const id of toRemove) {
      delete this.nodes[id];
      this.graph.removeNode(id);
    }

    if (removed > 0) {
      await this.save();
    }

    return { removed, decayed, preserved };
  }

  /**
   * 构建记忆关联网络
   * 基于时间、语义和结构关系
   */
  async buildAssociationNetwork(): Promise<void> {
    await this.init();

    const nodeList = Object.values(this.nodes);
    this.associations = [];

    // 基于时间关联（相近时间创建的节点）
    const timeThreshold = 60 * 60 * 1000; // 1小时内
    for (let i = 0; i < nodeList.length; i++) {
      for (let j = i + 1; j < nodeList.length; j++) {
        const timeDiff = Math.abs(
          new Date(nodeList[i].createdAt).getTime() - new Date(nodeList[j].createdAt).getTime()
        );
        if (timeDiff < timeThreshold) {
          this.associations.push({
            sourceId: nodeList[i].id,
            targetId: nodeList[j].id,
            strength: 1 - timeDiff / timeThreshold,
            type: 'temporal',
            createdAt: new Date().toISOString(),
          });
        }
      }
    }

    // 基于内容相似度（简单关键词匹配）
    for (let i = 0; i < nodeList.length; i++) {
      for (let j = i + 1; j < nodeList.length; j++) {
        const similarity = this.computeSimilarity(nodeList[i].content, nodeList[j].content);
        if (similarity > 0.3) {
          this.associations.push({
            sourceId: nodeList[i].id,
            targetId: nodeList[j].id,
            strength: similarity,
            type: 'semantic',
            createdAt: new Date().toISOString(),
          });
        }
      }
    }

    // 基于图结构（共同邻居）
    const edgeList = Array.from(this.graph.edges());
    for (const edge of edgeList) {
      const id1 = edge.v;
      const id2 = edge.w;
      const neighbors1 = new Set(this.graph.neighbors(id1));
      const neighbors2 = new Set(this.graph.neighbors(id2));
      let common = 0;
      for (const n of neighbors1) {
        if (neighbors2.has(n)) common++;
      }
      if (common > 0) {
        this.associations.push({
          sourceId: id1,
          targetId: id2,
          strength: Math.min(1, common / Math.max(neighbors1.size, neighbors2.size)),
          type: 'structural',
          createdAt: new Date().toISOString(),
        });
      }
    }

    // 限制关联数量
    if (this.associations.length > this.MAX_ASSOCIATIONS) {
      this.associations.sort((a, b) => b.strength - a.strength);
      this.associations = this.associations.slice(0, this.MAX_ASSOCIATIONS);
    }
  }

  /**
   * 计算文本相似度（简单实现）
   */
  private computeSimilarity(text1: string, text2: string): number {
    const tokens1 = new Set(tokenize(text1));
    const tokens2 = new Set(tokenize(text2));

    const intersection = new Set([...tokens1].filter(x => tokens2.has(x)));
    const union = new Set([...tokens1, ...tokens2]);

    return union.size > 0 ? intersection.size / union.size : 0;
  }

  /**
   * 获取关联
   */
  getAssociations(nodeId?: string): MemoryAssociation[] {
    if (nodeId) {
      return this.associations.filter(
        a => a.sourceId === nodeId || a.targetId === nodeId
      );
    }
    return this.associations;
  }

  /**
   * 生成记忆摘要
   */
  async generateSummary(nodeIds: string[]): Promise<MemorySummary> {
    const nodes = nodeIds.map(id => this.nodes[id]).filter(Boolean);
    if (nodes.length === 0) {
      throw new Error('No valid nodes provided');
    }

    // 提取关键点（简单实现：前3个节点的内容）
    const keyPoints = nodes.slice(0, 3).map(n => n.content);

    // 简单情感分析（基于关键词）
    const positiveWords = ['好', '喜欢', '开心', '成功', '棒', '优秀'];
    const negativeWords = ['坏', '讨厌', '失败', '问题', '错误', '糟糕'];
    let positiveCount = 0;
    let negativeCount = 0;
    for (const node of nodes) {
      for (const word of positiveWords) {
        if (node.content.includes(word)) positiveCount++;
      }
      for (const word of negativeWords) {
        if (node.content.includes(word)) negativeCount++;
      }
    }

    let sentiment: 'positive' | 'neutral' | 'negative' = 'neutral';
    if (positiveCount > negativeCount) sentiment = 'positive';
    else if (negativeCount > positiveCount) sentiment = 'negative';

    // 提取主题（基于标签）
    const allTags = nodes.flatMap(n => n.tags);
    const topicCounts = new Map<string, number>();
    for (const tag of allTags) {
      topicCounts.set(tag, (topicCounts.get(tag) || 0) + 1);
    }
    const topics = Array.from(topicCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([topic]) => topic);

    const summary: MemorySummary = {
      id: generateId(),
      content: nodes.map(n => n.content).join(' ').substring(0, 500),
      keyPoints,
      sentiment,
      topics,
      sourceNodeIds: nodeIds,
      createdAt: new Date().toISOString(),
    };

    this.summaries.push(summary);

    // 限制摘要数量
    if (this.summaries.length > this.MAX_SUMMARIES) {
      this.summaries.shift();
    }

    return summary;
  }

  /**
   * 获取所有摘要
   */
  getSummaries(): MemorySummary[] {
    return this.summaries;
  }

  /**
   * 获取记忆检索优化排序
   * 综合考虑相关性、重要性、时间衰减
   */
  async enhancedSearch(query: string, limit = 20): Promise<SearchResult[]> {
    await this.init();

    if (!query.trim()) return [];

    const queryTokens = tokenize(query);
    const now = Date.now();
    const results: SearchResult[] = [];

    for (const node of Object.values(this.nodes)) {
      if (isExpired(node)) continue;

      // 基础相关性分数
      const contentScore = computeRelevance(queryTokens, node.content);
      const tagScore = computeRelevance(queryTokens, node.tags.join(' ')) * 0.5;

      // 重要性分数
      const importanceScore = node.importance;

      // 时间衰减分数（越近访问越高）
      const lastAccess = new Date(node.accessedAt).getTime();
      const daysSinceAccess = (now - lastAccess) / (24 * 60 * 60 * 1000);
      const recencyScore = Math.exp(-0.05 * daysSinceAccess);

      // 关联强度分数
      const nodeAssociations = this.associations.filter(
        a => a.sourceId === node.id || a.targetId === node.id
      );
      const associationScore = nodeAssociations.length > 0
        ? nodeAssociations.reduce((sum, a) => sum + a.strength, 0) / nodeAssociations.length
        : 0;

      // 综合分数
      const totalScore = contentScore * 0.4 + tagScore * 0.2 +
                        importanceScore * 0.2 + recencyScore * 0.1 +
                        associationScore * 0.1;

      if (totalScore > 0) {
        results.push({ node, score: totalScore });
      }
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, limit);
  }

  /**
   * 获取高价值记忆（重要性高且最近的）
   */
  async getHighValueMemories(limit = 10): Promise<MemoryNode[]> {
    await this.init();

    const nodes = Object.values(this.nodes)
      .filter(n => !isExpired(n))
      .map(n => ({
        node: n,
        score: n.importance * (1 + 1 / (1 + (Date.now() - new Date(n.accessedAt).getTime()) / (24 * 60 * 60 * 1000)))
      }))
      .sort((a, b) => b.score - a.score);

    return nodes.slice(0, limit).map(item => item.node);
  }
}

/** 增强版记忆图谱全局单例 */
export const memoryGraphEnhanced = new MemoryGraphEnhanced();
