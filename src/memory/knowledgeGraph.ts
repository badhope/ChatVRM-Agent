import { MEMORY_DIR } from '../utils/index.js';
import path from 'path';
import fs from 'fs/promises';
import type {
  EntityType,
  RelationshipType,
  Entity,
  Relationship,
  PathNode,
  KnowledgeGraphStats,
  KnowledgeGraphData,
  MemoryEntry,
} from './knowledge-graph/types.js';
import { extractFromMemories } from './knowledge-extraction-engine.js';
import { AsyncLock } from '../utils/async-lock.js';
import { GraphWrapper, type Edge } from './graph-wrapper.js';

// Re-export 类型
export type {
  EntityType,
  RelationshipType,
  Entity,
  Relationship,
  PathNode,
  KnowledgeGraphStats,
  KnowledgeGraphData,
  MemoryEntry,
};

// ============================================================
// 知识图谱类
// ============================================================

/** 实体节点属性 */
interface EntityNodeAttrs {
  entity: Entity;
}

/** 关系边属性 */
interface RelationEdgeAttrs {
  relationship: Relationship;
}

/**
 * 知识图谱
 * 使用 graphlib 存储实体和关系，提供高效的图算法支持。
 * 持久化到 ~/.devflow/memory/knowledge.json
 */
export class KnowledgeGraph {
  private storagePath: string;
  private graph: GraphWrapper;
  private entities: Record<string, Entity> = {};  // 用于快速查找
  private initialized = false;
  private initLock = new AsyncLock();
  private saveLock = new AsyncLock();
  private stateLock = new AsyncLock();

  constructor() {
    this.storagePath = path.join(MEMORY_DIR, 'knowledge.json');
    this.graph = new GraphWrapper(true);  // 有向图
  }

  /** 初始化：创建目录并加载已有数据 */
  async init(): Promise<void> {
    await this.initLock.acquire(async () => {
      if (this.initialized) return;

      const dir = path.dirname(this.storagePath);
      await fs.mkdir(dir, { recursive: true });

      try {
        const raw = await fs.readFile(this.storagePath, 'utf-8');
        const data: KnowledgeGraphData = JSON.parse(raw);
        this.loadFromData(data);
      } catch {
        this.entities = {};
      }

      this.initialized = true;
    });
  }

  /** 从数据加载到图中 */
  private loadFromData(data: KnowledgeGraphData): void {
    this.entities = data.entities || {};
    this.graph.clear();

    // 添加所有实体节点
    for (const [id, entity] of Object.entries(this.entities)) {
      this.graph.addNode(id, { entity });
    }

    // 添加所有关系边
    for (const rel of data.relationships || []) {
      if (this.graph.hasNode(rel.fromId) && this.graph.hasNode(rel.toId)) {
        this.graph.addEdge(rel.fromId, rel.toId, { relationship: rel });
      }
    }
  }

  /** 保存到磁盘 */
  async save(): Promise<void> {
    await this.saveLock.acquire(async () => {
      await this.init();
      const data: KnowledgeGraphData = {
        entities: this.entities,
        relationships: this.getAllRelationshipsFromGraph(),
      };
      const tmpPath = this.storagePath + '.tmp';
      await fs.writeFile(tmpPath, JSON.stringify(data, null, 2), 'utf-8');
      await fs.rename(tmpPath, this.storagePath);
    });
  }

  /** 从图中获取所有关系 */
  private getAllRelationshipsFromGraph(): Relationship[] {
    const relationships: Relationship[] = [];
    for (const edge of this.graph.edges()) {
      const attrs = this.graph.getEdgeAttrs<RelationEdgeAttrs>(edge.v, edge.w);
      if (attrs?.relationship) {
        relationships.push(attrs.relationship);
      }
    }
    return relationships;
  }

  /**
   * 添加实体
   */
  async addEntity(
    type: EntityType,
    label: string,
    attributes?: Record<string, string>,
  ): Promise<Entity> {
    return this.stateLock.acquire(async () => {
      await this.init();

      const existing = Object.values(this.entities).find(
        (e) => e.type === type && e.label === label,
      );
      if (existing) {
        if (attributes) Object.assign(existing.attributes, attributes);
        this.graph.setNodeAttrs(existing.id, { entity: existing });
        return existing;
      }

      const entity: Entity = {
        id: crypto.randomUUID(),
        type,
        label,
        attributes: attributes || {},
        createdAt: new Date().toISOString(),
      };

      this.entities[entity.id] = entity;
      this.graph.addNode(entity.id, { entity });
      await this.save();
      return entity;
    });
  }

  /** 获取实体 */
  async getEntity(id: string): Promise<Entity | undefined> {
    await this.init();
    return this.entities[id];
  }

  /**
   * 添加关系
   */
  async addRelationship(
    fromId: string,
    toId: string,
    type: RelationshipType,
    weight = 0.5,
  ): Promise<Relationship> {
    return this.stateLock.acquire(async () => {
      await this.init();

      if (!this.entities[fromId]) throw new Error(`起始实体不存在: ${fromId}`);
      if (!this.entities[toId]) throw new Error(`目标实体不存在: ${toId}`);

      // 检查是否已存在相同关系
      const existingAttrs = this.graph.getEdgeAttrs<RelationEdgeAttrs>(fromId, toId);
      if (existingAttrs?.relationship && existingAttrs.relationship.type === type) {
        existingAttrs.relationship.weight = Math.min(1, Math.max(existingAttrs.relationship.weight, weight));
        const updatedAttrs: Record<string, unknown> = { relationship: existingAttrs.relationship };
        this.graph.setEdgeAttrs(fromId, toId, updatedAttrs);
        await this.save();
        return existingAttrs.relationship;
      }

      const relationship: Relationship = {
        id: crypto.randomUUID(),
        fromId,
        toId,
        type,
        weight: Math.max(0, Math.min(1, weight)),
        createdAt: new Date().toISOString(),
      };

      this.graph.addEdge(fromId, toId, { relationship });
      await this.save();
      return relationship;
    });
  }

  /** 获取与指定实体相关的实体 */
  async getRelatedEntities(
    entityId: string,
    type?: RelationshipType,
  ): Promise<Array<{ entity: Entity; relationship: Relationship }>> {
    await this.init();

    const results: Array<{ entity: Entity; relationship: Relationship }> = [];
    const neighbors = this.graph.neighbors(entityId);

    for (const neighborId of neighbors) {
      // 检查出边
      const outAttrs = this.graph.getEdgeAttrs<RelationEdgeAttrs>(entityId, neighborId);
      if (outAttrs?.relationship) {
        if (!type || outAttrs.relationship.type === type) {
          const entity = this.entities[neighborId];
          if (entity) {
            results.push({ entity, relationship: outAttrs.relationship });
          }
        }
      }

      // 检查入边
      const inAttrs = this.graph.getEdgeAttrs<RelationEdgeAttrs>(neighborId, entityId);
      if (inAttrs?.relationship) {
        if (!type || inAttrs.relationship.type === type) {
          const entity = this.entities[neighborId];
          if (entity) {
            results.push({ entity, relationship: inAttrs.relationship });
          }
        }
      }
    }

    return results;
  }

  /** 多条件查询实体 */
  async query(type?: EntityType, attributes?: Record<string, string>): Promise<Entity[]> {
    await this.init();

    let results = Object.values(this.entities);

    if (type) {
      results = results.filter((e) => e.type === type);
    }

    if (attributes) {
      results = results.filter((e) => {
        for (const [key, value] of Object.entries(attributes)) {
          if (e.attributes[key] !== value) return false;
        }
        return true;
      });
    }

    return results;
  }

  /** 使用 graphlib 的 Dijkstra 查找两个实体之间的最短路径 */
  async findPaths(fromId: string, toId: string, maxDepth = 5): Promise<PathNode[][]> {
    await this.init();

    if (!this.entities[fromId] || !this.entities[toId]) return [];
    if (fromId === toId) return [];

    // 使用 Dijkstra 找最短路径
    const weightFunc = (e: Edge): number => {
      const attrs = this.graph.getEdgeAttrs<RelationEdgeAttrs>(e.v, e.w);
      // 使用 1 - weight 作为距离（权重越高，距离越短）
      return attrs?.relationship ? 1 - attrs.relationship.weight : 1;
    };

    const shortestPath = this.graph.shortestPath(fromId, toId, weightFunc);

    if (shortestPath.length === 0 || shortestPath.length > maxDepth + 1) {
      return [];
    }

    // 将路径转换为 PathNode 格式
    const pathNodes: PathNode[] = [];
    for (let i = 0; i < shortestPath.length; i++) {
      const nodeId = shortestPath[i];
      const entity = this.entities[nodeId];
      if (!entity) continue;

      let relType: RelationshipType = 'related_to';
      if (i < shortestPath.length - 1) {
        const nextId = shortestPath[i + 1];
        const attrs = this.graph.getEdgeAttrs<RelationEdgeAttrs>(nodeId, nextId);
        if (attrs?.relationship) {
          relType = attrs.relationship.type;
        }
      }

      pathNodes.push({
        entityId: nodeId,
        label: entity.label,
        type: entity.type,
        relationshipType: relType,
      });
    }

    return [pathNodes];
  }

  /** 从记忆记录中自动提取实体和关系 */
  async extractFromMemory(
    memories: MemoryEntry[],
  ): Promise<{ entitiesAdded: number; relationshipsAdded: number }> {
    return this.stateLock.acquire(async () => {
      await this.init();

      const result = await extractFromMemories(memories, {
        addEntity: (type, label, attributes) => this.addEntity(type, label, attributes),
        addRelationship: (fromId, toId, type, weight) =>
          this.addRelationship(fromId, toId, type, weight),
        findEntity: (type, label) =>
          Object.values(this.entities).find((e) => e.type === type && e.label === label),
      });

      await this.save();
      return result;
    });
  }

  /** 获取知识图谱统计信息 */
  async getStats(): Promise<KnowledgeGraphStats> {
    await this.init();

    const entityByType: Record<EntityType, number> = {
      person: 0, project: 0, tech: 0, concept: 0, skill: 0,
    };
    for (const entity of Object.values(this.entities)) {
      entityByType[entity.type]++;
    }

    const relationships = this.getAllRelationshipsFromGraph();
    const relationshipByType: Record<RelationshipType, number> = {
      uses: 0, knows: 0, likes: 0, created: 0, related_to: 0,
    };
    for (const rel of relationships) {
      relationshipByType[rel.type]++;
    }

    return {
      entityCount: this.graph.nodeCount(),
      relationshipCount: this.graph.edgeCount(),
      entityByType,
      relationshipByType,
    };
  }

  /** 获取所有实体（只读副本） */
  async getAllEntities(): Promise<Entity[]> {
    await this.init();
    return Object.values(this.entities);
  }

  /** 获取所有关系（只读副本） */
  async getAllRelationships(): Promise<Relationship[]> {
    await this.init();
    return this.getAllRelationshipsFromGraph();
  }

  /** 删除实体及其所有关联关系 */
  async removeEntity(id: string): Promise<boolean> {
    return this.stateLock.acquire(async () => {
      await this.init();
      if (!this.entities[id]) return false;

      delete this.entities[id];
      this.graph.removeNode(id);
      await this.save();
      return true;
    });
  }

  /** 删除关系 */
  async removeRelationship(id: string): Promise<boolean> {
    return this.stateLock.acquire(async () => {
      await this.init();

      for (const edge of this.graph.edges()) {
        const attrs = this.graph.getEdgeAttrs<RelationEdgeAttrs>(edge.v, edge.w);
        if (attrs?.relationship?.id === id) {
          this.graph.removeEdge(edge.v, edge.w);
          await this.save();
          return true;
        }
      }
      return false;
    });
  }

  /** 清空所有数据 */
  async clear(): Promise<void> {
    return this.stateLock.acquire(async () => {
      await this.init();
      this.entities = {};
      this.graph.clear();
      await this.save();
    });
  }

  // ============================================================
  // 图算法扩展方法
  // ============================================================

  /** 检测图中是否有环 */
  async hasCycles(): Promise<boolean> {
    await this.init();
    return this.graph.hasCycles();
  }

  /** 查找图中的所有环 */
  async findCycles(): Promise<string[][]> {
    await this.init();
    return this.graph.findCycles();
  }
}

/** 知识图谱全局单例 */
export const knowledgeGraph = new KnowledgeGraph();
