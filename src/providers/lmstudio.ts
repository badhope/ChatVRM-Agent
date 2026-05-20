import { OpenAIProvider } from './openai.js';
import type { ProviderConfig } from '../types.js';
import { PROVIDER_INFO } from '../types.js';
import { CONNECTION_TIMEOUT_MS } from '../constants/index.js';

interface LMStudioModel {
  id: string;
  object: string;
  owned_by: string;
}

interface LMStudioListResponse {
  object: string;
  data: LMStudioModel[];
}

export class LMStudioProvider extends OpenAIProvider {
  constructor(config: ProviderConfig) {
    super('lmstudio', config, PROVIDER_INFO.lmstudio);
  }

  protected getBaseUrl(): string {
    // LM Studio 默认端口1234
    return this.config.baseUrl || 'http://127.0.0.1:1234/v1';
  }

  protected buildHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
    };
  }

  async isAvailable(): Promise<boolean> {
    try {
      const response = await fetch(`${this.getBaseUrl()}/models`, {
        method: 'GET',
        signal: AbortSignal.timeout(CONNECTION_TIMEOUT_MS),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  // 获取LM Studio中已加载的模型列表
  async getLocalModels(): Promise<Array<{ id: string; name: string; owned_by: string }>> {
    try {
      const response = await fetch(`${this.getBaseUrl()}/models`, {
        method: 'GET',
        signal: AbortSignal.timeout(CONNECTION_TIMEOUT_MS),
      });

      if (!response.ok) {
        return [];
      }

      const data = await response.json() as LMStudioListResponse;

      return data.data.map(model => ({
        id: model.id,
        name: model.id,
        owned_by: model.owned_by,
      }));
    } catch {
      return [];
    }
  }
}
