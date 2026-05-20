/**
 * ExperienceStore 单元测试
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { ExperienceStore, type Experience } from './experience-store.js';

// 使用临时目录进行测试
let tempDir: string;
let store: ExperienceStore;

function createTestExperience(overrides: Partial<Experience> = {}): Experience {
  return {
    id: `exp-test-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
    timestamp: new Date().toISOString(),
    taskType: 'bug-fix',
    taskDescription: '修复登录页面的表单验证问题',
    decisions: [
      {
        context: '需要选择工具来读取文件',
        chosen: 'read_file',
        outcome: 'success',
        confidence: 0.9,
        reasoning: '使用 read_file 工具读取源代码文件',
      },
    ],
    lessons: [
      '✅ 成功经验: 使用 read_file 先读取文件再修改',
      '❌ 改进方向: 修改前应该先备份文件',
    ],
    improvements: [
      '建议改进: 修改配置文件前总是先备份',
    ],
    patterns: [
      '登录页面表单验证失败',
      'read_file 工具使用成功',
    ],
    emotionalTone: 'confident',
    ...overrides,
  };
}

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'experience-store-test-'));
  store = new ExperienceStore(tempDir);
});

afterEach(async () => {
  // 清理临时目录
  try {
    await fs.rm(tempDir, { recursive: true, force: true });
  } catch {
    // 忽略清理失败
  }
});

describe('ExperienceStore', () => {
  describe('addExperience', () => {
    it('应该正确添加一条经验', async () => {
      const exp = createTestExperience();
      await store.addExperience(exp);

      expect(store.getExperienceCount()).toBe(1);
    });

    it('应该支持添加多条经验', async () => {
      await store.addExperience(createTestExperience());
      await store.addExperience(createTestExperience());
      await store.addExperience(createTestExperience());

      expect(store.getExperienceCount()).toBe(3);
    });

    it('添加经验后应该自动持久化到磁盘', async () => {
      const exp = createTestExperience();
      await store.addExperience(exp);

      // 创建新的 store 实例，从磁盘加载
      const newStore = new ExperienceStore(tempDir);
      await newStore.load();
      expect(newStore.getExperienceCount()).toBe(1);
    });

    it('超过 200 条经验时应该自动裁剪', async () => {
      // 添加 210 条经验
      for (let i = 0; i < 210; i++) {
        await store.addExperience(createTestExperience({
          id: `exp-batch-${i}`,
          taskDescription: `任务 ${i}`,
        }));
      }

      expect(store.getExperienceCount()).toBe(200);

      // 验证保留的是最新的经验
      const filePath = path.join(tempDir, 'experiences.json');
      const data = await fs.readFile(filePath, 'utf-8');
      const experiences = JSON.parse(data);
      expect(experiences[0].id).toBe('exp-batch-10'); // 前 10 条被裁剪
      expect(experiences[experiences.length - 1].id).toBe('exp-batch-209');
    });
  });

  describe('load / save (持久化)', () => {
    it('空文件时 load 应该返回空数组', async () => {
      await store.load();
      expect(store.getExperienceCount()).toBe(0);
    });

    it('save 和 load 应该保持数据一致性', async () => {
      const exp1 = createTestExperience({ id: 'exp-1', taskType: 'refactor' });
      const exp2 = createTestExperience({ id: 'exp-2', taskType: 'feature', emotionalTone: 'frustrated' });

      await store.addExperience(exp1);
      await store.addExperience(exp2);

      // 重新加载
      const newStore = new ExperienceStore(tempDir);
      await newStore.load();

      expect(newStore.getExperienceCount()).toBe(2);

      // limit=1 时只返回最相关的一条
      const relevant = await newStore.getRelevantExperiences('refactor', 1);
      expect(relevant).toHaveLength(1);
      expect(relevant[0].id).toBe('exp-1');
    });

    it('文件损坏时 load 应该优雅降级为空数组', async () => {
      // 写入损坏的 JSON
      const filePath = path.join(tempDir, 'experiences.json');
      await fs.mkdir(tempDir, { recursive: true });
      await fs.writeFile(filePath, 'not valid json {{{', 'utf-8');

      await store.load();
      expect(store.getExperienceCount()).toBe(0);
    });
  });

  describe('getRelevantExperiences', () => {
    it('应该优先返回同类型的经验', async () => {
      await store.addExperience(createTestExperience({ id: 'exp-bug-1', taskType: 'bug-fix', timestamp: new Date(Date.now() - 2000).toISOString() }));
      await store.addExperience(createTestExperience({ id: 'exp-bug-2', taskType: 'bug-fix', timestamp: new Date(Date.now() - 1000).toISOString() }));
      await store.addExperience(createTestExperience({ id: 'exp-refactor-1', taskType: 'refactor' }));
      await store.addExperience(createTestExperience({ id: 'exp-feature-1', taskType: 'feature' }));

      const relevant = await store.getRelevantExperiences('bug-fix', 3);
      expect(relevant).toHaveLength(3);
      expect(relevant[0].id).toBe('exp-bug-2'); // 最新的同类型优先
      expect(relevant[1].id).toBe('exp-bug-1');
    });

    it('同类型经验不足时应该补充其他类型', async () => {
      await store.addExperience(createTestExperience({ id: 'exp-bug-1', taskType: 'bug-fix' }));
      await store.addExperience(createTestExperience({ id: 'exp-refactor-1', taskType: 'refactor' }));
      await store.addExperience(createTestExperience({ id: 'exp-feature-1', taskType: 'feature' }));

      const relevant = await store.getRelevantExperiences('bug-fix', 3);
      expect(relevant).toHaveLength(3);
      // 第一条应该是 bug-fix 类型
      expect(relevant[0].taskType).toBe('bug-fix');
    });

    it('limit 参数应该限制返回数量', async () => {
      for (let i = 0; i < 10; i++) {
        await store.addExperience(createTestExperience({ id: `exp-${i}` }));
      }

      const relevant = await store.getRelevantExperiences('bug-fix', 5);
      expect(relevant).toHaveLength(5);
    });

    it('没有匹配经验时应该返回空数组', async () => {
      const relevant = await store.getRelevantExperiences('nonexistent');
      expect(relevant).toHaveLength(0);
    });
  });

  describe('getPatterns', () => {
    it('应该从成功经验中提取成功模式', async () => {
      await store.addExperience(createTestExperience({
        id: 'exp-success',
        emotionalTone: 'confident',
        patterns: ['模式A', '模式B'],
        decisions: [
          {
            context: '选择工具',
            chosen: 'read_file',
            outcome: 'success',
            confidence: 0.9,
            reasoning: '读取文件进行分析',
          },
        ],
      }));

      const { successPatterns, failurePatterns } = await store.getPatterns();
      expect(successPatterns.length).toBeGreaterThan(0);
      expect(successPatterns.some(p => p.includes('模式A'))).toBe(true);
      expect(successPatterns.some(p => p.includes('模式B'))).toBe(true);
    });

    it('应该从失败经验中提取失败模式', async () => {
      await store.addExperience(createTestExperience({
        id: 'exp-failure',
        emotionalTone: 'frustrated',
        patterns: ['错误模式X'],
        decisions: [
          {
            context: '选择工具',
            chosen: 'delete_file',
            outcome: 'failure',
            confidence: 0.3,
            reasoning: '误删了文件',
          },
        ],
      }));

      const { failurePatterns } = await store.getPatterns();
      expect(failurePatterns.length).toBeGreaterThan(0);
      expect(failurePatterns.some(p => p.includes('错误模式X'))).toBe(true);
    });

    it('应该去重重复的模式', async () => {
      await store.addExperience(createTestExperience({
        id: 'exp-1',
        emotionalTone: 'confident',
        patterns: ['重复模式'],
      }));
      await store.addExperience(createTestExperience({
        id: 'exp-2',
        emotionalTone: 'confident',
        patterns: ['重复模式'],
      }));

      const { successPatterns } = await store.getPatterns();
      const duplicateCount = successPatterns.filter(p => p === '重复模式').length;
      expect(duplicateCount).toBe(1);
    });

    it('应该限制模式数量最多 15 条', async () => {
      for (let i = 0; i < 20; i++) {
        await store.addExperience(createTestExperience({
          id: `exp-${i}`,
          emotionalTone: 'confident',
          patterns: [`唯一模式${i}`],
        }));
      }

      const { successPatterns } = await store.getPatterns();
      expect(successPatterns.length).toBeLessThanOrEqual(15);
    });
  });

  describe('getLessons', () => {
    it('应该返回所有经验中的教训', async () => {
      await store.addExperience(createTestExperience({
        id: 'exp-1',
        lessons: ['教训1', '教训2'],
      }));
      await store.addExperience(createTestExperience({
        id: 'exp-2',
        lessons: ['教训2', '教训3'], // 教训2 重复
      }));

      const lessons = await store.getLessons();
      expect(lessons).toContain('教训1');
      expect(lessons).toContain('教训2');
      expect(lessons).toContain('教训3');
      expect(lessons).toHaveLength(3); // 去重后
    });

    it('没有经验时应该返回空数组', async () => {
      const lessons = await store.getLessons();
      expect(lessons).toHaveLength(0);
    });
  });

  describe('generateBehaviorGuidelines', () => {
    it('没有经验时应该返回空字符串', async () => {
      const guidelines = await store.generateBehaviorGuidelines();
      expect(guidelines).toBe('');
    });

    it('应该从失败教训中生成指导', async () => {
      await store.addExperience(createTestExperience({
        id: 'exp-fail',
        emotionalTone: 'frustrated',
        lessons: [
          '❌ 改进方向: 修改配置文件前应该先备份',
          '❌ 改进方向: 使用 TypeScript 时优先使用 interface',
        ],
        improvements: [
          '建议改进: 处理API错误时总是检查rate limit',
        ],
      }));

      const guidelines = await store.generateBehaviorGuidelines();
      expect(guidelines).toContain('修改配置文件前应该先备份');
      expect(guidelines).toContain('使用 TypeScript 时优先使用 interface');
      expect(guidelines).toContain('处理API错误时总是检查rate limit');
    });

    it('应该以 "## 基于过往经验的指导" 开头', async () => {
      await store.addExperience(createTestExperience({
        id: 'exp-1',
        emotionalTone: 'frustrated',
        lessons: ['❌ 改进方向: 测试一下'],
      }));

      const guidelines = await store.generateBehaviorGuidelines();
      expect(guidelines).toContain('## 基于过往经验的指导');
    });

    it('应该将失败模式转化为 "避免..." 指导', async () => {
      await store.addExperience(createTestExperience({
        id: 'exp-pattern',
        emotionalTone: 'frustrated',
        patterns: ['失败模式: 不检查空值就调用方法'],
        lessons: [],
      }));

      const guidelines = await store.generateBehaviorGuidelines();
      expect(guidelines).toContain('避免不检查空值就调用方法');
    });

    it('应该限制指导数量最多 8 条', async () => {
      for (let i = 0; i < 15; i++) {
        await store.addExperience(createTestExperience({
          id: `exp-${i}`,
          emotionalTone: 'frustrated',
          lessons: [`❌ 改进方向: 指导${i}`],
        }));
      }

      const guidelines = await store.generateBehaviorGuidelines();
      const lines = guidelines.split('\n').filter(l => l.startsWith('- '));
      expect(lines.length).toBeLessThanOrEqual(8);
    });

    it('应该从成功经验中提取正面指导', async () => {
      await store.addExperience(createTestExperience({
        id: 'exp-success',
        emotionalTone: 'confident',
        lessons: [
          '✅ 成功经验: 使用渐进式重构策略效果更好',
        ],
      }));

      const guidelines = await store.generateBehaviorGuidelines();
      expect(guidelines).toContain('使用渐进式重构策略效果更好');
    });

    it('应该清理 emoji 前缀', async () => {
      await store.addExperience(createTestExperience({
        id: 'exp-emoji',
        emotionalTone: 'frustrated',
        lessons: ['💡 测试时应该使用 mock 数据'],
      }));

      const guidelines = await store.generateBehaviorGuidelines();
      expect(guidelines).not.toContain('💡');
      expect(guidelines).toContain('测试时应该使用 mock 数据');
    });
  });

  describe('边界情况', () => {
    it('空教训列表不应该导致崩溃', async () => {
      const exp = createTestExperience({
        lessons: [],
        improvements: [],
        patterns: [],
      });
      await store.addExperience(exp);

      const guidelines = await store.generateBehaviorGuidelines();
      // 没有可提取的指导，应该返回空字符串
      expect(guidelines).toBe('');
    });

    it('过长的指导应该被截断', async () => {
      const longLesson = '❌ 改进方向: ' + '这是一段非常长的教训文本'.repeat(20);
      await store.addExperience(createTestExperience({
        id: 'exp-long',
        emotionalTone: 'frustrated',
        lessons: [longLesson],
        improvements: [],
        patterns: [],
      }));

      const guidelines = await store.generateBehaviorGuidelines();
      const lines = guidelines.split('\n').filter(l => l.startsWith('- '));
      expect(lines.length).toBe(1);
      // 截断后的行应该不超过约 150 字符
      expect(lines[0].length).toBeLessThan(150);
    });

    it('save 到不存在的目录应该自动创建', async () => {
      const nestedDir = path.join(tempDir, 'a', 'b', 'c');
      const nestedStore = new ExperienceStore(nestedDir);

      await nestedStore.addExperience(createTestExperience());

      const filePath = path.join(nestedDir, 'experiences.json');
      const data = await fs.readFile(filePath, 'utf-8');
      const experiences = JSON.parse(data);
      expect(experiences).toHaveLength(1);
    });
  });
});
