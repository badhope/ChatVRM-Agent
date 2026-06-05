import * as graphologyNs from 'graphology';
import { bfsFromNode } from 'graphology-traversal';

export interface KnowledgeEntity {
  id: string;
  type: 'concept' | 'tool' | 'pattern' | 'fact' | 'relationship';
  label: string;
  description: string;
  confidence: number;
  relatedIds: string[];
  createdAt: string;
  lastAccessed: string;
}

export interface KnowledgeRelation {
  sourceId: string;
  targetId: string;
  type: 'depends_on' | 'related_to' | 'part_of' | 'causes' | 'example_of';
  weight: number;
}

type GraphInstance = {
  hasNode(id: string): boolean;
  hasEdge(id: string): boolean;
  addNode(id: string, attrs?: unknown): unknown;
  addEdge(id: string, source: string, target: string, attrs?: unknown): unknown;
  addEdgeWithKey(key: string, source: string, target: string, attrs?: unknown): unknown;
  addDirectedEdge(source: string, target: string, attrs?: unknown): string;
  dropNode(id: string): void;
  dropEdge(id: string): void;
  replaceNodeAttributes(id: string, attrs: unknown): void;
  replaceEdgeAttributes(id: string, attrs: unknown): void;
  getNodeAttributes(id: string): unknown;
  edge(source: string, target: string): string | null;
  nodes(): string[];
  edges(): string[];
  inEdges(node: string): string[];
  outEdges(node: string): string[];
  forEachNode(callback: (node: string, attrs: unknown) => void): void;
  forEachEdge(
    callback: (edge: string, attrs: unknown, source: string, target: string) => void,
  ): void;
  clear(): void;
  size: number;
  order: number;
};

type GraphCtor = new (options?: Record<string, unknown>) => GraphInstance;
type GraphologyNs = {
  DirectedGraph?: GraphCtor;
  default?: { DirectedGraph?: GraphCtor } & GraphCtor;
} & GraphCtor;
const DirectedGraphCtor: GraphCtor =
  ((graphologyNs as unknown as GraphologyNs).DirectedGraph as GraphCtor | undefined) ??
  ((graphologyNs as unknown as GraphologyNs).default?.DirectedGraph as GraphCtor | undefined) ??
  ((graphologyNs as unknown as { default?: GraphCtor }).default as unknown as GraphCtor) ??
  (graphologyNs as unknown as GraphCtor);


interface GraphNodeAttributes extends KnowledgeEntity, Record<string, unknown> {}

interface GraphEdgeAttributes extends KnowledgeRelation, Record<string, unknown> {}

export class KnowledgeGraph {
  private graph: GraphInstance;

  constructor() {
    this.graph = new DirectedGraphCtor({ type: 'directed' });
  }

  init(): void {
    this.graph = new DirectedGraphCtor({ type: 'directed' });
  }

  addEntity(entity: KnowledgeEntity): void {
    if (this.graph.hasNode(entity.id)) {
      this.graph.replaceNodeAttributes(entity.id, entity as unknown as GraphNodeAttributes);
      return;
    }
    this.graph.addNode(entity.id, entity as unknown as GraphNodeAttributes);
  }

  removeEntity(id: string): void {
    if (!this.graph.hasNode(id)) {
      return;
    }
    this.graph.dropNode(id);
  }

  addRelation(relation: KnowledgeRelation): void {
    if (!this.graph.hasNode(relation.sourceId) || !this.graph.hasNode(relation.targetId)) {
      return;
    }

    const existingEdge = this.graph.edge(relation.sourceId, relation.targetId);
    if (existingEdge) {
      this.graph.replaceEdgeAttributes(
        existingEdge,
        relation as unknown as GraphEdgeAttributes,
      );
      return;
    }

    this.graph.addEdgeWithKey(
      `${relation.sourceId}->${relation.targetId}`,
      relation.sourceId,
      relation.targetId,
      relation as unknown as GraphEdgeAttributes,
    );
  }

  removeRelation(sourceId: string, targetId: string): void {
    const edge = this.graph.edge(sourceId, targetId);
    if (edge) {
      this.graph.dropEdge(edge);
    }
  }

  getEntity(id: string): KnowledgeEntity | null {
    if (!this.graph.hasNode(id)) {
      return null;
    }
    const attrs = this.graph.getNodeAttributes(id);
    return attrs as unknown as KnowledgeEntity;
  }

  findRelated(id: string, maxDepth: number = 3): KnowledgeEntity[] {
    if (!this.graph.hasNode(id)) {
      return [];
    }

    const visited = new Set<string>();
    visited.add(id);

    const result: KnowledgeEntity[] = [];
    const nodes: Array<{ node: string; depth: number }> = [];

    bfsFromNode(
      this.graph as unknown as Parameters<typeof bfsFromNode>[0],
      id,
      (node, _attr, depth) => {
        if (node !== id) {
          nodes.push({ node, depth: depth as number });
        }
      },
    );

    for (const { node, depth } of nodes) {
      if (depth > maxDepth) {
        continue;
      }
      if (visited.has(node)) {
        continue;
      }
      visited.add(node);
      const entity = this.getEntity(node);
      if (entity) {
        result.push(entity);
      }
    }

    return result;
  }

  searchEntities(query: string): KnowledgeEntity[] {
    const lower = query.toLowerCase();
    const results: KnowledgeEntity[] = [];

    this.graph.forEachNode(((node: string, attrs: unknown) => {
      const entity = attrs as unknown as KnowledgeEntity;
      if (
        entity.label.toLowerCase().includes(lower) ||
        entity.description.toLowerCase().includes(lower)
      ) {
        results.push(entity);
      }
    }) as Parameters<GraphInstance['forEachNode']>[0]);

    return results;
  }

  query(query: string): KnowledgeEntity[] {
    const lower = query.toLowerCase();
    const tokens = lower.split(/\s+/).filter((t) => t.length > 0);
    const results: KnowledgeEntity[] = [];
    const seen = new Set<string>();

    this.graph.forEachNode(((node: string, attrs: unknown) => {
      const entity = attrs as unknown as KnowledgeEntity;
      const searchable = `${entity.label} ${entity.description} ${entity.type}`.toLowerCase();
      let score = 0;
      for (const token of tokens) {
        if (searchable.includes(token)) {
          score += 1;
        }
      }
      if (score > 0 && !seen.has(entity.id)) {
        seen.add(entity.id);
        results.push(entity);
      }
    }) as Parameters<GraphInstance['forEachNode']>[0]);

    return results;
  }

  getStats(): { entityCount: number; relationCount: number; density: number } {
    const entityCount = this.graph.order;
    const relationCount = this.graph.size;
    const maxEdges = entityCount * (entityCount - 1);
    const density = maxEdges > 0 ? relationCount / maxEdges : 0;

    return {
      entityCount,
      relationCount,
      density: Math.round(density * 10000) / 10000,
    };
  }

  export(): {
    entities: Record<string, KnowledgeEntity>;
    relations: KnowledgeRelation[];
  } {
    const entities: Record<string, KnowledgeEntity> = {};
    const relations: KnowledgeRelation[] = [];

    this.graph.forEachNode(((node: string, attrs: unknown) => {
      entities[node] = attrs as unknown as KnowledgeEntity;
    }) as Parameters<GraphInstance['forEachNode']>[0]);

    this.graph.forEachEdge(((edge: string, attrs: unknown) => {
      relations.push(attrs as unknown as KnowledgeRelation);
    }) as Parameters<GraphInstance['forEachEdge']>[0]);

    return { entities, relations };
  }

  import(data: {
    entities: Record<string, KnowledgeEntity>;
    relations: KnowledgeRelation[];
  }): void {
    this.clear();

    for (const entity of Object.values(data.entities)) {
      this.addEntity(entity);
    }

    for (const relation of data.relations) {
      this.addRelation(relation);
    }
  }

  clear(): void {
    this.graph.clear();
  }
}