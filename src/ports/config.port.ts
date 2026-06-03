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
  systemPrompt?: string;
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
  getAllConfig(): Promise<Record<string, unknown>>;
  exists(): Promise<boolean>;
}