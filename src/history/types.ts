export interface Message {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  timestamp: number;
  metadata?: {
    model?: string;
    provider?: string;
    tokens?: number;
    cost?: number;
  };
}

export interface Session {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: Message[];
  metadata: {
    provider?: string;
    model?: string;
    totalTokens: number;
    totalCost: number;
    messageCount: number;
  };
}

export interface SessionSummary {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messageCount: number;
  preview: string;
}

export interface HistoryConfig {
  enabled: boolean;
  maxSessions: number;
  maxMessagesPerSession: number;
  autoSave: boolean;
  autoTitle: boolean;
}

export const DEFAULT_HISTORY_CONFIG: HistoryConfig = {
  enabled: true,
  maxSessions: 100,
  maxMessagesPerSession: 500,
  autoSave: true,
  autoTitle: true,
};
