import { OpenAIProvider } from './openai.js';
import type { ProviderConfig } from '../types.js';
import { PROVIDER_INFO } from '../types.js';

export class AliyunProvider extends OpenAIProvider {
  constructor(config: ProviderConfig) {
    super('aliyun', config, PROVIDER_INFO.aliyun);
  }

  protected getBaseUrl(): string {
    return this.config.baseUrl || PROVIDER_INFO.aliyun.baseUrl;
  }
}
