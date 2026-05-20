import { BaseProvider } from '../base.js';
import type { ChatParams, ChatResponse, StreamChunk, ProviderConfig, Message, ImageContent, TextContent } from '../types.js';
import { PROVIDER_INFO } from '../types.js';
import { CONNECTION_TIMEOUT_MS, REQUEST_TIMEOUT_MS } from '../constants/index.js';

interface AnthropicResponse {
  id: string;
  type: string;
  role: string;
  model: string;
  content: Array<{
    type: string;
    text: string;
  }>;
  stop_reason: string | null;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

interface AnthropicStreamEvent {
  type: string;
  delta?: {
    type?: string;
    text?: string;
    stop_reason?: string;
  };
  content_block?: {
    type: string;
    text: string;
  };
  usage?: {
    input_tokens: number;
    output_tokens: number;
  };
  message?: {
    usage?: {
      input_tokens: number;
      output_tokens: number;
    };
  };
}

/**
 * Anthropic 模型列表响应
 */
interface AnthropicModelsResponse {
  data: Array<{
    id: string;
    type: string;
    display_name: string;
    created_at: string;
  }>;
}

/**
 * Anthropic 文本内容块
 */
interface AnthropicTextBlock {
  type: 'text';
  text: string;
}

/**
 * Anthropic 图片内容块
 */
interface AnthropicImageBlock {
  type: 'image';
  source: {
    type: 'base64';
    media_type: string;
    data: string;
  };
}

/**
 * Anthropic 消息内容（文本或图片）
 */
type AnthropicMessageContent = string | Array<AnthropicTextBlock | AnthropicImageBlock>;

/**
 * Anthropic 消息格式
 */
interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: AnthropicMessageContent;
}

export class AnthropicProvider extends BaseProvider {
  constructor(config: ProviderConfig) {
    super('anthropic', config, PROVIDER_INFO.anthropic);
  }

  async chat(params: ChatParams): Promise<ChatResponse> {
    const model = params.model || this.getDefaultModel();
    const { system, messages } = this.convertMessages(params.messages);

    const body: Record<string, unknown> = {
      model,
      messages,
      max_tokens: params.maxTokens ?? 4096,
      temperature: params.temperature ?? 0.7,
    };

    if (system) {
      body.system = system;
    }

    const response = await this.retryWithBackoff(() =>
      this.makeAnthropicRequest<AnthropicResponse>('/messages', body)
    );

    let content = '';
    if (response.content) {
      for (const block of response.content) {
        if (block.type === 'text') {
          content += block.text;
        }
        // tool_use blocks are handled separately by the agent
      }
    }
    const usage = response.usage;

    return {
      content,
      usage: {
        promptTokens: usage?.input_tokens || 0,
        completionTokens: usage?.output_tokens || 0,
        totalTokens: (usage?.input_tokens || 0) + (usage?.output_tokens || 0),
      },
      cost: this.calculateCost(
        {
          promptTokens: usage?.input_tokens || 0,
          completionTokens: usage?.output_tokens || 0,
          totalTokens: (usage?.input_tokens || 0) + (usage?.output_tokens || 0),
        },
        model
      ),
      model: response.model,
      provider: 'anthropic',
      finishReason: this.mapFinishReason(response.stop_reason),
    };
  }

  async *stream(params: ChatParams): AsyncGenerator<StreamChunk> {
    const model = params.model || this.getDefaultModel();
    const { system, messages } = this.convertMessages(params.messages);

    const body: Record<string, unknown> = {
      model,
      messages,
      max_tokens: params.maxTokens ?? 4096,
      temperature: params.temperature ?? 0.7,
      stream: true,
    };

    if (system) {
      body.system = system;
    }

    const response = await this.retryStreamWithBackoff(() =>
      this.makeAnthropicStreamRequest('/messages', body)
    );

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
            if (line.trim() === '' || line.startsWith('event:')) continue;

            if (line.startsWith('data: ')) {
              try {
                const event: AnthropicStreamEvent = JSON.parse(line.slice(6));

                if (event.type === 'content_block_delta' && event.delta?.text) {
                  yield {
                    content: event.delta.text,
                    done: false,
                  };
                }

                // Parse usage from the message_end event
                if (event.type === 'message_end' && event.message?.usage) {
                  yield {
                    content: '',
                    done: true,
                    usage: {
                      promptTokens: event.message.usage.input_tokens || 0,
                      completionTokens: event.message.usage.output_tokens || 0,
                      totalTokens: (event.message.usage.input_tokens || 0) + (event.message.usage.output_tokens || 0),
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
      const response = await fetch(`${this.getBaseUrl()}/models`, {
        method: 'GET',
        headers: {
          ...this.buildHeaders(),
          'anthropic-version': '2023-06-01',
        },
        signal: AbortSignal.timeout(CONNECTION_TIMEOUT_MS),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  async listRemoteModels(): Promise<string[]> {
    try {
      const response = await fetch(`${this.getBaseUrl()}/models`, {
        method: 'GET',
        headers: {
          ...this.buildHeaders(),
          'anthropic-version': '2023-06-01',
        },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!response.ok) return [];
      const data = await response.json() as AnthropicModelsResponse;
      // Anthropic 返回 { data: [{ id: "claude-xxx", ... }] }
      const models = data.data || [];
      return models.map(m => m.id).sort();
    } catch {
      return [];
    }
  }

  private convertMessages(messages: Message[]): { system?: string; messages: AnthropicMessage[] } {
    const result: AnthropicMessage[] = [];
    let systemMessage: string | undefined;

    for (const msg of messages) {
      if (msg.role === 'system') {
        systemMessage = typeof msg.content === 'string' ? msg.content : String(msg.content);
      } else if (Array.isArray(msg.content)) {
        // 处理多模态内容
        const hasImage = msg.content.some(c => typeof c === 'object' && c.type === 'image_url');
        if (hasImage) {
          const content: Array<AnthropicTextBlock | AnthropicImageBlock> = msg.content.map(c => {
            if (typeof c === 'object' && c.type === 'text') {
              return { type: 'text' as const, text: (c as TextContent).text };
            } else if (typeof c === 'object' && c.type === 'image_url') {
              const url = (c as ImageContent).image_url.url;
              // Anthropic 需要 base64 格式
              if (url.startsWith('data:')) {
                const matches = url.match(/^data:(.+);base64,(.+)$/);
                if (matches) {
                  return {
                    type: 'image' as const,
                    source: {
                      type: 'base64' as const,
                      media_type: matches[1],
                      data: matches[2]
                    }
                  };
                }
              }
              return { type: 'text' as const, text: '[图片]' };
            }
            return { type: 'text' as const, text: '' };
          });
          result.push({ role: msg.role === 'assistant' ? 'assistant' : 'user', content });
        } else {
          // 纯文本数组，合并为单个字符串
          const text = msg.content
            .map(c => typeof c === 'object' && c.type === 'text' ? (c as TextContent).text : '')
            .join('');
          result.push({
            role: msg.role === 'assistant' ? 'assistant' : 'user',
            content: text,
          });
        }
      } else {
        result.push({
          role: msg.role === 'assistant' ? 'assistant' : 'user',
          content: typeof msg.content === 'string' ? msg.content : String(msg.content),
        });
      }
    }

    return { system: systemMessage, messages: result };
  }

  private async makeAnthropicRequest<T>(endpoint: string, body: Record<string, unknown>): Promise<T> {
    const url = `${this.getBaseUrl()}${endpoint}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        ...this.buildHeaders(),
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.getTimeout()),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API请求失败 (${response.status}): ${errorText}`);
    }

    return response.json() as Promise<T>;
  }

  private async makeAnthropicStreamRequest(endpoint: string, body: Record<string, unknown>): Promise<Response> {
    const url = `${this.getBaseUrl()}${endpoint}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        ...this.buildHeaders(),
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.getTimeout()),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`流式请求失败 (${response.status}): ${errorText}`);
    }

    return response;
  }

  protected buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'x-api-key': this.getApiKey() || '',
    };

    return headers;
  }

  private mapFinishReason(reason: string | null): 'stop' | 'length' | 'content_filter' | undefined {
    if (reason === 'end_turn') return 'stop';
    if (reason === 'max_tokens') return 'length';
    if (reason === 'stop_sequence') return 'stop';
    if (reason === 'content_filter') return 'content_filter';
    return undefined;
  }
}
