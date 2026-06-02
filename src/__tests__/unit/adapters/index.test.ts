import { describe, it, expect, beforeEach, vi } from 'vitest';

const mockStore: Record<string, unknown> = {};

const mockConfInstance = {
  get store() {
    return { ...mockStore };
  },
  set store(val: Record<string, unknown>) {
    Object.assign(mockStore, val);
  },
  get: vi.fn((key: string) => mockStore[key]),
  set: vi.fn((key: string, value: unknown) => {
    mockStore[key] = value;
  }),
  clear: vi.fn(() => {
    Object.keys(mockStore).forEach((k) => delete mockStore[k]);
  }),
  get path() {
    return '/mock/home/.config/personal-assistant/config.json';
  },
};

vi.mock('conf', () => ({
  default: vi.fn(() => mockConfInstance),
}));

import {
  createAdapters,
  createConfigAdapter,
  createLLMAdapter,
  createStorageAdapter,
  createMemoryAdapter,
  createGitAdapter,
  ConfigAdapter,
  LLMAdapter,
  StorageAdapter,
  MemoryAdapter,
  GitAdapter,
} from '../../../adapters/index.js';

describe('Adapter Factory Functions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.keys(mockStore).forEach((k) => delete mockStore[k]);
  });

  describe('createAdapters', () => {
    it('should return all adapters', () => {
      const adapters = createAdapters();

      expect(adapters.config).toBeDefined();
      expect(adapters.llm).toBeDefined();
      expect(adapters.storage).toBeDefined();
      expect(adapters.memory).toBeDefined();
      expect(adapters.git).toBeDefined();
    });

    it('should wire config into LLM adapter', () => {
      const adapters = createAdapters();

      expect(adapters.llm).toBeInstanceOf(LLMAdapter);
      expect(adapters.config).toBeInstanceOf(ConfigAdapter);
    });
  });

  describe('createConfigAdapter', () => {
    it('should return ConfigAdapter', () => {
      const config = createConfigAdapter();

      expect(config).toBeInstanceOf(ConfigAdapter);
      expect(config).toBeDefined();
    });
  });

  describe('createLLMAdapter', () => {
    it('should accept config adapter', () => {
      const config = createConfigAdapter();
      const llm = createLLMAdapter(config);

      expect(llm).toBeInstanceOf(LLMAdapter);
      expect(llm).toBeDefined();
    });
  });

  describe('createStorageAdapter', () => {
    it('should return StorageAdapter', () => {
      const storage = createStorageAdapter();

      expect(storage).toBeInstanceOf(StorageAdapter);
      expect(storage).toBeDefined();
    });
  });

  describe('createMemoryAdapter', () => {
    it('should return MemoryAdapter', () => {
      const memory = createMemoryAdapter();

      expect(memory).toBeInstanceOf(MemoryAdapter);
      expect(memory).toBeDefined();
    });
  });

  describe('createGitAdapter', () => {
    it('should return GitAdapter with cwd', () => {
      const git = createGitAdapter();

      expect(git).toBeInstanceOf(GitAdapter);
      expect(git).toBeDefined();
    });
  });
});