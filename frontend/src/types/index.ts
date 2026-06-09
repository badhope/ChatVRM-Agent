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
  streaming?: boolean;
  error?: string;
}

export interface ChatSession {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  provider?: ProviderType;
  model?: string;
  messages?: ChatMessage[];
}

export type AgentStage =
  | 'initialize'
  | 'understand'
  | 'plan'
  | 'execute'
  | 'validate'
  | 'reflect';

export type StageStatus = 'pending' | 'running' | 'done' | 'failed';

export interface PlanStep {
  id: string;
  description: string;
  tool?: string;
  status: StageStatus;
  output?: string;
  error?: string;
  toolCall?: ToolCallRecord;
}

export interface ToolCallRecord {
  toolName: string;
  args: Record<string, unknown>;
  output: string;
  error?: string;
  durationMs: number;
  startedAt: string;
}

export interface AgentStep {
  stage: AgentStage;
  status: StageStatus;
  intent?: string;
  plan?: PlanStep[];
  fileChanges?: { created: string[]; modified: string[] };
  toolCallCount?: number;
  error?: string;
  startedAt?: string;
  finishedAt?: string;
}

export interface MemoryEntry {
  id: string;
  input: string;
  output: string;
  provider: ProviderType;
  model: string;
  tags: string[];
  createdAt: string;
  importance: number;
}

export interface ToolMeta {
  name: string;
  description: string;
  schema: Array<{ name: string; type: string; description: string; required: boolean }>;
}

export interface PersonalityMeta {
  id: string;
  name: string;
  description: string;
  systemPrompt: string;
}

export type EmotionName =
  | 'neutral'
  | 'excited'
  | 'confident'
  | 'cautious'
  | 'frustrated'
  | 'tired';

export interface EmotionState {
  name: EmotionName;
  intensity: number;
  lastUpdated: string;
  triggers: string[];
}

export interface GraphNode {
  id: string;
  label: string;
  type: 'memory' | 'tag';
  weight: number;
}

export interface GraphEdge {
  source: string;
  target: string;
  weight: number;
  type: 'tag' | 'temporal';
}

export interface DashboardStats {
  chatSessions: number;
  totalMessages: number;
  memoryCount: number;
  memoryTokens: number;
  providersConfigured: number;
  providersTotal: number;
  agentRunCount: number;
  toolCallCount: number;
  agentMemoryCount: number;
  providerStatus: Array<{
    id: ProviderType;
    name: string;
    hasKey: boolean;
    requiresKey: boolean;
    available: boolean;
  }>;
  memoryByTag: Array<{ tag: string; count: number }>;
  recentActivity: Array<{ id: string; type: string; summary: string; createdAt: string }>;
}


