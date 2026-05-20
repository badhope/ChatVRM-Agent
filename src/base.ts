import type {
  ProviderType,
  ChatParams,
  ChatResponse,
  StreamChunk,
  ProviderConfig,
  ModelInfo,
  TokenUsage,
  CostInfo,
  PROVIDER_INFO
} from './types.js';
import { classifyError, shouldRetry, retryWithBackoff, retryStreamWithBackoff, type RetryConfig } from './utils/retry.js';
import { calculateCost } from './utils/cost.js';

export type { ErrorCategory } from './utils/retry.js';
export type { RetryConfig } from './utils/retry.js';

export abstract class BaseProvider {
  protected config: ProviderConfig;
  protected providerType: ProviderType;
  protected providerInfo: typeof PROVIDER_INFO[ProviderType];
  private _modelsCache: { data: string[]; timestamp: number } | null = null;
  private static readonly CACHE_TTL = 60_000;

  constructor(
    providerType: ProviderType,
    config: ProviderConfig,
    providerInfo: typeof PROVIDER_INFO[ProviderType]
  ) {
    this.providerType = providerType;
    this.config = config;
    this.providerInfo = providerInfo;
  }

  abstract chat(params: ChatParams): Promise<ChatResponse>;
  abstract stream(params: ChatParams): AsyncGenerator<StreamChunk>;
  abstract isAvailable(): Promise<boolean>;

  async listRemoteModels(): Promise<string[]> {
    const now = Date.now();
    if (this._modelsCache && now - this._modelsCache.timestamp < BaseProvider.CACHE_TTL) {
      return this._modelsCache.data;
    }
    try {
      const url = `${this.getBaseUrl()}/models`;
      const response = await fetch(url, {
        method: 'GET',
        headers: this.buildHeaders(),
        signal: AbortSignal.timeout(this.getTimeout()),
      });
      if (!response.ok) return this._modelsCache?.data || [];
      const data = await response.json() as { data?: Array<{ id: string }> } | Array<{ id: string }>;
      const models: Array<{ id: string }> = Array.isArray(data) ? data : (data.data || []);
      const sorted = models.map(m => m.id).sort();
      this._modelsCache = { data: sorted, timestamp: now };
      return sorted;
    } catch {
      return this._modelsCache?.data || [];
    }
  }

  async searchModels(keyword: string): Promise<string[]> {
    const allModels = await this.listRemoteModels();
    const lower = keyword.toLowerCase();
    return allModels.filter(id => id.toLowerCase().includes(lower));
  }

  async findModel(modelName: string): Promise<{ exact: string | null; candidates: string[] }> {
    const allModels = await this.listRemoteModels();
    const lower = modelName.toLowerCase();
    const exact = allModels.find(id => id.toLowerCase() === lower);
    if (exact) return { exact, candidates: [] };
    const prefixMatches = allModels.filter(id => id.toLowerCase().startsWith(lower));
    if (prefixMatches.length === 1) return { exact: prefixMatches[0], candidates: [] };
    if (prefixMatches.length > 1) return { exact: null, candidates: prefixMatches };
    const containsMatches = allModels.filter(id => id.toLowerCase().includes(lower));
    if (containsMatches.length > 0) return { exact: null, candidates: containsMatches.slice(0, 10) };
    return { exact: null, candidates: [] };
  }

  getName(): string { return this.providerInfo.displayName; }
  getType(): ProviderType { return this.providerType; }
  getModels(): ModelInfo[] { return this.providerInfo.models; }
  getDefaultModel(): string { return this.config.model || this.providerInfo.models[0]?.id || ''; }
  getModelInfo(modelId: string): ModelInfo | undefined { return this.providerInfo.models.find(m => m.id === modelId); }
  getConfig(): ProviderConfig { return { ...this.config }; }

  /**
   * 列出可用模型（实现 ILLMProvider 接口）
   * @returns 模型ID列表
   */
  async listModels(): Promise<string[]> {
    return this.providerInfo.models.map(m => m.id);
  }

  public calculateCost(usage: TokenUsage, modelId: string): CostInfo {
    return calculateCost(usage, this.getModelInfo(modelId));
  }

  public getTimeout(): number { return this.config.timeout || 30000; }
  public getMaxRetries(): number { return this.config.maxRetries || 3; }

  protected getRetryConfig(): RetryConfig {
    return { maxRetries: this.getMaxRetries(), baseDelay: 1000, maxDelay: 60000 };
  }

  public classifyError(error: Error | Response) { return classifyError(error); }
  public shouldRetry(error: Error | Response) { return shouldRetry(error); }

  protected buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const apiKey = this.getApiKey();
    if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;
    return headers;
  }

  protected getApiKey(): string | undefined { return this.config.apiKey; }
  protected getBaseUrl(): string { return this.config.baseUrl || this.providerInfo.baseUrl; }

  protected async makeRequest<T>(endpoint: string, body: Record<string, unknown>): Promise<T> {
    const url = `${this.getBaseUrl()}${endpoint}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: this.buildHeaders(),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.getTimeout())
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API请求失败 (${response.status}): ${errorText}`);
    }
    return response.json() as Promise<T>;
  }

  protected async makeStreamRequest(url: string, body: Record<string, unknown>): Promise<Response> {
    const response = await fetch(url, {
      method: 'POST',
      headers: this.buildHeaders(),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.getTimeout())
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`流式请求失败 (${response.status}): ${errorText}`);
    }
    return response;
  }

  protected async retryWithBackoff<T>(fn: () => Promise<T>, maxRetries?: number): Promise<T> {
    const config = this.getRetryConfig();
    return retryWithBackoff(fn, { ...config, maxRetries: maxRetries ?? config.maxRetries });
  }

  protected async retryStreamWithBackoff(fn: () => Promise<Response>): Promise<Response> {
    return retryStreamWithBackoff(fn, this.getRetryConfig());
  }
}
