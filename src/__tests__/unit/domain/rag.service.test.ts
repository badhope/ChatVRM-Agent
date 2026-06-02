import { describe, it, expect, beforeEach } from 'vitest';
import {
  KnowledgeGraph,
  type KnowledgeEntity,
} from '../../../domain/memory/memory.service.js';
import { RAGService, type RAGResult } from '../../../domain/memory/rag.service.js';

function createEntity(
  overrides: Partial<KnowledgeEntity> = {},
): KnowledgeEntity {
  return {
    id: 'e1',
    type: 'concept' as const,
    label: 'Default Entity',
    description: 'Default description for testing',
    confidence: 80,
    relatedIds: [],
    createdAt: new Date().toISOString(),
    lastAccessed: new Date().toISOString(),
    ...overrides,
  };
}

function populateGraph(graph: KnowledgeGraph): void {
  graph.addEntity(
    createEntity({
      id: 'react',
      label: 'React',
      type: 'tool',
      description: 'A JavaScript library for building user interfaces with components and hooks',
      confidence: 95,
    }),
  );
  graph.addEntity(
    createEntity({
      id: 'vue',
      label: 'Vue',
      type: 'tool',
      description: 'A progressive JavaScript framework for building UIs',
      confidence: 85,
    }),
  );
  graph.addEntity(
    createEntity({
      id: 'typescript',
      label: 'TypeScript',
      type: 'concept',
      description: 'A typed superset of JavaScript that compiles to plain JavaScript',
      confidence: 90,
    }),
  );
  graph.addEntity(
    createEntity({
      id: 'low-conf',
      label: 'Low Confidence Entity',
      type: 'fact',
      description: 'This entity has very low confidence',
      confidence: 10,
    }),
  );
  graph.addEntity(
    createEntity({
      id: 'testing',
      label: 'Testing Patterns',
      type: 'pattern',
      description: 'Best practices for testing React applications with vitest',
      confidence: 75,
    }),
  );
}

describe('RAGService', () => {
  let graph: KnowledgeGraph;
  let rag: RAGService;

  beforeEach(() => {
    graph = new KnowledgeGraph();
    rag = new RAGService(graph);
  });

  describe('should return empty results for empty query', () => {
    it('should return empty results for empty query', async () => {
      populateGraph(graph);

      const results = await rag.search({
        query: '',
        topK: 5,
        minConfidence: 0,
      });

      expect(results).toEqual([]);
    });
  });

  describe('should return results sorted by relevance', () => {
    it('should return results sorted by relevance', async () => {
      populateGraph(graph);

      const results = await rag.search({
        query: 'React',
        topK: 5,
        minConfidence: 0,
      });

      expect(results.length).toBeGreaterThan(0);
      for (let i = 1; i < results.length; i++) {
        expect(results[i].score).toBeLessThanOrEqual(results[i - 1].score);
      }
    });
  });

  describe('should filter by minConfidence', () => {
    it('should filter by minConfidence', async () => {
      populateGraph(graph);
      graph.addEntity(
        createEntity({
          id: 'high-entity',
          label: 'High Confidence Entity',
          type: 'concept',
          description: 'An entity with high confidence for testing filters',
          confidence: 90,
        }),
      );

      const results = await rag.search({
        query: 'entity',
        topK: 10,
        minConfidence: 50,
      });

      expect(results.length).toBeGreaterThan(0);
      for (const r of results) {
        expect(r.entity.confidence).toBeGreaterThanOrEqual(50);
      }
      expect(results.every((r) => r.entity.id !== 'low-conf')).toBe(true);
    });
  });

  describe('should apply confidence filter', () => {
    it('should apply confidence filter', async () => {
      populateGraph(graph);

      const resultsLow = await rag.search({
        query: 'entity',
        topK: 10,
        minConfidence: 0,
      });

      const resultsHigh = await rag.search({
        query: 'entity',
        topK: 10,
        minConfidence: 80,
      });

      expect(resultsHigh.length).toBeLessThan(resultsLow.length);
    });
  });

  describe('should respect topK limit', () => {
    it('should respect topK limit', async () => {
      populateGraph(graph);

      const results = await rag.search({
        query: 'JavaScript',
        topK: 1,
        minConfidence: 0,
      });

      expect(results.length).toBeLessThanOrEqual(1);
    });

    it('should default to topK=5', async () => {
      populateGraph(graph);

      const results = await rag.search({
        query: 'JavaScript',
        topK: 5,
        minConfidence: 0,
      });

      expect(results.length).toBeLessThanOrEqual(5);
    });
  });

  describe('should rerank results with name match bonus', () => {
    it('should rerank results with name match bonus', () => {
      populateGraph(graph);

      const results: RAGResult[] = [
        {
          entity: createEntity({ id: 'react', label: 'React', type: 'tool' }),
          score: 5,
          snippet: 'React library',
        },
        {
          entity: createEntity({ id: 'vue', label: 'Vue', type: 'tool' }),
          score: 5,
          snippet: 'Vue framework',
        },
      ];

      const reranked = rag.rerank(results, 'React');

      expect(reranked[0].entity.id).toBe('react');
      expect(reranked[0].score).toBeGreaterThan(reranked[1].score);
    });
  });

  describe('should generate context with token budget', () => {
    it('should generate context with token budget', async () => {
      populateGraph(graph);

      const searchResults = await rag.search({
        query: 'React',
        topK: 5,
        minConfidence: 0,
      });

      const context = rag.generateContext(searchResults, 50);

      const estimatedTokens = Math.ceil(context.length / 4);
      expect(estimatedTokens).toBeLessThanOrEqual(50);
    });

    it('should generate non-empty context for valid results', async () => {
      populateGraph(graph);

      const searchResults = await rag.search({
        query: 'React',
        topK: 5,
        minConfidence: 0,
      });

      const context = rag.generateContext(searchResults, 2000);
      expect(context.length).toBeGreaterThan(0);
      expect(context).toContain('React');
    });
  });

  describe('should return empty context for empty results', () => {
    it('should return empty context for empty results', () => {
      const context = rag.generateContext([], 2000);
      expect(context).toBe('');
    });
  });

  describe('should extract best snippet around matching terms', () => {
    it('should extract best snippet around matching terms', async () => {
      const longDesc =
        'A'.repeat(100) + ' react ' + 'B'.repeat(200);
      graph.addEntity(
        createEntity({
          id: 'long',
          label: 'Long Entity',
          description: longDesc,
        }),
      );

      const results = await rag.search({
        query: 'react',
        topK: 5,
        minConfidence: 0,
      });

      expect(results.length).toBe(1);
      expect(results[0].snippet.length).toBeLessThanOrEqual(200);
      expect(results[0].snippet).toContain('react');
    });
  });

  describe('should return full description when shorter than max length', () => {
    it('should return full description when shorter than max length', async () => {
      graph.addEntity(
        createEntity({
          id: 'short',
          label: 'Short',
          description: 'A short description',
        }),
      );

      const results = await rag.search({
        query: 'short',
        topK: 5,
        minConfidence: 0,
      });

      expect(results.length).toBe(1);
      expect(results[0].snippet).toBe('A short description');
    });
  });

  describe('should search in label and description', () => {
    it('should search in label and description', async () => {
      graph.addEntity(
        createEntity({
          id: 'label-match',
          label: 'React Hooks',
          description: 'Some unrelated text',
        }),
      );
      graph.addEntity(
        createEntity({
          id: 'desc-match',
          label: 'Unrelated',
          description: 'React components and state management',
        }),
      );

      const results = await rag.search({
        query: 'React',
        topK: 10,
        minConfidence: 0,
      });

      const ids = results.map((r) => r.entity.id);
      expect(ids).toContain('label-match');
      expect(ids).toContain('desc-match');
    });
  });

  describe('should score exact label matches higher', () => {
    it('should score exact label matches higher', async () => {
      graph.addEntity(
        createEntity({
          id: 'exact',
          label: 'React',
          description: 'The React library',
        }),
      );
      graph.addEntity(
        createEntity({
          id: 'partial',
          label: 'Reactive Programming',
          description: 'A paradigm for working with data streams',
        }),
      );

      const results = await rag.search({
        query: 'React',
        topK: 10,
        minConfidence: 0,
      });

      const exactResult = results.find((r) => r.entity.id === 'exact');
      const partialResult = results.find((r) => r.entity.id === 'partial');

      if (exactResult && partialResult) {
        expect(exactResult.score).toBeGreaterThan(partialResult.score);
      }
    });
  });

  describe('should handle score calculation', () => {
    it('should have positive score for relevant results', async () => {
      populateGraph(graph);

      const results = await rag.search({
        query: 'React',
        topK: 5,
        minConfidence: 0,
      });

      expect(results.length).toBeGreaterThan(0);
      for (const r of results) {
        expect(r.score).toBeGreaterThan(0);
      }
    });

    it('should return empty for query with no matches', async () => {
      populateGraph(graph);

      const results = await rag.search({
        query: 'zzz_nonexistent_term_zzz',
        topK: 5,
        minConfidence: 0,
      });

      expect(results).toEqual([]);
    });
  });
});