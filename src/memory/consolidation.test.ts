/**
 * MemoryConsolidator 单元测试
 * 测试遗忘曲线、整合逻辑和模式提取
 */

import { describe, it, expect } from 'vitest';
import { MemoryConsolidator, type DecayableMemory } from './consolidation.js';

function createMemory(overrides: Partial<DecayableMemory> & { id: string }): DecayableMemory {
  return {
    importance: 0.5,
    createdAt: new Date(),
    stability: 7,
    accessCount: 0,
    ...overrides,
  };
}

describe('MemoryConsolidator', () => {
  describe('applyForgettingCurve', () => {
    it('应该根据时间衰减重要性', () => {
      const consolidator = new MemoryConsolidator({ enabled: true });
      const now = new Date();
      const oldDate = new Date(now.getTime() - 7 * 86400000); // 7天前

      const memories: DecayableMemory[] = [
        createMemory({ id: 'old', importance: 1.0, createdAt: oldDate, stability: 7 }),
        createMemory({ id: 'new', importance: 1.0, createdAt: now, stability: 7 }),
      ];

      consolidator.applyForgettingCurve(memories);

      // 7天前的记忆: retention = e^(-7/7) = e^-1 ≈ 0.368
      expect(memories[0].importance).toBeCloseTo(0.368, 2);
      // 刚创建的记忆不应衰减
      expect(memories[1].importance).toBeCloseTo(1.0, 2);
    });

    it('高稳定性记忆衰减更慢', () => {
      const consolidator = new MemoryConsolidator({ enabled: true });
      const oldDate = new Date(Date.now() - 7 * 86400000);

      const memories: DecayableMemory[] = [
        createMemory({ id: 'low-stability', importance: 1.0, createdAt: oldDate, stability: 3 }),
        createMemory({ id: 'high-stability', importance: 1.0, createdAt: oldDate, stability: 30 }),
      ];

      consolidator.applyForgettingCurve(memories);

      // 低稳定性: e^(-7/3) ≈ 0.097
      expect(memories[0].importance).toBeCloseTo(0.097, 2);
      // 高稳定性: e^(-7/30) ≈ 0.794
      expect(memories[1].importance).toBeCloseTo(0.794, 2);
    });

    it('禁用时不衰减', () => {
      const consolidator = new MemoryConsolidator({ enabled: false });
      const oldDate = new Date(Date.now() - 30 * 86400000);

      const memories: DecayableMemory[] = [
        createMemory({ id: 'a', importance: 0.8, createdAt: oldDate }),
      ];

      consolidator.applyForgettingCurve(memories);
      expect(memories[0].importance).toBe(0.8);
    });

    it('重要性不低于 0 且不超过 1', () => {
      const consolidator = new MemoryConsolidator({ enabled: true });
      const veryOld = new Date(Date.now() - 365 * 86400000);

      const memories: DecayableMemory[] = [
        createMemory({ id: 'ancient', importance: 0.01, createdAt: veryOld, stability: 1 }),
      ];

      consolidator.applyForgettingCurve(memories);
      expect(memories[0].importance).toBeGreaterThanOrEqual(0);
      expect(memories[0].importance).toBeLessThanOrEqual(1);
    });
  });

  describe('reinforceMemory', () => {
    it('应该增加稳定性和重要性', () => {
      const consolidator = new MemoryConsolidator();
      const memory = createMemory({ id: 'r1', importance: 0.3, stability: 7, accessCount: 2 });

      consolidator.reinforceMemory(memory);

      expect(memory.stability).toBeCloseTo(10.5, 1); // 7 * 1.5
      expect(memory.importance).toBeCloseTo(0.4, 1);  // 0.3 + 0.1
      expect(memory.accessCount).toBe(3);
    });

    it('稳定性不应超过 365 天', () => {
      const consolidator = new MemoryConsolidator();
      const memory = createMemory({ id: 'r2', importance: 0.5, stability: 300, accessCount: 10 });

      consolidator.reinforceMemory(memory);
      expect(memory.stability).toBeLessThanOrEqual(365);
    });

    it('重要性不应超过 1', () => {
      const consolidator = new MemoryConsolidator();
      const memory = createMemory({ id: 'r3', importance: 0.95, stability: 7 });

      consolidator.reinforceMemory(memory);
      expect(memory.importance).toBeLessThanOrEqual(1);
    });
  });

  describe('extractPatterns', () => {
    it('应该识别高频访问记忆', () => {
      const consolidator = new MemoryConsolidator();
      const memories: DecayableMemory[] = [
        createMemory({ id: 'freq', accessCount: 5 }),
        createMemory({ id: 'rare', accessCount: 1 }),
      ];

      const patterns = consolidator.extractPatterns(memories);
      expect(patterns).toContain('高频访问记忆: freq');
      expect(patterns).not.toContain('高频访问记忆: rare');
    });

    it('应该识别长期稳定记忆', () => {
      const consolidator = new MemoryConsolidator();
      const memories: DecayableMemory[] = [
        createMemory({ id: 'stable', stability: 50 }),
        createMemory({ id: 'unstable', stability: 5 }),
      ];

      const patterns = consolidator.extractPatterns(memories);
      expect(patterns).toContain('长期稳定记忆: stable');
      expect(patterns).not.toContain('长期稳定记忆: unstable');
    });

    it('无模式时返回空数组', () => {
      const consolidator = new MemoryConsolidator();
      const memories: DecayableMemory[] = [
        createMemory({ id: 'normal', accessCount: 1, stability: 7 }),
      ];

      const patterns = consolidator.extractPatterns(memories);
      expect(patterns).toEqual([]);
    });
  });

  describe('consolidate', () => {
    it('应该整合低重要性记忆', async () => {
      const consolidator = new MemoryConsolidator({ consolidationThreshold: 0.3 });
      const removedIds: string[] = [];
      const addedSummaries: string[] = [];

      const mockManager = {
        removeMemory: async (id: string) => { removedIds.push(id); },
        addSummary: async (summary: string) => { addedSummaries.push(summary); },
      };

      // 创建两个共享相同 id 前缀（前8字符）的低重要性记忆
      const prefix = 'aaaa1111';
      const memories: DecayableMemory[] = [
        createMemory({ id: `${prefix}-b1`, importance: 0.1 }),
        createMemory({ id: `${prefix}-b2`, importance: 0.2 }),
      ];

      const result = await consolidator.consolidate(memories, mockManager as { removeMemory: (id: string) => Promise<void>; addSummary: (summary: string, sourceIds: string[]) => Promise<void> });

      expect(result.memoriesConsolidated).toBe(2);
      expect(result.memoriesRemoved).toBe(2);
      expect(result.summariesCreated).toBe(1);
      expect(removedIds.length).toBe(2);
      expect(addedSummaries.length).toBe(1);
    });

    it('不应整合高重要性记忆', async () => {
      const consolidator = new MemoryConsolidator({ consolidationThreshold: 0.3 });
      const mockManager = {
        removeMemory: async () => {},
        addSummary: async () => {},
      };

      const memories: DecayableMemory[] = [
        createMemory({ id: 'high1', importance: 0.8 }),
        createMemory({ id: 'high2', importance: 0.9 }),
      ];

      const result = await consolidator.consolidate(memories, mockManager as { removeMemory: (id: string) => Promise<void>; addSummary: (summary: string, sourceIds: string[]) => Promise<void> });
      expect(result.memoriesConsolidated).toBe(0);
    });
  });

  describe('config', () => {
    it('应该使用默认配置', () => {
      const consolidator = new MemoryConsolidator();
      const config = consolidator.getConfig();
      expect(config.enabled).toBe(true);
      expect(config.decayFactor).toBe(0.95);
      expect(config.consolidationThreshold).toBe(0.3);
      expect(config.maxShortTermMemories).toBe(500);
      expect(config.autoConsolidateOnLoad).toBe(true);
    });

    it('应该覆盖默认配置', () => {
      const consolidator = new MemoryConsolidator({
        consolidationThreshold: 0.5,
        maxShortTermMemories: 100,
      });
      const config = consolidator.getConfig();
      expect(config.consolidationThreshold).toBe(0.5);
      expect(config.maxShortTermMemories).toBe(100);
      // 未覆盖的保持默认
      expect(config.decayFactor).toBe(0.95);
    });
  });
});
