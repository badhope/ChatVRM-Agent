/**
 * 内置工具库集成测试
 * 测试ToolRegistry和内置工具
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ToolRegistry, toolRegistry } from '../../tools/registry.js';
import { testUtils, createTestContext, cleanupTestContext } from '../helpers/test-utils.js';
import type { TestContext } from '../helpers/test-utils.js';
import path from 'path';

describe('Built-in Tool Library', () => {
  let testCtx: TestContext;

  beforeEach(async () => {
    testCtx = await createTestContext();
  });

  afterEach(async () => {
    await cleanupTestContext(testCtx);
  });

  describe('ToolRegistry', () => {
    it('should initialize correctly', () => {
      const registry = new ToolRegistry();
      expect(registry).toBeDefined();
    });

    it('should load built-in tools', () => {
      const registry = new ToolRegistry();
      const tools = registry.listAll();
      
      expect(tools).toBeInstanceOf(Array);
      expect(tools.length).toBeGreaterThan(0);
    });

    it('should list available tools', () => {
      const registry = new ToolRegistry();
      const tools = registry.listAll();
      
      expect(tools).toBeInstanceOf(Array);
    });

    it('should get tool by name', () => {
      const registry = new ToolRegistry();
      
      const allTools = registry.listAll();
      if (allTools.length > 0) {
        const tool = registry.get(allTools[0].name);
        expect(tool).toBeDefined();
      }
    });

    it('should have expected built-in tools', () => {
      const registry = new ToolRegistry();
      
      expect(registry.has('read_file')).toBe(true);
      expect(registry.has('write_file')).toBe(true);
      expect(registry.has('search_files')).toBe(true);
      expect(registry.has('shell')).toBe(true);
    });
  });

  describe('File System Tools', () => {
    it('should work with temporary files', async () => {
      const testFile = await testUtils.createTestFile(
        testCtx.tempDir,
        'test.txt',
        'Test content'
      );

      expect(testFile).toBeDefined();
    });

    it('should execute file tools', async () => {
      const registry = new ToolRegistry();
      const testFile = await testUtils.createTestFile(
        testCtx.tempDir,
        'test.txt',
        'Hello World!'
      );

      // 测试读取文件工具
      const readTool = registry.get('read_file');
      expect(readTool).toBeDefined();
      
      if (readTool) {
        const result = await readTool.execute({ path: testFile });
        expect(result.success).toBe(true);
        expect(result.output).toContain('Hello World!');
      }
    });
  });

  describe('Tool Security', () => {
    it('should validate tool parameters', () => {
      const registry = new ToolRegistry();
      const tools = registry.listAll();
      
      for (const tool of tools) {
        expect(tool).toHaveProperty('name');
        expect(tool).toHaveProperty('description');
        expect(tool).toHaveProperty('parameters');
        expect(Array.isArray(tool.parameters)).toBe(true);
      }
    });
  });

  describe('Global toolRegistry singleton', () => {
    it('should be available and initialized', () => {
      expect(toolRegistry).toBeDefined();
      const tools = toolRegistry.listAll();
      expect(tools.length).toBeGreaterThan(0);
    });
  });
});
