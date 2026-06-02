import type { ProviderType } from './config.port.js';

export interface Message {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
}

export interface ChatParams {
  messages: Message[];
  model?: string;
  provider?: ProviderType;
  temperature?: number;
  maxTokens?: number;
}

export interface ChatResponse {
  content: string;
  model: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface StreamChunk {
  content: string;
  done: boolean;
}

export interface ILLMPort {
  chat(params: ChatParams): Promise<ChatResponse>;
  stream(params: ChatParams): AsyncGenerator<StreamChunk>;
  listModels(provider: ProviderType): Promise<string[]>;
  isAvailable(provider: ProviderType): Promise<boolean>;
}