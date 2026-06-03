import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const baseMockKeytar = {
  setPassword: vi.fn().mockResolvedValue(undefined),
  getPassword: vi.fn(),
  deletePassword: vi.fn().mockResolvedValue(true),
  findCredentials: vi.fn(),
};

describe('SecretStorage', () => {
  let SecretStorage: {
    SecretStorage: typeof import('../../../infrastructure/secret-storage.js').SecretStorage;
    SERVICE_NAME: string;
  };

  let storeKey: (service: string, account: string, key: string) => Promise<void>;
  let getKey: (service: string, account: string) => Promise<string | null>;
  let deleteKey: (service: string, account: string) => Promise<void>;
  let findCredentials: (
    service: string
  ) => Promise<Array<{ account: string; password: string }>>;
  let SERVICE_NAME: string;

  describe('with keytar available', () => {
    beforeEach(async () => {
      vi.doMock('keytar', () => baseMockKeytar);
      vi.resetModules();
      const mod = await import('../../../infrastructure/secret-storage.js');
      SecretStorage = mod;
      storeKey = mod.SecretStorage.storeKey.bind(mod.SecretStorage);
      getKey = mod.SecretStorage.getKey.bind(mod.SecretStorage);
      deleteKey = mod.SecretStorage.deleteKey.bind(mod.SecretStorage);
      findCredentials = mod.SecretStorage.findCredentials.bind(mod.SecretStorage);
      SERVICE_NAME = mod.SERVICE_NAME;
      vi.clearAllMocks();
    });

    afterEach(() => {
      vi.clearAllMocks();
    });

    it('storeKey should store when keytar is available', async () => {
      await storeKey('my-service', 'my-account', 'my-secret-key');

      expect(baseMockKeytar.setPassword).toHaveBeenCalledTimes(1);
      expect(baseMockKeytar.setPassword).toHaveBeenCalledWith(
        'my-service',
        'my-account',
        'my-secret-key'
      );
    });

    it('getKey should return stored key from keytar', async () => {
      baseMockKeytar.getPassword.mockResolvedValue('retrieved-key');

      const result = await getKey('my-service', 'my-account');

      expect(result).toBe('retrieved-key');
      expect(baseMockKeytar.getPassword).toHaveBeenCalledWith(
        'my-service',
        'my-account'
      );
    });

    it('getKey should return null when keytar returns null', async () => {
      baseMockKeytar.getPassword.mockResolvedValue(null);

      const result = await getKey('my-service', 'unknown-account');

      expect(result).toBeNull();
      expect(baseMockKeytar.getPassword).toHaveBeenCalledWith(
        'my-service',
        'unknown-account'
      );
    });

    it('deleteKey should delete from keytar', async () => {
      await deleteKey('my-service', 'my-account');

      expect(baseMockKeytar.deletePassword).toHaveBeenCalledTimes(1);
      expect(baseMockKeytar.deletePassword).toHaveBeenCalledWith(
        'my-service',
        'my-account'
      );
    });

    it('findCredentials should return credentials from keytar', async () => {
      const mockCredentials = [
        { account: 'openai', password: 'sk-test-123' },
        { account: 'anthropic', password: 'sk-ant-test-456' },
      ];
      baseMockKeytar.findCredentials.mockResolvedValue(mockCredentials);

      const result = await findCredentials('personal-assistant');

      expect(result).toEqual(mockCredentials);
      expect(baseMockKeytar.findCredentials).toHaveBeenCalledWith(
        'personal-assistant'
      );
    });

    it('storeProviderKey should use SERVICE_NAME', async () => {
      const storage = new SecretStorage.SecretStorage();

      await storage.storeProviderKey('openai', 'sk-api-key');

      expect(baseMockKeytar.setPassword).toHaveBeenCalledWith(
        SERVICE_NAME,
        'openai',
        'sk-api-key'
      );
    });

    it('getProviderKey should use SERVICE_NAME', async () => {
      baseMockKeytar.getPassword.mockResolvedValue('sk-api-key');
      const storage = new SecretStorage.SecretStorage();

      const result = await storage.getProviderKey('openai');

      expect(result).toBe('sk-api-key');
      expect(baseMockKeytar.getPassword).toHaveBeenCalledWith(
        SERVICE_NAME,
        'openai'
      );
    });

    it('deleteProviderKey should use SERVICE_NAME', async () => {
      const storage = new SecretStorage.SecretStorage();

      await storage.deleteProviderKey('anthropic');

      expect(baseMockKeytar.deletePassword).toHaveBeenCalledWith(
        SERVICE_NAME,
        'anthropic'
      );
    });

    it('listProviders should return provider names', async () => {
      const mockCredentials = [
        { account: 'openai', password: 'sk-test-1' },
        { account: 'anthropic', password: 'sk-test-2' },
        { account: 'google', password: 'sk-test-3' },
      ];
      baseMockKeytar.findCredentials.mockResolvedValue(mockCredentials);
      const storage = new SecretStorage.SecretStorage();

      const result = await storage.listProviders();

      expect(result).toEqual(['openai', 'anthropic', 'google']);
      expect(baseMockKeytar.findCredentials).toHaveBeenCalledWith(SERVICE_NAME);
    });

    it('listProviders should return empty array when no credentials', async () => {
      baseMockKeytar.findCredentials.mockResolvedValue([]);
      const storage = new SecretStorage.SecretStorage();

      const result = await storage.listProviders();

      expect(result).toEqual([]);
    });

    it('should not re-import keytar on subsequent calls', async () => {
      await storeKey('svc', 'acc', 'key1');

      vi.doMock('keytar', () => {
        throw new Error('should not re-import');
      });

      baseMockKeytar.getPassword.mockResolvedValue('cached-result');

      const result = await getKey('svc', 'acc');

      expect(result).toBe('cached-result');
    });
  });

  describe('with keytar unavailable', () => {
    beforeEach(async () => {
      vi.doMock('keytar', () => {
        throw new Error('Cannot find module keytar');
      });
      vi.resetModules();
      const mod = await import('../../../infrastructure/secret-storage.js');
      SecretStorage = mod;
      storeKey = mod.SecretStorage.storeKey.bind(mod.SecretStorage);
      getKey = mod.SecretStorage.getKey.bind(mod.SecretStorage);
      deleteKey = mod.SecretStorage.deleteKey.bind(mod.SecretStorage);
      findCredentials = mod.SecretStorage.findCredentials.bind(mod.SecretStorage);
      SERVICE_NAME = mod.SERVICE_NAME;
      vi.clearAllMocks();
    });

    afterEach(() => {
      vi.clearAllMocks();
      for (const key of Object.keys(process.env)) {
        if (key.startsWith('PERSONAL_ASSISTANT_')) {
          delete process.env[key];
        }
      }
    });

    it('storeKey should throw with actionable error when keytar unavailable', async () => {
      await expect(
        storeKey('my-service', 'my-account', 'my-key'),
      ).rejects.toThrow(/MY_SERVICE_MY_ACCOUNT/);
      expect(baseMockKeytar.setPassword).not.toHaveBeenCalled();
    });

    it('getKey should fall back to environment variable when keytar unavailable', async () => {
      process.env.MY_SERVICE_MY_ACCOUNT = 'env-key-value';

      const result = await getKey('my-service', 'my-account');

      expect(result).toBe('env-key-value');
    });

    it('getKey should return null when env var not set', async () => {
      const result = await getKey('my-service', 'nonexistent');

      expect(result).toBeNull();
    });

    it('deleteKey should not throw when keytar unavailable', async () => {
      await expect(deleteKey('my-service', 'my-account')).resolves.toBeUndefined();
    });

    it('findCredentials should return empty array when keytar unavailable', async () => {
      const result = await findCredentials('personal-assistant');

      expect(result).toEqual([]);
    });

    it('storeProviderKey should reject with env-var hint when keytar unavailable', async () => {
      const storage = new SecretStorage.SecretStorage();

      await expect(
        storage.storeProviderKey('openai', 'sk-key'),
      ).rejects.toThrow(/PERSONAL_ASSISTANT_OPENAI/);
      expect(baseMockKeytar.setPassword).not.toHaveBeenCalled();
    });

    it('getProviderKey should use SERVICE_NAME with env fallback', async () => {
      process.env.PERSONAL_ASSISTANT_OPENAI = 'sk-env-test';
      const storage = new SecretStorage.SecretStorage();

      const result = await storage.getProviderKey('openai');

      expect(result).toBe('sk-env-test');
    });

    it('deleteProviderKey should use SERVICE_NAME and not throw', async () => {
      const storage = new SecretStorage.SecretStorage();

      await expect(storage.deleteProviderKey('openai')).resolves.toBeUndefined();
    });

    it('listProviders should return empty when keytar unavailable', async () => {
      const storage = new SecretStorage.SecretStorage();

      const result = await storage.listProviders();

      expect(result).toEqual([]);
    });

    it('env fallback should convert SERVICE_NAME + account to env var name', async () => {
      process.env.PERSONAL_ASSISTANT_OPENAI = 'sk-from-env';
      process.env.PERSONAL_ASSISTANT_ANTHROPIC = 'sk-ant-from-env';

      const openaiKey = await getKey(SERVICE_NAME, 'openai');
      const anthropicKey = await getKey(SERVICE_NAME, 'anthropic');

      expect(openaiKey).toBe('sk-from-env');
      expect(anthropicKey).toBe('sk-ant-from-env');
    });

    it('env fallback should handle hyphenated account names', async () => {
      process.env.PERSONAL_ASSISTANT_AZURE_OPENAI = 'sk-azure-key';

      const result = await getKey(SERVICE_NAME, 'azure-openai');

      expect(result).toBe('sk-azure-key');
    });

    it('env fallback should strip non-alphanumeric characters', async () => {
      process.env.PERSONAL_ASSISTANT_MY_PROVIDER = 'sk-key';

      const result = await getKey(SERVICE_NAME, 'my-provider');

      expect(result).toBe('sk-key');
    });
  });
});