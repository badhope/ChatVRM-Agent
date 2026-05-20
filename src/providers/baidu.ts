import { BaseProvider } from '../base.js';
import type { ChatParams, ChatResponse, StreamChunk, ProviderConfig, Message, TextContent } from '../types.js';
import { PROVIDER_INFO } from '../types.js';
import { CONNECTION_TIMEOUT_MS } from '../constants/index.js';

interface BaiduResponse {
  id: string;
  object: string;
  created: number;
  result: string;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  is_truncated: boolean;
  need_clear_history: boolean;
}

interface BaiduTokenResponse {
  access_token: string;
  expires_in: number;
}

export class BaiduProvider extends BaseProvider {
  private accessToken: string | null = null;
  private tokenExpiresAt: number = 0;

  constructor(config: ProviderConfig) {
    super('baidu', config, PROVIDER_INFO.baidu);
  }

  private async getAccessToken(): Promise<string> {
    // 检查token是否过期
    if (this.accessToken && Date.now() < this.tokenExpiresAt) {
      return this.accessToken;
    }

    const apiKey = this.config.apiKey;
    if (!apiKey) {
      throw new Error('百度API需要配置API Key');
    }

    // Parse apiKey as "appId.secretKey" format
    const [appId, secretKey] = apiKey.split('.');
    if (!appId || !secretKey) {
      throw new Error('Baidu API Key format should be "appId.secretKey"');
    }

    // Call Baidu token API
    const response = await fetch(
      `https://aip.baidubce.com/oauth/2.0/token?grant_type=client_credentials&client_id=${appId}&client_secret=${secretKey}`,
      { method: 'POST' }
    );

    if (!response.ok) {
      throw new Error(`Failed to get Baidu access token: ${response.status}`);
    }

    const data = await response.json() as { access_token: string; expires_in: number };
    this.accessToken = data.access_token;
    this.tokenExpiresAt = Date.now() + (data.expires_in - 60) * 1000; // Refresh 1 min early
    return this.accessToken;
  }

  async chat(params: ChatParams): Promise<ChatResponse> {
    const model = params.model || this.getDefaultModel();
    const accessToken = await this.getAccessToken();

    const body = {
      messages: params.messages.map(msg => ({
        role: msg.role,
        content: this.convertContent(msg.content),
      })),
      temperature: params.temperature ?? 0.7,
      max_output_tokens: params.maxTokens ?? 4096,
    };

    const url = `${this.getBaseUrl()}/chat/completions?access_token=${accessToken}`;

    const response = await this.retryWithBackoff(async () => {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.getTimeout()),
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`API请求失败 (${res.status}): ${errorText}`);
      }

      return res.json() as Promise<BaiduResponse>;
    });

    return {
      content: response.result || '',
      usage: {
        promptTokens: response.usage?.prompt_tokens || 0,
        completionTokens: response.usage?.completion_tokens || 0,
        totalTokens: response.usage?.total_tokens || 0,
      },
      cost: this.calculateCost(
        {
          promptTokens: response.usage?.prompt_tokens || 0,
          completionTokens: response.usage?.completion_tokens || 0,
          totalTokens: response.usage?.total_tokens || 0,
        },
        model
      ),
      model,
      provider: 'baidu',
      finishReason: response.is_truncated ? 'length' : 'stop',
    };
  }

  async *stream(params: ChatParams): AsyncGenerator<StreamChunk> {
    const model = params.model || this.getDefaultModel();
    const accessToken = await this.getAccessToken();

    const body = {
      messages: params.messages.map(msg => ({
        role: msg.role,
        content: this.convertContent(msg.content),
      })),
      temperature: params.temperature ?? 0.7,
      max_output_tokens: params.maxTokens ?? 4096,
      stream: true,
    };

    const url = `${this.getBaseUrl()}/chat/completions?access_token=${accessToken}`;

    const response = await this.retryStreamWithBackoff(async () => {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.getTimeout()),
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`流式请求失败 (${res.status}): ${errorText}`);
      }

      return res;
    });

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('无法获取响应流');
    }

    const decoder = new TextDecoder();
    let buffer = '';
    let released = false;

    // 确保 reader 总是被释放的辅助函数
    const ensureReleased = () => {
      if (!released && reader) {
        released = true;
        try {
          reader.releaseLock();
        } catch {
          // 忽略释放错误
        }
      }
    };

    const MAX_ITERATIONS = 10000;
    const startTime = Date.now();
    const MAX_TOTAL_TIME = 300000; // 5 minutes
    let iterations = 0;

    try {
      while (true) {
        if (++iterations > MAX_ITERATIONS) throw new Error('Stream limit exceeded');
        if (Date.now() - startTime > MAX_TOTAL_TIME) throw new Error('Stream timeout');

        try {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.trim() === '' || line.trim() === 'data: [DONE]') continue;

            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6)) as {
                  result?: string;
                  is_end?: boolean;
                  usage?: {
                    prompt_tokens: number;
                    completion_tokens: number;
                    total_tokens: number;
                  };
                };

                if (data.result) {
                  yield {
                    content: data.result,
                    done: false,
                  };
                }

                // Parse usage info from the final chunk
                if (data.is_end && data.usage) {
                  yield {
                    content: '',
                    done: true,
                    usage: {
                      promptTokens: data.usage.prompt_tokens || 0,
                      completionTokens: data.usage.completion_tokens || 0,
                      totalTokens: data.usage.total_tokens || 0,
                    }
                  };
                }
              } catch {
                // 忽略解析错误
              }
            }
          }
        } catch (streamError) {
          // 流读取错误时也要确保释放
          ensureReleased();
          throw streamError;
        }
      }
    } catch (error) {
      ensureReleased();
      throw error;
    } finally {
      // 最终确保释放
      ensureReleased();
    }

    yield {
      content: '',
      done: true,
    };
  }

  async isAvailable(): Promise<boolean> {
    if (!this.getApiKey()) {
      return false;
    }

    try {
      await this.getAccessToken();
      return true;
    } catch {
      return false;
    }
  }

  // 将 MessageContent 转换为百度兼容的字符串内容
  private convertContent(content: Message['content']): string {
    if (typeof content === 'string') {
      return content;
    } else if (Array.isArray(content)) {
      // Extract text parts, ignore images (Baidu has limited multimodal support in this format)
      return content
        .filter((p): p is TextContent => typeof p !== 'string' && p.type === 'text')
        .map(p => p.text)
        .join('\n');
    }
    return String(content);
  }
}
