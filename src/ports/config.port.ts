export type ProviderType =
  | 'openai'
  | 'anthropic'
  | 'google'
  | 'deepseek'
  | 'siliconflow'
  | 'aliyun'
  | 'zhipu'
  | 'baidu'
  | 'ollama'
  | 'lmstudio';

export interface ChatConfig {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  presencePenalty?: number;
  frequencyPenalty?: number;
  systemPrompt?: string;
  /**
   * Backup models to try in order when the primary model is unavailable
   * (HTTP 403 FreeTierOnly / 429 rate-limited / 404 not found).
   * Models are tried sequentially; first non-retryable success wins.
   */
  fallbackModels?: string[];
}

export interface SandboxConfig {
  enabled: boolean;
  allowedCommands?: string[];
  timeout?: number;
  workingDirectory?: string;
}

export interface CircuitBreakerConfig {
  enabled: boolean;
  failureThreshold?: number;
  resetTimeout?: number;
  halfOpenMaxCalls?: number;
}

export type CircuitBreakerState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CircuitBreakerSnapshot {
  provider: ProviderType;
  state: CircuitBreakerState;
  failures: number;
  successes: number;
}

export interface ConfigFileMeta {
  path: string;
  exists: boolean;
  size: number;
  modifiedAt: string | null;
}

export interface EnvVarSnapshot {
  provider: ProviderType;
  apiKeyEnv: { name: string; set: boolean; length: number }[];
  baseUrlEnv: { name: string; set: boolean; value?: string } | null;
}

export interface IConfigPort {
  init(): Promise<void>;
  getApiKey(provider: ProviderType): Promise<string | undefined>;
  setApiKey(provider: ProviderType, key: string): Promise<void>;
  removeApiKey(provider: ProviderType): Promise<void>;
  getBaseUrl(provider: ProviderType): Promise<string | undefined>;
  setBaseUrl(provider: ProviderType, baseUrl: string): Promise<void>;
  resetBaseUrl(provider: ProviderType): Promise<void>;
  getDefaultProvider(): Promise<ProviderType>;
  setDefaultProvider(provider: ProviderType): Promise<void>;
  getChatConfig(): Promise<ChatConfig>;
  updateChatConfig(config: Partial<ChatConfig>): Promise<void>;
  getSandboxConfig(): Promise<SandboxConfig>;
  updateSandboxConfig(config: Partial<SandboxConfig>): Promise<void>;
  getCircuitBreakerConfig(): Promise<CircuitBreakerConfig>;
  updateCircuitBreakerConfig(config: Partial<CircuitBreakerConfig>): Promise<void>;
  getAllConfig(options?: { revealSecrets?: boolean }): Promise<Record<string, unknown>>;
  exists(): Promise<boolean>;
  getFileMeta(): Promise<ConfigFileMeta>;
  export(): Promise<Record<string, unknown>>;
  import(data: Record<string, unknown>): Promise<void>;
  reset(): Promise<void>;
}