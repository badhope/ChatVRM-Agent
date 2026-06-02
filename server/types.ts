export type ProviderType =
  | 'openai'
  | 'anthropic'
  | 'google'
  | 'deepseek'
  | 'siliconflow'
  | 'aliyun'
  | 'zhipu'
  | 'baidu'
  | 'ollama'
  | 'lmstudio';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: string;
  provider?: ProviderType;
  model?: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface ChatSession {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: ChatMessage[];
  provider?: ProviderType;
  model?: string;
}

export type AgentStage =
  | 'initialize'
  | 'understand'
  | 'plan'
  | 'execute'
  | 'validate'
  | 'reflect';

export type StageStatus = 'pending' | 'running' | 'done' | 'failed';
