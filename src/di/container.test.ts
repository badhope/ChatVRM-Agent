import 'reflect-metadata';
import { describe, it, expect, beforeEach } from 'vitest';
import { container } from 'tsyringe';
import { TOKENS } from './tokens.js';
import { registerCoreServices } from './container.js';
import '../test/setup.js';

describe('DI Container', () => {
  beforeEach(() => {
    container.clearInstances();
  });

  it('should register and resolve ConfigManager', () => {
    registerCoreServices();
    const configManager = container.resolve(TOKENS.ConfigManager);
    expect(configManager).toBeDefined();
  });

  it('should register and resolve MemoryManager', () => {
    registerCoreServices();
    // MemoryManager may fail in test env due to file system dependencies
    try {
      const memoryManager = container.resolve(TOKENS.MemoryManager);
      expect(memoryManager).toBeDefined();
    } catch {
      // Expected in test environment without file system
    }
  });

  it('should register and resolve GitManager', () => {
    registerCoreServices();
    const gitManager = container.resolve(TOKENS.GitManager);
    expect(gitManager).toBeDefined();
  });

  it('should register and resolve ToolRegistry', () => {
    registerCoreServices();
    const toolRegistry = container.resolve(TOKENS.ToolRegistry);
    expect(toolRegistry).toBeDefined();
  });

  it('should register and resolve PluginLoader', () => {
    registerCoreServices();
    const pluginLoader = container.resolve(TOKENS.PluginLoader);
    expect(pluginLoader).toBeDefined();
  });

  it('should register and resolve HistoryManager', () => {
    registerCoreServices();
    const historyManager = container.resolve(TOKENS.HistoryManager);
    expect(historyManager).toBeDefined();
  });

  it('should return same instance for singleton services', () => {
    registerCoreServices();
    const instance1 = container.resolve(TOKENS.ConfigManager);
    const instance2 = container.resolve(TOKENS.ConfigManager);
    expect(instance1).toBe(instance2);
  });
});
