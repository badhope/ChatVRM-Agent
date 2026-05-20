import { OpenAIProvider } from './openai.js';
import type { ProviderConfig } from '../types.js';
import { PROVIDER_INFO } from '../types.js';

export class DeepSeekProvider extends OpenAIProvider {
  constructor(config: ProviderConfig) {
    super('deepseek', config, PROVIDER_INFO.deepseek);
  }

  protected getBaseUrl(): string {
    return this.config.baseUrl || PROVIDER_INFO.deepseek.baseUrl;
  }
}
