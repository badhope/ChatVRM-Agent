import Conf from 'conf';
import type { Options as ConfOptions } from 'conf';
import { z } from 'zod';
import { homedir } from 'os';
import path from 'path';
import fs from 'fs/promises';
import type {
  IConfigPort,
  ProviderType,
  ChatConfig,
  SandboxConfig,
  CircuitBreakerConfig,
  ConfigFileMeta,
} from '../ports/config.port.js';

const ApiKeysSchema = z.record(z.string());
const BaseUrlsSchema = z.record(z.string().url().or(z.literal('')));
const ChatConfigSchema = z.object({
  model: z.string().optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().min(1).optional(),
  topP: z.number().min(0).max(1).optional(),
  presencePenalty: z.number().min(-2).max(2).optional(),
  frequencyPenalty: z.number().min(-2).max(2).optional(),
  systemPrompt: z.string().optional(),
  fallbackModels: z.array(z.string()).max(10).optional(),
});
const SandboxConfigSchema = z.object({
  enabled: z.boolean(),
  allowedCommands: z.array(z.string()).optional(),
  timeout: z.number().positive().optional(),
  workingDirectory: z.string().optional(),
});
const CircuitBreakerConfigSchema = z.object({
  enabled: z.boolean(),
  failureThreshold: z.number().positive().optional(),
  resetTimeout: z.number().positive().optional(),
  halfOpenMaxCalls: z.number().positive().optional(),
});

const FullConfigSchema = z.object({
  version: z.literal(1),
  defaultProvider: z.string().optional(),
  apiKeys: ApiKeysSchema,
  baseUrls: BaseUrlsSchema,
  chat: ChatConfigSchema,
  sandbox: SandboxConfigSchema,
  circuitBreaker: CircuitBreakerConfigSchema,
});

type FullConfig = z.infer<typeof FullConfigSchema>;

const DEFAULT_CONFIG: FullConfig = {
  version: 1,
  defaultProvider: undefined,
  apiKeys: {},
  baseUrls: {},
  chat: {},
  sandbox: {
    enabled: false,
  },
  circuitBreaker: {
    enabled: true,
  },
};

const CONFIG_DIR = path.join(homedir(), '.personal-assistant');
const CONFIG_BACKUP_DIR = path.join(CONFIG_DIR, 'backups');

const JSON_SCHEMA_FOR_CONF = {
  version: { type: 'number', minimum: 1, maximum: 1 },
  defaultProvider: { type: ['string', 'null'] },
  apiKeys: {
    type: 'object',
    additionalProperties: { type: 'string' },
  },
  baseUrls: {
    type: 'object',
    additionalProperties: { type: 'string' },
  },
  chat: {
    type: 'object',
    properties: {
      model: { type: ['string', 'null'] },
      temperature: { type: ['number', 'null'], minimum: 0, maximum: 2 },
      maxTokens: { type: ['number', 'null'], minimum: 1 },
      topP: { type: ['number', 'null'], minimum: 0, maximum: 1 },
      presencePenalty: { type: ['number', 'null'], minimum: -2, maximum: 2 },
      frequencyPenalty: { type: ['number', 'null'], minimum: -2, maximum: 2 },
      systemPrompt: { type: ['string', 'null'] },
      fallbackModels: { type: 'array', items: { type: 'string' }, maxItems: 10 },
    },
    additionalProperties: false,
  },
  sandbox: {
    type: 'object',
    properties: {
      enabled: { type: 'boolean' },
      allowedCommands: { type: 'array', items: { type: 'string' } },
      timeout: { type: 'number', exclusiveMinimum: 0 },
      workingDirectory: { type: ['string', 'null'] },
    },
    required: ['enabled'],
    additionalProperties: false,
  },
  circuitBreaker: {
    type: 'object',
    properties: {
      enabled: { type: 'boolean' },
      failureThreshold: { type: 'number', exclusiveMinimum: 0 },
      resetTimeout: { type: 'number', exclusiveMinimum: 0 },
      halfOpenMaxCalls: { type: 'number', exclusiveMinimum: 0 },
    },
    required: ['enabled'],
    additionalProperties: false,
  },
} as const;

export class ConfigAdapter implements IConfigPort {
  private store: Conf<FullConfig>;
  private initialized = false;

  constructor() {
    this.store = new Conf<FullConfig>({
      projectName: 'personal-assistant',
      schema: JSON_SCHEMA_FOR_CONF as unknown as Record<string, unknown>,
      defaults: DEFAULT_CONFIG as unknown as Record<string, unknown>,
      configFileMode: 0o600,
      clearInvalidConfig: true,
    } as ConfOptions<FullConfig>);
  }

  async init(): Promise<void> {
    if (this.initialized) return;

    await fs.mkdir(CONFIG_BACKUP_DIR, { recursive: true });

    try {
      const raw = this.store.store;
      const parsed = FullConfigSchema.safeParse(raw);
      if (!parsed.success) {
        await this.backupAndRestore(raw);
      }
    } catch {
      await this.backupAndRestore(this.store.store);
    }

    this.initialized = true;
  }

  async getApiKey(provider: ProviderType): Promise<string | undefined> {
    const config = this.getValidatedConfig();
    const key = config.apiKeys[provider];
    if (typeof key === 'string' && key.length > 0) return key.trim();
    return undefined;
  }

  async setApiKey(provider: ProviderType, key: string): Promise<void> {
    const config = this.getValidatedConfig();
    config.apiKeys[provider] = key.trim();
    this.store.set('apiKeys', config.apiKeys);
  }

  async removeApiKey(provider: ProviderType): Promise<void> {
    const config = this.getValidatedConfig();
    delete config.apiKeys[provider];
    this.store.set('apiKeys', config.apiKeys);
  }

  async getBaseUrl(provider: ProviderType): Promise<string | undefined> {
    const config = this.getValidatedConfig();
    const value = config.baseUrls[provider];
    if (typeof value === 'string' && value.length > 0) return value;
    return undefined;
  }

  async setBaseUrl(provider: ProviderType, baseUrl: string): Promise<void> {
    const config = this.getValidatedConfig();
    const trimmed = baseUrl.trim();
    if (trimmed.length === 0) {
      delete config.baseUrls[provider];
    } else {
      config.baseUrls[provider] = trimmed;
    }
    this.store.set('baseUrls', config.baseUrls);
  }

  async resetBaseUrl(provider: ProviderType): Promise<void> {
    const config = this.getValidatedConfig();
    delete config.baseUrls[provider];
    this.store.set('baseUrls', config.baseUrls);
  }

  async getDefaultProvider(): Promise<ProviderType> {
    const config = this.getValidatedConfig();
    return (config.defaultProvider as ProviderType) ?? 'siliconflow';
  }

  async setDefaultProvider(provider: ProviderType): Promise<void> {
    this.store.set('defaultProvider', provider);
  }

  async getChatConfig(): Promise<ChatConfig> {
    const config = this.getValidatedConfig();
    return config.chat;
  }

  async updateChatConfig(partial: Partial<ChatConfig>): Promise<void> {
    const current = this.store.get('chat') ?? {};
    this.store.set('chat', { ...current, ...partial });
  }

  async getSandboxConfig(): Promise<SandboxConfig> {
    const config = this.getValidatedConfig();
    return config.sandbox;
  }

  async updateSandboxConfig(partial: Partial<SandboxConfig>): Promise<void> {
    const current = this.store.get('sandbox') ?? { enabled: false };
    this.store.set('sandbox', { ...current, ...partial });
  }

  async getCircuitBreakerConfig(): Promise<CircuitBreakerConfig> {
    const config = this.getValidatedConfig();
    return config.circuitBreaker;
  }

  async updateCircuitBreakerConfig(partial: Partial<CircuitBreakerConfig>): Promise<void> {
    const current = this.store.get('circuitBreaker') ?? { enabled: true };
    this.store.set('circuitBreaker', { ...current, ...partial });
  }

  async getAllConfig(): Promise<Record<string, unknown>> {
    return this.store.store as Record<string, unknown>;
  }

  async exists(): Promise<boolean> {
    try {
      await fs.access(path.join(this.store.path));
      return true;
    } catch {
      return false;
    }
  }

  async getFileMeta(): Promise<ConfigFileMeta> {
    const filePath = this.store.path;
    try {
      const stat = await fs.stat(filePath);
      return {
        path: filePath,
        exists: true,
        size: stat.size,
        modifiedAt: stat.mtime.toISOString(),
      };
    } catch {
      return { path: filePath, exists: false, size: 0, modifiedAt: null };
    }
  }

  async export(): Promise<Record<string, unknown>> {
    await this.init();
    return this.getAllConfig();
  }

  async import(data: Record<string, unknown>): Promise<void> {
    await this.init();
    const merged = { ...DEFAULT_CONFIG, ...data };
    const parsed = FullConfigSchema.safeParse(merged);
    if (!parsed.success) {
      throw new Error(`invalid config: ${parsed.error.issues.map((i) => i.message).join('; ')}`);
    }
    // Backup current before replacing
    await this.backupCurrent();
    this.applyConfig(parsed.data);
  }

  async reset(): Promise<void> {
    await this.init();
    await this.backupCurrent();
    this.applyConfig(DEFAULT_CONFIG);
  }

  private applyConfig(cfg: FullConfig): void {
    this.store.clear();
    for (const [k, v] of Object.entries(cfg)) {
      if (v === undefined || v === null) {
        this.store.delete(k);
      } else {
        this.store.set(k, v);
      }
    }
  }

  private async backupCurrent(): Promise<void> {
    try {
      await fs.mkdir(CONFIG_BACKUP_DIR, { recursive: true, mode: 0o700 });
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupPath = path.join(CONFIG_BACKUP_DIR, `config-${timestamp}.json`);
      // Restrict to owner-only read/write. The config can contain API
      // keys, so leaving it world-readable on a shared box is a leak.
      await fs.writeFile(backupPath, JSON.stringify(this.store.store, null, 2), {
        encoding: 'utf-8',
        mode: 0o600,
      });
    } catch {
      // best-effort
    }
  }

  private getValidatedConfig(): FullConfig {
    const raw = this.store.store;
    const parsed = FullConfigSchema.safeParse(raw);
    if (parsed.success) {
      const cfg = parsed.data;
      if (!cfg.baseUrls) cfg.baseUrls = {};
      return cfg;
    }
    const fallback = JSON.parse(JSON.stringify(DEFAULT_CONFIG)) as FullConfig;
    if (!fallback.baseUrls) fallback.baseUrls = {};
    return fallback;
  }

  private async backupAndRestore(raw: unknown): Promise<void> {
    const timestamp = new Date()
      .toISOString()
      .replace(/[:.]/g, '-');
    const backupPath = path.join(CONFIG_BACKUP_DIR, `config-${timestamp}.json`);

    try {
      await fs.writeFile(backupPath, JSON.stringify(raw, null, 2), 'utf-8');
    } catch {
    }

    this.applyConfig(JSON.parse(JSON.stringify(DEFAULT_CONFIG)));
  }
}