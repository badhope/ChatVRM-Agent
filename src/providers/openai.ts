import { BaseProvider } from '../base.js';
import type { ChatParams, ChatResponse, StreamChunk, ProviderConfig, Message, ImageContent, TextContent, ProviderType } from '../types.js';
import { PROVIDER_INFO } from '../types.js';
import { CONNECTION_TIMEOUT_MS } from '../constants/index.js';

interface OpenAIResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

interface OpenAIStreamResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    delta: {
      role?: string;
      content?: string;
    };
    finish_reason: string | null;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/**
 * OpenAI 文本内容部分
 */
interface OpenAITextPart {
  type: 'text';
  text: string;
}

/**
 * OpenAI 图片内容部分
 */
interface OpenAIImagePart {
  type: 'image_url';
  image_url: {
    url: string;
  };
}

/**
 * OpenAI 消息内容（字符串或多部分内容）
 */
type OpenAIMessageContent = string | Array<OpenAITextPart | OpenAIImagePart>;

/**
 * OpenAI 消息格式
 */
interface OpenAIMessage {
  role: string;
  content: OpenAIMessageContent;
}

export class OpenAIProvider extends BaseProvider {
  constructor(
    providerType: ProviderType = 'openai',
    config: ProviderConfig,
    providerInfo: typeof PROVIDER_INFO[ProviderType] = PROVIDER_INFO.openai
  ) {
    super(providerType, config, providerInfo);
  }

  async chat(params: ChatParams): Promise<ChatResponse> {
    const model = params.model || this.getDefaultModel();
    const convertedMessages = this.convertMessages(params.messages);

    const body = {
      model,
      messages: convertedMessages,
      temperature: params.temperature ?? 0.7,
      max_tokens: params.maxTokens ?? 4096,
      stream: false,
    };

    const response = await this.retryWithBackoff(() => 
      this.makeRequest<OpenAIResponse>('/chat/completions', body)
    );

    const choice = response.choices?.[0];
    const usage = response.usage;

    return {
      content: choice?.message?.content || '',
      usage: {
        promptTokens: usage?.prompt_tokens || 0,
        completionTokens: usage?.completion_tokens || 0,
        totalTokens: usage?.total_tokens || 0,
      },
      cost: this.calculateCost(
        {
          promptTokens: usage?.prompt_tokens || 0,
          completionTokens: usage?.completion_tokens || 0,
          totalTokens: usage?.total_tokens || 0,
        },
        model
      ),
      model: response.model,
      provider: 'openai',
      finishReason: this.mapFinishReason(choice?.finish_reason),
    };
  }

  async *stream(params: ChatParams): AsyncGenerator<StreamChunk> {
    const model = params.model || this.getDefaultModel();
    const convertedMessages = this.convertMessages(params.messages);

    const body = {
      model,
      messages: convertedMessages,
      temperature: params.temperature ?? 0.7,
      max_tokens: params.maxTokens ?? 4096,
      stream: true,
    };

    const response = await this.retryStreamWithBackoff(() =>
      this.makeStreamRequest(`${this.getBaseUrl()}/chat/completions`, body)
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
            if (line.trim() === '' || line.trim() === 'data: [DONE]') continue;
            
            if (line.startsWith('data: ')) {
              try {
                const data: OpenAIStreamResponse = JSON.parse(line.slice(6));
                const delta = data.choices[0]?.delta;
                
                if (delta?.content) {
                  yield {
                    content: delta.content,
                    done: false,
                  };
                }

                // Parse usage info from the final chunk
                if (data.usage) {
                  yield {
                    content: '',
                    done: true,
                    usage: {
                      promptTokens: data.usage.prompt_tokens || 0,
                      completionTokens: data.usage.completion_tokens || 0,
                      totalTokens: (data.usage.prompt_tokens || 0) + (data.usage.completion_tokens || 0),
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
        headers: this.buildHeaders(),
        signal: AbortSignal.timeout(CONNECTION_TIMEOUT_MS),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  private convertMessages(messages: Message[]): OpenAIMessage[] {
    return messages.map(msg => {
      // 处理多模态内容
      if (Array.isArray(msg.content)) {
        const hasImage = msg.content.some(c => typeof c === 'object' && c.type === 'image_url');
        if (hasImage) {
          const content: Array<OpenAITextPart | OpenAIImagePart> = msg.content.map(c => {
            if (typeof c === 'object' && c.type === 'text') {
              return { type: 'text' as const, text: (c as TextContent).text };
            } else if (typeof c === 'object' && c.type === 'image_url') {
              return { type: 'image_url' as const, image_url: (c as ImageContent).image_url };
            }
            return { type: 'text' as const, text: '' };
          });
          return {
            role: msg.role,
            content,
          };
        }
        // 纯文本数组，合并为单个字符串
        return {
          role: msg.role,
          content: msg.content.map(c => typeof c === 'object' && c.type === 'text' ? (c as TextContent).text : '').join('')
        };
      }
      // 字符串内容
      return {
        role: msg.role,
        content: typeof msg.content === 'string' ? msg.content : String(msg.content)
      };
    });
  }

  private mapFinishReason(reason: string | null): 'stop' | 'length' | 'content_filter' | undefined {
    if (reason === 'stop') return 'stop';
    if (reason === 'length') return 'length';
    if (reason === 'content_filter') return 'content_filter';
    return undefined;
  }
}
