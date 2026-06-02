import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PlanStage } from '../../../stages/plan.stage.js';
import { resetEventBus } from '../../../core/event-bus.js';
import type { PipelineContext } from '../../../core/types.js';
import type { LLMAdapter } from '../../../adapters/llm.adapter.js';
import type { ConfigAdapter } from '../../../adapters/config.adapter.js';

const mockLLM = {
  chat: vi.fn().mockRejectedValue(new Error('LLM fallback')),
  stream: vi.fn(),
  listModels: vi.fn(),
  isAvailable: vi.fn().mockResolvedValue(true),
} as unknown as LLMAdapter;

const mockConfig = {
  getDefaultProvider: vi.fn().mockReturnValue('openai'),
  getApiKey: vi.fn().mockResolvedValue('sk-mock'),
  setDefaultProvider: vi.fn(),
  getAllConfig: vi.fn().mockReturnValue({ defaultProvider: 'openai' }),
  getChatConfig: vi.fn().mockReturnValue({}),
  getSandboxConfig: vi.fn().mockReturnValue({}),
  getCircuitBreakerConfig: vi.fn().mockReturnValue({}),
  exists: vi.fn().mockResolvedValue(true),
  init: vi.fn().mockResolvedValue(undefined),
  setApiKey: vi.fn().mockResolvedValue(undefined),
  removeApiKey: vi.fn().mockResolvedValue(undefined),
} as unknown as ConfigAdapter;

function createContext(input: string, intent?: string): PipelineContext {
  return {
    taskId: 'task-001',
    input,
    intent,
    errors: [],
    metadata: {},
    createdFiles: [],
    modifiedFiles: [],
    phaseHistory: [],
    shouldConfirm: false,
  };
}

describe('PlanStage', () => {
  let stage: PlanStage;

  beforeEach(() => {
    resetEventBus();
    stage = new PlanStage(mockLLM, mockConfig);
  });

  afterEach(() => {
    resetEventBus();
  });

  describe('should generate plan for code intent', () => {
    it('should generate steps for code task', async () => {
      const ctx = createContext('write a function', 'code');

      const result = await stage.execute(ctx);

      expect(result.plan).toBeDefined();
      expect(result.plan!.length).toBeGreaterThan(0);
    });

    it('should include analyze, generate, write, test steps', async () => {
      const ctx = createContext('refactor module', 'code');

      const result = await stage.execute(ctx);

      const descriptions = result.plan!.map((s) => s.description);
      expect(descriptions).toContain('Analyze target code or requirements');
      expect(descriptions).toContain('Generate the code implementation');
      expect(descriptions).toContain('Write the implementation to a file');
      expect(descriptions).toContain('Run the project tests');
    });
  });

  describe('should generate plan for chat intent', () => {
    it('should generate single step for chat', async () => {
      const ctx = createContext('hello', 'chat');

      const result = await stage.execute(ctx);

      expect(result.plan).toBeDefined();
      expect(result.plan!.length).toBe(1);
      expect(result.plan![0].description).toBe('Generate conversational response');
    });
  });

  describe('should generate plan for file-op intent', () => {
    it('should generate steps for file operations', async () => {
      const ctx = createContext('create a file', 'file-op');

      const result = await stage.execute(ctx);

      expect(result.plan).toBeDefined();
      expect(result.plan!.length).toBe(3);
    });

    it('should include generate, writeFile, readFile steps', async () => {
      const ctx = createContext('read a config file', 'file-op');

      const result = await stage.execute(ctx);

      const descriptions = result.plan!.map((s) => s.description);
      expect(descriptions).toContain('Generate the file content');
      expect(descriptions).toContain('Write content to the target file');
      expect(descriptions).toContain('Verify the file was created');
    });
  });

  describe('should generate plan for search intent', () => {
    it('should generate single step for search', async () => {
      const ctx = createContext('search for files', 'search');

      const result = await stage.execute(ctx);

      expect(result.plan).toBeDefined();
      expect(result.plan!.length).toBe(1);
      expect(result.plan![0].description).toBe('Search memory and project files for the query');
    });
  });

  describe('each step should have required fields (id, description, status)', () => {
    it('should have id, description, status, dependencies for each step', async () => {
      const ctx = createContext('write code', 'code');

      const result = await stage.execute(ctx);

      for (const step of result.plan!) {
        expect(step).toHaveProperty('id');
        expect(typeof step.id).toBe('string');
        expect(step.id.length).toBeGreaterThan(0);

        expect(step).toHaveProperty('description');
        expect(typeof step.description).toBe('string');

        expect(step).toHaveProperty('status');
        expect(step.status).toBe('pending');

        expect(step).toHaveProperty('dependencies');
        expect(Array.isArray(step.dependencies)).toBe(true);
      }
    });

    it('should have unique ids across all steps', async () => {
      const ctx = createContext('write code', 'code');

      const result = await stage.execute(ctx);

      const ids = result.plan!.map((s) => s.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });
  });

  describe('should set plan in context', () => {
    it('should set plan array in context', async () => {
      const ctx = createContext('test', 'general');

      const result = await stage.execute(ctx);

      expect(result.plan).toBeDefined();
      expect(Array.isArray(result.plan)).toBe(true);
      expect(result.plan!.length).toBeGreaterThan(0);
    });

    it('should fallback to general plan for missing intent', async () => {
      const ctx = createContext('some task');
      delete ctx.intent;

      const result = await stage.execute(ctx);

      expect(result.plan).toBeDefined();
      expect(result.plan!.length).toBeGreaterThan(0);
    });

    it('should fallback to general plan for unknown intent', async () => {
      const ctx = createContext('some task', 'unknown_intent');

      const result = await stage.execute(ctx);

      expect(result.plan).toBeDefined();
      expect(result.plan!.length).toBeGreaterThan(0);
    });
  });
});