/**
 * Agent + Memory 模块集成测试
 */
import { describe, it, expect } from 'vitest';
import { knowledgeGraph } from '../../memory/knowledge-graph.js';
import { memoryGraph } from '../../memory/memory-graph.js';

describe('Agent + Memory Integration', () => {
  describe('Knowledge Graph Integration', () => {
    it('should expose knowledge graph functions', async () => {
      expect(typeof knowledgeGraph.init).toBe('function');
      expect(typeof knowledgeGraph.addEntity).toBe('function');
      expect(typeof knowledgeGraph.query).toBe('function');
    });
  });

  describe('Memory Graph Integration', () => {
    it('should expose memory graph functions', async () => {
      expect(typeof memoryGraph.init).toBe('function');
      expect(typeof memoryGraph.addNode).toBe('function');
      expect(typeof memoryGraph.search).toBe('function');
    });
  });
});
