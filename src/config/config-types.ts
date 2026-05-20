import type { ProviderType } from '../types.js';
import { PROJECT_DIR } from '../utils/index.js';

// ============================================================
// 配置类型定义
// ============================================================

export interface ManagerProviderConfig {
  apiKey?: string;
  baseUrl?: string;
  defaultModel?: string;
  timeout?: number;
  maxRetries?: number;
}

export interface Config {
  providers: Record<ProviderType, ManagerProviderConfig>;
  defaultProvider?: ProviderType;
  chat: {
    defaultTemperature: number;
    defaultMaxTokens: number;
    saveHistory: boolean;
    historyLimit: number;
  };
  memory: {
    enabled: boolean;
    autoRecall: boolean;
    ragEnabled: boolean;
    graphEnabled: boolean;
    knowledgeEnabled: boolean;
    maxMemories: number;
  };
  sandbox: {
    level: SandboxLevel;
    allowDangerousOps: boolean;
    confirmOnRisk: boolean;
  };
  circuitBreaker?: {
    failureThreshold: number;
    resetTimeout: number;
    halfOpenMaxCalls: number;
  };
}

export type SandboxLevel = 'minimal' | 'conservative' | 'balanced' | 'relaxed' | 'extreme';
