import { create } from 'zustand';
import { api } from '../api/client';
import type { ProviderType } from '../types';

export interface ProviderMeta {
  id: ProviderType;
  name: string;
  protocol: 'openai' | 'anthropic' | 'ollama' | 'custom';
  defaultModel: string;
  baseUrl: string;
  defaultBaseUrl: string;
  hasKey: boolean;
  isCustomBaseUrl: boolean;
  docsUrl?: string;
}

export interface CircuitBreakerLive {
  provider: ProviderType;
  state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
  failures: number;
  successes: number;
}

export interface EnvVarInfo {
  provider: ProviderType;
  apiKeyEnv: { name: string; set: boolean; length: number }[];
  baseUrlEnv: { name: string; set: boolean; value?: string } | null;
}

export interface SandboxState {
  enabled: boolean;
  allowedCommands?: string[];
  timeout?: number;
  workingDirectory?: string;
}

export interface CircuitBreakerState {
  enabled: boolean;
  failureThreshold?: number;
  resetTimeout?: number;
  halfOpenMaxCalls?: number;
}

export interface ChatDefaults {
  defaultProvider?: ProviderType;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  presencePenalty?: number;
  frequencyPenalty?: number;
  systemPrompt?: string;
  fallbackModels?: string[];
}

export interface ConfigSnapshot {
  defaultProvider?: ProviderType;
  apiKeys: Record<string, string>;
  hasKey: Record<string, boolean>;
  chat: ChatDefaults;
  sandbox: SandboxState;
  circuitBreaker: CircuitBreakerState;
}

export interface ConfigFileMeta {
  path: string;
  exists: boolean;
  size: number;
  modifiedAt: string | null;
}

interface ConfigStore {
  providers: ProviderMeta[];
  snapshot: ConfigSnapshot | null;
  live: CircuitBreakerLive[];
  envVars: EnvVarInfo[];
  fileMeta: ConfigFileMeta | null;

  loadProviders: () => Promise<void>;
  loadSnapshot: () => Promise<void>;
  loadLive: () => Promise<void>;
  loadEnvVars: () => Promise<void>;
  loadFileMeta: () => Promise<void>;
  loadAll: () => Promise<void>;

  setKey: (provider: ProviderType, key: string) => Promise<void>;
  removeKey: (provider: ProviderType) => Promise<void>;
  setBaseUrl: (provider: ProviderType, baseUrl: string) => Promise<void>;
  resetBaseUrl: (provider: ProviderType) => Promise<void>;
  setDefault: (provider: ProviderType) => Promise<void>;
  saveChatDefaults: (chat: Partial<ChatDefaults>) => Promise<void>;
  saveSandbox: (sandbox: Partial<SandboxState>) => Promise<void>;
  saveCircuitBreaker: (cb: Partial<CircuitBreakerState>) => Promise<void>;
  resetCircuitBreaker: (provider?: ProviderType) => Promise<void>;
  testConnection: (provider: ProviderType) => Promise<{ available: boolean }>;
  listModels: (provider: ProviderType) => Promise<string[]>;
  scanModels: (provider: ProviderType) => Promise<{ models: string[]; scannedAt: string; count: number }>;
  testModel: (provider: ProviderType, model: string) => Promise<{ ok: boolean; model: string; content?: string; error?: string; latencyMs: number }>;
  exportConfig: () => Promise<Record<string, unknown>>;
  importConfig: (data: Record<string, unknown>) => Promise<void>;
  resetConfig: () => Promise<void>;
}

export const useConfigStore = create<ConfigStore>((set, get) => ({
  providers: [],
  snapshot: null,
  live: [],
  envVars: [],
  fileMeta: null,

  loadProviders: async () => {
    const data = await api.get<ProviderMeta[]>('/config/providers');
    set({ providers: data });
  },

  loadSnapshot: async () => {
    const data = await api.get<ConfigSnapshot>('/config/snapshot');
    set({ snapshot: data });
  },

  loadLive: async () => {
    const data = await api.get<{ live: CircuitBreakerLive[] }>('/config/circuit-breaker');
    set({ live: data.live ?? [] });
  },

  loadEnvVars: async () => {
    const data = await api.get<EnvVarInfo[]>('/config/env');
    set({ envVars: data });
  },

  loadFileMeta: async () => {
    const data = await api.get<ConfigFileMeta>('/config/file-path');
    set({ fileMeta: data });
  },

  loadAll: async () => {
    await Promise.all([
      get().loadProviders(),
      get().loadSnapshot(),
      get().loadLive(),
      get().loadEnvVars(),
      get().loadFileMeta(),
    ]);
  },

  setKey: async (provider, key) => {
    await api.post('/config/set-key', { provider, key });
    await get().loadSnapshot();
  },
  removeKey: async (provider) => {
    await api.post('/config/remove-key', { provider });
    await get().loadSnapshot();
  },
  setBaseUrl: async (provider, baseUrl) => {
    await api.post('/config/set-base-url', { provider, baseUrl });
    await get().loadProviders();
  },
  resetBaseUrl: async (provider) => {
    await api.post('/config/reset-base-url', { provider });
    await get().loadProviders();
  },
  setDefault: async (provider) => {
    await api.post('/config/set-default', { provider });
    await get().loadSnapshot();
  },
  saveChatDefaults: async (chat) => {
    await api.put('/config/chat', chat);
    await get().loadSnapshot();
  },
  saveSandbox: async (sandbox) => {
    await api.put('/config/sandbox', sandbox);
    await get().loadSnapshot();
  },
  saveCircuitBreaker: async (cb) => {
    await api.put('/config/circuit-breaker', cb);
    await get().loadSnapshot();
  },
  resetCircuitBreaker: async (provider) => {
    await api.post('/config/circuit-breaker/reset', provider ? { provider } : {});
    await get().loadLive();
  },
  testConnection: async (provider) => {
    return api.post<{ available: boolean }>('/config/test', { provider });
  },
  listModels: async (provider) => {
    const data = await api.get<{ models: string[] }>(`/config/providers/${provider}/models`);
    return data.models;
  },
  scanModels: async (provider) => {
    const data = await api.post<{ models: string[]; scannedAt: string; count: number }>(
      `/config/providers/${provider}/models/scan`,
    );
    return data;
  },
  testModel: async (provider, model) => {
    return api.post<{ ok: boolean; model: string; content?: string; error?: string; latencyMs: number }>(
      '/config/providers/' + provider + '/test-model',
      { model },
    );
  },
  exportConfig: async () => {
    return api.get<Record<string, unknown>>('/config/export');
  },
  importConfig: async (data) => {
    await api.post('/config/import', data);
    await get().loadAll();
  },
  resetConfig: async () => {
    await api.post('/config/reset', {});
    await get().loadAll();
  },
}));
