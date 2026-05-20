import { describe, it, expect } from 'vitest';
import {
  ProviderConfigSchema,
  ChatConfigSchema,
  MemoryConfigSchema,
  SandboxConfigSchema,
  ConfigSchema,
  ProviderTypeSchema
} from './schemas.js';
import { validateConfig, validatePartialConfig } from './validation.js';

describe('ProviderTypeSchema', () => {
  it('should validate valid provider types', () => {
    const validProviders = [
      'openai', 'anthropic', 'google', 'aliyun', 'siliconflow',
      'zhipu', 'baidu', 'deepseek', 'ollama', 'lmstudio'
    ];
    validProviders.forEach(provider => {
      const result = ProviderTypeSchema.safeParse(provider);
      expect(result.success).toBe(true);
    });
  });

  it('should reject invalid provider types', () => {
    const result = ProviderTypeSchema.safeParse('invalid-provider');
    expect(result.success).toBe(false);
  });
});

describe('ProviderConfigSchema', () => {
  it('should validate valid provider config', () => {
    const result = ProviderConfigSchema.safeParse({
      apiKey: 'test-key',
      timeout: 60000
    });
    expect(result.success).toBe(true);
  });

  it('should reject invalid timeout (too low)', () => {
    const result = ProviderConfigSchema.safeParse({
      timeout: 50
    });
    expect(result.success).toBe(false);
  });

  it('should reject invalid timeout (too high)', () => {
    const result = ProviderConfigSchema.safeParse({
      timeout: 400000
    });
    expect(result.success).toBe(false);
  });

  it('should reject invalid maxRetries (negative)', () => {
    const result = ProviderConfigSchema.safeParse({
      maxRetries: -1
    });
    expect(result.success).toBe(false);
  });

  it('should reject invalid maxRetries (too high)', () => {
    const result = ProviderConfigSchema.safeParse({
      maxRetries: 15
    });
    expect(result.success).toBe(false);
  });

  it('should reject invalid URL', () => {
    const result = ProviderConfigSchema.safeParse({
      baseUrl: 'not-a-valid-url'
    });
    expect(result.success).toBe(false);
  });

  it('should accept valid URL', () => {
    const result = ProviderConfigSchema.safeParse({
      baseUrl: 'https://api.example.com'
    });
    expect(result.success).toBe(true);
  });

  it('should apply default values', () => {
    const result = ProviderConfigSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.timeout).toBe(60000);
      expect(result.data.maxRetries).toBe(2);
    }
  });
});

describe('ChatConfigSchema', () => {
  it('should validate valid chat config', () => {
    const result = ChatConfigSchema.safeParse({
      defaultTemperature: 0.5,
      defaultMaxTokens: 2000,
      saveHistory: false,
      historyLimit: 50
    });
    expect(result.success).toBe(true);
  });

  it('should reject invalid temperature (too high)', () => {
    const result = ChatConfigSchema.safeParse({
      defaultTemperature: 3.0
    });
    expect(result.success).toBe(false);
  });

  it('should reject invalid temperature (negative)', () => {
    const result = ChatConfigSchema.safeParse({
      defaultTemperature: -0.5
    });
    expect(result.success).toBe(false);
  });

  it('should reject invalid maxTokens (too low)', () => {
    const result = ChatConfigSchema.safeParse({
      defaultMaxTokens: 50
    });
    expect(result.success).toBe(false);
  });

  it('should apply default values', () => {
    const result = ChatConfigSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.defaultTemperature).toBe(0.7);
      expect(result.data.defaultMaxTokens).toBe(4000);
      expect(result.data.saveHistory).toBe(true);
      expect(result.data.historyLimit).toBe(100);
    }
  });
});

describe('MemoryConfigSchema', () => {
  it('should validate valid memory config', () => {
    const result = MemoryConfigSchema.safeParse({
      enabled: true,
      maxMemories: 500
    });
    expect(result.success).toBe(true);
  });

  it('should reject invalid maxMemories (too low)', () => {
    const result = MemoryConfigSchema.safeParse({
      maxMemories: 5
    });
    expect(result.success).toBe(false);
  });

  it('should reject invalid maxMemories (too high)', () => {
    const result = MemoryConfigSchema.safeParse({
      maxMemories: 50000
    });
    expect(result.success).toBe(false);
  });

  it('should apply default values', () => {
    const result = MemoryConfigSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.enabled).toBe(true);
      expect(result.data.maxMemories).toBe(1000);
    }
  });
});

describe('SandboxConfigSchema', () => {
  it('should validate valid sandbox levels', () => {
    const levels = ['minimal', 'conservative', 'balanced', 'relaxed', 'extreme'];
    levels.forEach(level => {
      const result = SandboxConfigSchema.safeParse({ level });
      expect(result.success).toBe(true);
    });
  });

  it('should reject invalid sandbox level', () => {
    const result = SandboxConfigSchema.safeParse({
      level: 'invalid-level'
    });
    expect(result.success).toBe(false);
  });

  it('should apply default level', () => {
    const result = SandboxConfigSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.level).toBe('balanced');
    }
  });
});

describe('ConfigSchema', () => {
  it('should validate complete config', () => {
    const result = ConfigSchema.safeParse({
      version: '1.0',
      defaultProvider: 'openai',
      providers: {
        openai: {
          apiKey: 'test-key',
          timeout: 30000
        }
      },
      chat: {
        defaultTemperature: 0.8
      },
      memory: {
        enabled: true
      },
      sandbox: {
        level: 'balanced'
      }
    });
    expect(result.success).toBe(true);
  });

  it('should validate minimal config with defaults', () => {
    const result = ConfigSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.version).toBe('1.0');
      expect(result.data.providers).toEqual({});
      expect(result.data.chat.defaultTemperature).toBe(0.7);
    }
  });

  it('should reject invalid nested config', () => {
    const result = ConfigSchema.safeParse({
      chat: {
        defaultTemperature: 5.0
      }
    });
    expect(result.success).toBe(false);
  });
});

describe('validateConfig', () => {
  it('should return valid result for correct config', () => {
    const config = {
      defaultProvider: 'openai' as const,
      providers: {
        openai: { apiKey: 'test' }
      }
    };
    const result = validateConfig(config);
    expect(result.valid).toBe(true);
    expect(result.config).toBeDefined();
  });

  it('should return errors for invalid config', () => {
    const config = {
      chat: {
        defaultTemperature: 5.0
      }
    };
    const result = validateConfig(config);
    expect(result.valid).toBe(false);
    expect(result.errors).toBeDefined();
    expect((result.errors ?? []).length).toBeGreaterThan(0);
  });

  it('should include path in error messages', () => {
    const config = {
      chat: {
        defaultTemperature: 5.0
      }
    };
    const result = validateConfig(config);
    expect(result.valid).toBe(false);
    if (result.errors) {
      expect(result.errors[0].path).toContain('chat');
    }
  });
});

describe('validatePartialConfig', () => {
  it('should validate partial config', () => {
    const result = validatePartialConfig({
      chat: {
        defaultTemperature: 0.5
      }
    });
    expect(result.success).toBe(true);
  });

  it('should allow empty partial config', () => {
    const result = validatePartialConfig({});
    expect(result.success).toBe(true);
  });
});
