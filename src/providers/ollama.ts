import { BaseProvider } from '../base.js';
import type { ChatParams, ChatResponse, StreamChunk, ProviderConfig, Message, TextContent } from '../types.js';
import { PROVIDER_INFO } from '../types.js';
import { formatBytes } from '../utils/format.js';
import { CONNECTION_TIMEOUT_MS, REQUEST_TIMEOUT_MS } from '../constants/index.js';

interface OllamaModel {
  name: string;
  model: string;
  modified_at: string;
  size: number;
  digest: string;
  details: {
    parent_model: string;
    format: string;
    family: string;
    families: string[];
    parameter_size: string;
    quantization_level: string;
  };
}

interface OllamaListResponse {
  models: OllamaModel[];
}

interface OllamaChatResponse {
  model: string;
  created_at: string;
  message: {
    role: string;
    content: string;
  };
  done: boolean;
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  eval_count?: number;
  eval_duration?: number;
}

interface OllamaChatStreamResponse {
  model: string;
  created_at: string;
  message: {
    role: string;
    content: string;
  };
  done: boolean;
}

/**
 * Ollama 模型列表响应（用于 listRemoteModels）
 */
interface OllamaTagsResponse {
  models: Array<{
    name: string;
    model: string;
  }>;
}

export class OllamaProvider extends BaseProvider {
  constructor(config: ProviderConfig) {
    super('ollama', config, PROVIDER_INFO.ollama);
  }

  protected getBaseUrl(): string {
    // Ollama默认端口11434
    return this.config.baseUrl || 'http://127.0.0.1:11434';
  }

  protected buildHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
    };
  }

  async chat(params: ChatParams): Promise<ChatResponse> {
    const model = params.model || this.getDefaultModel();

    // 转换消息格式为Ollama格式
    const messages = params.messages.map(msg => ({
      role: msg.role,
      content: this.convertContent(msg.content),
    }));

    const body = {
      model,
      messages,
      stream: false,
      options: {
        temperature: params.temperature ?? 0.7,
        num_predict: params.maxTokens ?? 4096,
      },
    };

    const url = `${this.getBaseUrl()}/api/chat`;

    const response = await this.retryWithBackoff(async () => {
      const res = await fetch(url, {
        method: 'POST',
        headers: this.buildHeaders(),
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.getTimeout()),
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Ollama请求失败 (${res.status}): ${errorText}`);
      }

      return res.json() as Promise<OllamaChatResponse>;
    });

    const promptTokens = response.prompt_eval_count || 0;
    const completionTokens = response.eval_count || 0;
    const totalTokens = promptTokens + completionTokens;

    return {
      content: response.message?.content || '',
      usage: {
        promptTokens,
        completionTokens,
        totalTokens,
      },
      cost: {
        inputCost: 0,
        outputCost: 0,
        totalCost: 0,
        currency: 'USD',
      },
      model: response.model,
      provider: 'ollama',
      finishReason: response.done ? 'stop' : undefined,
    };
  }

  async *stream(params: ChatParams): AsyncGenerator<StreamChunk> {
    const model = params.model || this.getDefaultModel();

    const messages = params.messages.map(msg => ({
      role: msg.role,
      content: this.convertContent(msg.content),
    }));

    const body = {
      model,
      messages,
      stream: true,
      options: {
        temperature: params.temperature ?? 0.7,
        num_predict: params.maxTokens ?? 4096,
      },
    };

    const url = `${this.getBaseUrl()}/api/chat`;

    const response = await fetch(url, {
      method: 'POST',
      headers: this.buildHeaders(),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.getTimeout()),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Ollama流式请求失败 (${response.status}): ${errorText}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('无法获取响应流');
    }

    const decoder = new TextDecoder();
    let buffer = '';

    const MAX_ITERATIONS = 10000;
    const startTime = Date.now();
    const MAX_TOTAL_TIME = 300000; // 5 minutes
    let iterations = 0;

    try {
      while (true) {
        if (++iterations > MAX_ITERATIONS) throw new Error('Stream limit exceeded');
        if (Date.now() - startTime > MAX_TOTAL_TIME) throw new Error('Stream timeout');

        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.trim() === '') continue;

          try {
            const data: OllamaChatStreamResponse = JSON.parse(line);
            if (data.message?.content) {
              yield {
                content: data.message.content,
                done: data.done,
              };
            }

            // Parse usage info from the final done chunk
            if (data.done) {
              const promptTokens = (data as OllamaChatStreamResponse & { prompt_eval_count?: number }).prompt_eval_count || 0;
              const completionTokens = (data as OllamaChatStreamResponse & { eval_count?: number }).eval_count || 0;
              if (promptTokens > 0 || completionTokens > 0) {
                yield {
                  content: '',
                  done: true,
                  usage: {
                    promptTokens,
                    completionTokens,
                    totalTokens: promptTokens + completionTokens,
                  }
                };
              }
            }
          } catch {
            // 忽略解析错误
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    yield {
      content: '',
      done: true,
    };
  }

  async isAvailable(): Promise<boolean> {
    try {
      const response = await fetch(`${this.getBaseUrl()}/api/tags`, {
        method: 'GET',
        signal: AbortSignal.timeout(CONNECTION_TIMEOUT_MS),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  async listRemoteModels(): Promise<string[]> {
    try {
      const response = await fetch(`${this.getBaseUrl()}/api/tags`, {
        method: 'GET',
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!response.ok) return [];
      const data = await response.json() as OllamaTagsResponse;
      // Ollama 返回 { models: [{ name: "llama3:latest", model: "llama3:latest", ... }] }
      const models = data.models || [];
      return models.map(m => m.model || m.name).sort();
    } catch {
      return [];
    }
  }

  // 将 MessageContent 转换为 Ollama 兼容的字符串内容
  private convertContent(content: Message['content']): string {
    if (typeof content === 'string') {
      return content;
    } else if (Array.isArray(content)) {
      // Extract text parts, ignore images for now (Ollama has limited multimodal support)
      return content
        .filter((p): p is TextContent => typeof p !== 'string' && p.type === 'text')
        .map(p => p.text)
        .join('\n');
    }
    return String(content);
  }

  // 获取本地已安装的模型列表
  async getLocalModels(): Promise<Array<{ id: string; name: string; size: string }>> {
    try {
      const response = await fetch(`${this.getBaseUrl()}/api/tags`, {
        method: 'GET',
        signal: AbortSignal.timeout(CONNECTION_TIMEOUT_MS),
      });

      if (!response.ok) {
        return [];
      }

      const data = await response.json() as OllamaListResponse;

      return data.models.map(model => ({
        id: model.model,
        name: model.name,
        size: formatBytes(model.size),
      }));
    } catch {
      return [];
    }
  }
}
