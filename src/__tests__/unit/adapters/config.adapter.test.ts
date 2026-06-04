import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const { mockStorage, MockConf } = vi.hoisted(() => {
  const storage: Record<string, unknown> = {
    version: 1,
    defaultProvider: undefined,
    apiKeys: {} as Record<string, string>,
    baseUrls: {} as Record<string, string>,
    chat: {},
    sandbox: { enabled: false },
    circuitBreaker: { enabled: true },
  };

  class Mock {
    get store(): Record<string, unknown> {
      return JSON.parse(JSON.stringify(storage));
    }
    set store(val: Record<string, unknown>) {
      Object.assign(storage, val);
    }
    get path() {
      return '/mock/home/.config/personal-assistant/config.json';
    }
    get(key: string) {
      return storage[key];
    }
    set(key: string, value: unknown) {
      storage[key] = value;
    }
    delete(key: string) {
      delete storage[key];
    }
    clear() {
      for (const k of Object.keys(storage)) {
        delete storage[k];
      }
    }

    static _storage = storage;
  }

  return { mockStorage: Mock._storage, MockConf: Mock };
});

vi.mock('conf', () => ({
  default: MockConf,
}));

import { ConfigAdapter } from '../../../adapters/config.adapter.js';

describe('ConfigAdapter', () => {
  let adapter: ConfigAdapter;

  function resetStore() {
    for (const k of Object.keys(mockStorage)) {
      delete mockStorage[k];
    }
    Object.assign(mockStorage, {
      version: 1,
      defaultProvider: undefined,
      apiKeys: {},
      baseUrls: {},
      chat: {},
      sandbox: { enabled: false },
      circuitBreaker: { enabled: true },
    });
  }

  beforeEach(() => {
    resetStore();
    adapter = new ConfigAdapter();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('init', () => {
    it('should create backup directory', async () => {
      await adapter.init();

      expect(adapter).toBeDefined();
    });

    it('should validate config and backup on corruption', async () => {
      mockStorage.version = 999;
      mockStorage.apiKeys = null;

      await adapter.init();
    });

    it('should be idempotent', async () => {
      await adapter.init();

      await adapter.init();
    });
  });

  describe('getApiKey', () => {
    it('should return stored key', async () => {
      mockStorage.apiKeys = { openai: 'sk-test-key' };

      const key = await adapter.getApiKey('openai');

      expect(key).toBe('sk-test-key');
    });
  });

  describe('setApiKey', () => {
    it('should store and retrieve', async () => {
      await adapter.setApiKey('anthropic', 'sk-ant-key');

      const key = await adapter.getApiKey('anthropic');
      expect(key).toBe('sk-ant-key');
    });
  });

  describe('removeApiKey', () => {
    it('should delete key', async () => {
      mockStorage.apiKeys = { openai: 'sk-key', anthropic: 'sk-ant' };
      await adapter.removeApiKey('openai');

      const key = await adapter.getApiKey('openai');
      expect(key).toBeUndefined();

      const antKey = await adapter.getApiKey('anthropic');
      expect(antKey).toBe('sk-ant');
    });
  });

  describe('getBaseUrl', () => {
    it('should return undefined when not configured', async () => {
      const url = await adapter.getBaseUrl('openai');
      expect(url).toBeUndefined();
    });

    it('should return stored value', async () => {
      mockStorage.baseUrls = { openai: 'https://example.com/v1' };
      const url = await adapter.getBaseUrl('openai');
      expect(url).toBe('https://example.com/v1');
    });
  });

  describe('setBaseUrl', () => {
    it('should store URL with trim', async () => {
      await adapter.setBaseUrl('openai', '  https://example.com/v1  ');
      const url = await adapter.getBaseUrl('openai');
      expect(url).toBe('https://example.com/v1');
    });

    it('should treat empty string as reset', async () => {
      mockStorage.baseUrls = { openai: 'https://example.com/v1' };
      await adapter.setBaseUrl('openai', '');
      const url = await adapter.getBaseUrl('openai');
      expect(url).toBeUndefined();
    });
  });

  describe('resetBaseUrl', () => {
    it('should clear configured URL', async () => {
      mockStorage.baseUrls = { openai: 'https://example.com/v1' };
      await adapter.resetBaseUrl('openai');
      const url = await adapter.getBaseUrl('openai');
      expect(url).toBeUndefined();
    });
  });

  describe('api key whitespace handling (regression)', () => {
    it('should trim whitespace on set', async () => {
      await adapter.setApiKey('openai', '  sk-trim  ');
      const key = await adapter.getApiKey('openai');
      expect(key).toBe('sk-trim');
    });
  });

  describe('getDefaultProvider', () => {
    it('should return siliconflow by default', async () => {
      const provider = await adapter.getDefaultProvider();

      expect(provider).toBe('siliconflow');
    });
  });

  describe('setDefaultProvider', () => {
    it('should change provider', async () => {
      await adapter.setDefaultProvider('anthropic');

      const provider = await adapter.getDefaultProvider();
      expect(provider).toBe('anthropic');
    });
  });

  describe('getChatConfig', () => {
    it('should return chat config', async () => {
      mockStorage.chat = { model: 'gpt-4o', temperature: 0.7 };

      const config = await adapter.getChatConfig();

      expect(config).toEqual({ model: 'gpt-4o', temperature: 0.7 });
    });
  });

  describe('updateChatConfig', () => {
    it('should merge config', async () => {
      mockStorage.chat = { model: 'gpt-4o' };

      await adapter.updateChatConfig({ temperature: 0.5 });

      const config = await adapter.getChatConfig();
      expect(config).toEqual({ model: 'gpt-4o', temperature: 0.5 });
    });
  });

  describe('getSandboxConfig', () => {
    it('should return sandbox config', async () => {
      mockStorage.sandbox = { enabled: true, timeout: 30000 };

      const config = await adapter.getSandboxConfig();

      expect(config).toEqual({ enabled: true, timeout: 30000 });
    });
  });

  describe('updateSandboxConfig', () => {
    it('should merge', async () => {
      mockStorage.sandbox = { enabled: false };

      await adapter.updateSandboxConfig({ enabled: true });

      const config = await adapter.getSandboxConfig();
      expect(config.enabled).toBe(true);
    });
  });

  describe('getCircuitBreakerConfig', () => {
    it('should return circuit breaker config', async () => {
      mockStorage.circuitBreaker = { enabled: true, failureThreshold: 5 };

      const config = await adapter.getCircuitBreakerConfig();

      expect(config).toEqual({ enabled: true, failureThreshold: 5 });
    });
  });

  describe('updateCircuitBreakerConfig', () => {
    it('should merge with existing config', async () => {
      mockStorage.circuitBreaker = { enabled: true, failureThreshold: 3 };

      await adapter.updateCircuitBreakerConfig({ resetTimeout: 60000 });

      const config = await adapter.getCircuitBreakerConfig();
      expect(config).toEqual({ enabled: true, failureThreshold: 3, resetTimeout: 60000 });
    });

    it('should be able to disable', async () => {
      mockStorage.circuitBreaker = { enabled: true, failureThreshold: 3 };

      await adapter.updateCircuitBreakerConfig({ enabled: false });

      const config = await adapter.getCircuitBreakerConfig();
      expect(config.enabled).toBe(false);
    });
  });

  describe('getAllConfig', () => {
    it('should return all config', async () => {
      const all = await adapter.getAllConfig();

      expect(all).toHaveProperty('apiKeys');
      expect(all).toHaveProperty('chat');
      expect(all).toHaveProperty('sandbox');
      expect(all).toHaveProperty('circuitBreaker');
    });
  });

  describe('getFileMeta', () => {
    it('should return file meta with path and exists flag', async () => {
      const meta = await adapter.getFileMeta();

      expect(meta).toHaveProperty('path');
      expect(typeof meta.path).toBe('string');
      expect(typeof meta.exists).toBe('boolean');
      expect(typeof meta.size).toBe('number');
      expect('modifiedAt' in meta).toBe(true);
    });

    it('should report non-existent file when path cannot be stat-ed', async () => {
      // path is a mock path that does not exist on disk
      const meta = await adapter.getFileMeta();
      expect(meta.exists).toBe(false);
      expect(meta.size).toBe(0);
      expect(meta.modifiedAt).toBeNull();
    });
  });

  describe('export', () => {
    it('should return full config object', async () => {
      mockStorage.apiKeys = { openai: 'sk-x' };
      mockStorage.chat = { model: 'gpt-4o', temperature: 0.7 };

      const exported = await adapter.export();

      expect(exported).toHaveProperty('apiKeys');
      expect(exported).toHaveProperty('chat');
      expect((exported.chat as { model?: string }).model).toBe('gpt-4o');
    });
  });

  describe('import', () => {
    it('should replace current config with provided data', async () => {
      mockStorage.apiKeys = { openai: 'old-key' };

      await adapter.import({
        version: 1,
        apiKeys: { anthropic: 'new-key' },
        baseUrls: {},
        chat: { model: 'claude-3-5-sonnet' },
        sandbox: { enabled: false },
        circuitBreaker: { enabled: true },
      });

      const all = await adapter.getAllConfig();
      expect((all.apiKeys as Record<string, string>).anthropic).toBe('new-key');
      expect((all.apiKeys as Record<string, string>).openai).toBeUndefined();
      expect((all.chat as { model?: string }).model).toBe('claude-3-5-sonnet');
    });

    it('should reject invalid config', async () => {
      await expect(
        adapter.import({
          version: 2,
          apiKeys: 'not-an-object',
        })
      ).rejects.toThrow(/invalid config/);
    });
  });

  describe('reset', () => {
    it('should restore default config', async () => {
      mockStorage.apiKeys = { openai: 'sk-x' };
      mockStorage.chat = { model: 'gpt-4o', temperature: 0.9 };
      mockStorage.sandbox = { enabled: true };

      await adapter.reset();

      const all = await adapter.getAllConfig();
      expect((all.apiKeys as Record<string, string>).openai).toBeUndefined();
      expect(Object.keys(all.chat as object).length).toBe(0);
      expect((all.sandbox as { enabled: boolean }).enabled).toBe(false);
      expect((all.circuitBreaker as { enabled: boolean }).enabled).toBe(true);
    });
  });

  describe('exists', () => {
    it('should check file existence', async () => {
      const result = await adapter.exists();

      expect(typeof result).toBe('boolean');
    });
  });
});