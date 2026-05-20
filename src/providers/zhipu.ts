import { OpenAIProvider } from './openai.js';
import type { ProviderConfig } from '../types.js';
import { PROVIDER_INFO } from '../types.js';

export class ZhipuProvider extends OpenAIProvider {
  constructor(config: ProviderConfig) {
    super('zhipu', config, PROVIDER_INFO.zhipu);
  }

  protected getBaseUrl(): string {
    return this.config.baseUrl || PROVIDER_INFO.zhipu.baseUrl;
  }
}
