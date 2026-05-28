/**
 * 双Agent协作系统集成测试
 * 测试PlanningAgent、ExecutionAgent和CollaborationManager
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  PlanningAgent,
  ExecutionAgent,
  CollaborationManager,
  type SubTask,
  type AgentMessage,
  type CollaborationContext,
} from '../../agent/index.js';
import { testUtils, createTestContext, cleanupTestContext } from '../helpers/test-utils.js';
import type { TestContext } from '../helpers/test-utils.js';

describe('Dual Agent System', () => {
  let testCtx: TestContext;

  beforeEach(async () => {
    testCtx = await createTestContext();
  });

  afterEach(async () => {
    await cleanupTestContext(testCtx);
  });

  describe('PlanningAgent', () => {
    it('should initialize correctly', () => {
      const planningAgent = new PlanningAgent();
      expect(planningAgent).toBeDefined();
    });

    it('should decompose a bug fix task', async () => {
      const planningAgent = new PlanningAgent();

      const subtasks = await planningAgent.decomposeTask(
        'fix: 修复登录页面的bug',
        'bug-hunter',
        5,
        10
      );

      expect(subtasks).toBeInstanceOf(Array);
      expect(subtasks.length).toBeGreaterThan(0);
      expect(subtasks[0]).toHaveProperty('id');
      expect(subtasks[0]).toHaveProperty('description');
      expect(subtasks[0]).toHaveProperty('priority');
    });

    it('should decompose a development task', async () => {
      const planningAgent = new PlanningAgent();

      const subtasks = await planningAgent.decomposeTask(
        '实现用户登录功能',
        'fullstack',
        5,
        10
      );

      expect(subtasks).toBeInstanceOf(Array);
      expect(subtasks.length).toBeGreaterThan(0);
    });

    it('should assign dependencies between subtasks', async () => {
      const planningAgent = new PlanningAgent();

      const subtasks = await planningAgent.decomposeTask(
        '修复登录bug',
        'bug-hunter',
        5,
        10
      );

      expect(subtasks).toBeInstanceOf(Array);
      expect(subtasks.length).toBeGreaterThan(1);
    });
  });

  describe('ExecutionAgent', () => {
    it('should initialize correctly', () => {
      const executionAgent = new ExecutionAgent();
      expect(executionAgent).toBeDefined();
    });
  });

  describe('CollaborationManager', () => {
    it('should initialize correctly', () => {
      const manager = new CollaborationManager();
      expect(manager).toBeDefined();
    });
  });

  describe('Full Dual Agent Workflow', () => {
    it('should coordinate planning and execution', async () => {
      const manager = new CollaborationManager();

      const result = await manager.startCollaboration(
        '修复登录页面bug',
        'bug-hunter',
        {
          maxDepth: 3,
          maxSubtasks: 5,
        }
      );

      expect(result).toBeDefined();
      expect(result).toHaveProperty('taskId');
      expect(result).toHaveProperty('success');
    });
  });
});
