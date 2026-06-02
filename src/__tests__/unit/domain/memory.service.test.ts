import { describe, it, expect, beforeEach } from 'vitest';
import {
  KnowledgeGraph,
  type KnowledgeEntity,
  type KnowledgeRelation,
} from '../../../domain/memory/memory.service.js';

function createEntity(
  overrides: Partial<KnowledgeEntity> = {},
): KnowledgeEntity {
  return {
    id: 'entity-1',
    type: 'concept',
    label: 'Test Entity',
    description: 'A test entity for unit testing',
    confidence: 80,
    relatedIds: [],
    createdAt: new Date().toISOString(),
    lastAccessed: new Date().toISOString(),
    ...overrides,
  };
}

function createRelation(
  overrides: Partial<KnowledgeRelation> = {},
): KnowledgeRelation {
  return {
    sourceId: 'entity-1',
    targetId: 'entity-2',
    type: 'related_to',
    weight: 0.8,
    ...overrides,
  };
}

describe('KnowledgeGraph', () => {
  let graph: KnowledgeGraph;

  beforeEach(() => {
    graph = new KnowledgeGraph();
  });

  describe('should create an empty graph', () => {
    it('should create an empty graph', () => {
      const stats = graph.getStats();
      expect(stats.entityCount).toBe(0);
      expect(stats.relationCount).toBe(0);
    });
  });

  describe('should add entity with correct attributes', () => {
    it('should add entity with correct attributes', () => {
      const entity = createEntity();
      graph.addEntity(entity);

      const retrieved = graph.getEntity('entity-1');
      expect(retrieved).not.toBeNull();
      expect(retrieved!.id).toBe('entity-1');
      expect(retrieved!.type).toBe('concept');
      expect(retrieved!.label).toBe('Test Entity');
      expect(retrieved!.confidence).toBe(80);
    });

    it('should replace existing entity with same id', () => {
      const entity = createEntity();
      graph.addEntity(entity);

      const updated = createEntity({ label: 'Updated Entity', confidence: 90 });
      graph.addEntity(updated);

      const retrieved = graph.getEntity('entity-1');
      expect(retrieved!.label).toBe('Updated Entity');
      expect(retrieved!.confidence).toBe(90);
    });
  });

  describe('should remove entity and all relations', () => {
    it('should remove entity and all relations', () => {
      graph.addEntity(createEntity({ id: 'e1' }));
      graph.addEntity(createEntity({ id: 'e2' }));
      graph.addRelation(createRelation({ sourceId: 'e1', targetId: 'e2' }));

      expect(graph.getStats().relationCount).toBe(1);

      graph.removeEntity('e1');

      expect(graph.getEntity('e1')).toBeNull();
      expect(graph.getStats().relationCount).toBe(0);
    });

    it('should do nothing when removing non-existent entity', () => {
      graph.removeEntity('non-existent');
      expect(graph.getStats().entityCount).toBe(0);
    });
  });

  describe('should add relation between entities', () => {
    it('should add relation between entities', () => {
      graph.addEntity(createEntity({ id: 'e1' }));
      graph.addEntity(createEntity({ id: 'e2' }));
      graph.addRelation(createRelation({ sourceId: 'e1', targetId: 'e2' }));

      const stats = graph.getStats();
      expect(stats.relationCount).toBe(1);
    });

    it('should not add relation when source does not exist', () => {
      graph.addEntity(createEntity({ id: 'e2' }));
      graph.addRelation(createRelation({ sourceId: 'e1', targetId: 'e2' }));

      expect(graph.getStats().relationCount).toBe(0);
    });

    it('should not add relation when target does not exist', () => {
      graph.addEntity(createEntity({ id: 'e1' }));
      graph.addRelation(createRelation({ sourceId: 'e1', targetId: 'e2' }));

      expect(graph.getStats().relationCount).toBe(0);
    });

    it('should replace existing relation between same nodes', () => {
      graph.addEntity(createEntity({ id: 'e1' }));
      graph.addEntity(createEntity({ id: 'e2' }));
      graph.addRelation(
        createRelation({ sourceId: 'e1', targetId: 'e2', weight: 0.5 }),
      );
      graph.addRelation(
        createRelation({ sourceId: 'e1', targetId: 'e2', weight: 0.9 }),
      );

      expect(graph.getStats().relationCount).toBe(1);
    });
  });

  describe('should remove relation', () => {
    it('should remove relation', () => {
      graph.addEntity(createEntity({ id: 'e1' }));
      graph.addEntity(createEntity({ id: 'e2' }));
      graph.addRelation(createRelation({ sourceId: 'e1', targetId: 'e2' }));

      graph.removeRelation('e1', 'e2');

      expect(graph.getStats().relationCount).toBe(0);
    });

    it('should do nothing when removing non-existent relation', () => {
      graph.addEntity(createEntity({ id: 'e1' }));
      graph.addEntity(createEntity({ id: 'e2' }));

      graph.removeRelation('e1', 'e2');

      expect(graph.getStats().relationCount).toBe(0);
    });
  });

  describe('should get existing entity by id', () => {
    it('should get existing entity by id', () => {
      const entity = createEntity();
      graph.addEntity(entity);

      const retrieved = graph.getEntity('entity-1');
      expect(retrieved).not.toBeNull();
      expect(retrieved!.id).toBe('entity-1');
    });
  });

  describe('should return null for non-existent entity', () => {
    it('should return null for non-existent entity', () => {
      const retrieved = graph.getEntity('non-existent');
      expect(retrieved).toBeNull();
    });
  });

  describe('should find related entities using BFS traversal', () => {
    it('should find related entities using BFS traversal', () => {
      graph.addEntity(createEntity({ id: 'a', label: 'A' }));
      graph.addEntity(createEntity({ id: 'b', label: 'B' }));
      graph.addEntity(createEntity({ id: 'c', label: 'C' }));
      graph.addEntity(createEntity({ id: 'd', label: 'D' }));
      graph.addRelation(createRelation({ sourceId: 'a', targetId: 'b' }));
      graph.addRelation(createRelation({ sourceId: 'b', targetId: 'c' }));
      graph.addRelation(createRelation({ sourceId: 'c', targetId: 'd' }));

      const related = graph.findRelated('a');
      expect(related.length).toBeGreaterThan(0);
      expect(related.map((e) => e.id)).toContain('b');
      expect(related.map((e) => e.id)).toContain('c');
    });

    it('should return empty array for non-existent node', () => {
      const related = graph.findRelated('non-existent');
      expect(related).toEqual([]);
    });
  });

  describe('BFS should respect maxDepth parameter', () => {
    it('BFS should respect maxDepth parameter', () => {
      graph.addEntity(createEntity({ id: 'a', label: 'A' }));
      graph.addEntity(createEntity({ id: 'b', label: 'B' }));
      graph.addEntity(createEntity({ id: 'c', label: 'C' }));
      graph.addEntity(createEntity({ id: 'd', label: 'D' }));
      graph.addRelation(createRelation({ sourceId: 'a', targetId: 'b' }));
      graph.addRelation(createRelation({ sourceId: 'b', targetId: 'c' }));
      graph.addRelation(createRelation({ sourceId: 'c', targetId: 'd' }));

      const relatedDepth1 = graph.findRelated('a', 1);
      expect(relatedDepth1.map((e) => e.id)).toContain('b');
      expect(relatedDepth1.map((e) => e.id)).not.toContain('c');

      const relatedDepth2 = graph.findRelated('a', 2);
      expect(relatedDepth2.map((e) => e.id)).toContain('b');
      expect(relatedDepth2.map((e) => e.id)).toContain('c');
      expect(relatedDepth2.map((e) => e.id)).not.toContain('d');
    });
  });

  describe('should search entities by text query', () => {
    it('should search entities by text query', () => {
      graph.addEntity(createEntity({ id: 'x', label: 'React Hooks' }));
      graph.addEntity(createEntity({ id: 'y', label: 'Vue Components' }));
      graph.addEntity(createEntity({ id: 'z', label: 'Node Server' }));

      const results = graph.searchEntities('React');
      expect(results.length).toBe(1);
      expect(results[0].id).toBe('x');
    });

    it('should search in description', () => {
      graph.addEntity(
        createEntity({
          id: 'a',
          label: 'Unknown',
          description: 'React patterns and best practices',
        }),
      );

      const results = graph.searchEntities('React');
      expect(results.length).toBe(1);
      expect(results[0].id).toBe('a');
    });
  });

  describe('should search entities with partial matches', () => {
    it('should search entities with partial matches', () => {
      graph.addEntity(createEntity({ id: 'p', label: 'Programming' }));
      graph.addEntity(createEntity({ id: 'q', label: 'Program' }));

      const results = graph.searchEntities('Pro');
      expect(results.length).toBe(2);
    });
  });

  describe('should handle search with no matches', () => {
    it('should handle search with no matches', () => {
      graph.addEntity(createEntity({ id: 'a', label: 'Alpha' }));

      const results = graph.searchEntities('non-existent-query');
      expect(results).toEqual([]);
    });
  });

  describe('should export graph data', () => {
    it('should export graph data', () => {
      graph.addEntity(createEntity({ id: 'e1', label: 'Entity 1' }));
      graph.addEntity(createEntity({ id: 'e2', label: 'Entity 2' }));
      graph.addRelation(createRelation({ sourceId: 'e1', targetId: 'e2' }));

      const exported = graph.export();

      expect(Object.keys(exported.entities)).toHaveLength(2);
      expect(exported.entities['e1'].label).toBe('Entity 1');
      expect(exported.entities['e2'].label).toBe('Entity 2');
      expect(exported.relations).toHaveLength(1);
      expect(exported.relations[0].sourceId).toBe('e1');
      expect(exported.relations[0].targetId).toBe('e2');
    });
  });

  describe('should import graph data', () => {
    it('should import graph data', () => {
      const data = {
        entities: {
          e1: createEntity({ id: 'e1', label: 'Imported 1' }),
          e2: createEntity({ id: 'e2', label: 'Imported 2' }),
        },
        relations: [createRelation({ sourceId: 'e1', targetId: 'e2' })],
      };

      graph.import(data);

      expect(graph.getStats().entityCount).toBe(2);
      expect(graph.getStats().relationCount).toBe(1);
      expect(graph.getEntity('e1')!.label).toBe('Imported 1');
    });

    it('should clear existing data before import', () => {
      graph.addEntity(createEntity({ id: 'old', label: 'Old' }));

      const data = {
        entities: {
          fresh: createEntity({ id: 'fresh', label: 'Fresh' }),
        },
        relations: [],
      };

      graph.import(data);

      expect(graph.getEntity('old')).toBeNull();
      expect(graph.getEntity('fresh')!.label).toBe('Fresh');
    });
  });

  describe('should handle empty graph export/import', () => {
    it('should handle empty graph export', () => {
      const exported = graph.export();
      expect(exported.entities).toEqual({});
      expect(exported.relations).toEqual([]);
    });

    it('should handle empty graph import', () => {
      graph.addEntity(createEntity());
      graph.import({ entities: {}, relations: [] });

      expect(graph.getStats().entityCount).toBe(0);
    });
  });

  describe('should clear graph', () => {
    it('should clear graph', () => {
      graph.addEntity(createEntity({ id: 'e1' }));
      graph.addEntity(createEntity({ id: 'e2' }));
      graph.addRelation(createRelation({ sourceId: 'e1', targetId: 'e2' }));

      graph.clear();

      expect(graph.getStats().entityCount).toBe(0);
      expect(graph.getStats().relationCount).toBe(0);
    });
  });

  describe('should return correct stats', () => {
    it('should return correct stats (entityCount, relationCount, density)', () => {
      graph.addEntity(createEntity({ id: 'e1' }));
      graph.addEntity(createEntity({ id: 'e2' }));
      graph.addEntity(createEntity({ id: 'e3' }));
      graph.addRelation(createRelation({ sourceId: 'e1', targetId: 'e2' }));
      graph.addRelation(createRelation({ sourceId: 'e2', targetId: 'e3' }));

      const stats = graph.getStats();
      expect(stats.entityCount).toBe(3);
      expect(stats.relationCount).toBe(2);
    });

    it('should return density 0 for empty graph', () => {
      const stats = graph.getStats();
      expect(stats.density).toBe(0);
    });

    it('should return positive density for connected graph', () => {
      graph.addEntity(createEntity({ id: 'e1' }));
      graph.addEntity(createEntity({ id: 'e2' }));
      graph.addRelation(createRelation({ sourceId: 'e1', targetId: 'e2' }));

      const stats = graph.getStats();
      expect(stats.density).toBeGreaterThan(0);
    });
  });

  describe('init should reset graph', () => {
    it('should reset graph on init', () => {
      graph.addEntity(createEntity({ id: 'e1' }));
      graph.init();

      expect(graph.getStats().entityCount).toBe(0);
    });
  });
});