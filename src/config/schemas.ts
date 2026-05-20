import { z } from 'zod';

// ============================================================
// Provider Schemas
// ============================================================

export const ProviderTypeSchema = z.enum([
  'openai', 'anthropic', 'google', 'aliyun', 'siliconflow',
  'zhipu', 'baidu', 'deepseek', 'ollama', 'lmstudio'
]);

export const ProviderConfigSchema = z.object({
  apiKey: z.string().optional(),
  baseUrl: z.string().url().optional(),
  defaultModel: z.string().optional(),
  timeout: z.number().min(1000).max(300000).default(60000),
  maxRetries: z.number().min(0).max(10).default(2)
});

// ============================================================
// Chat Schemas
// ============================================================

export const ChatConfigSchema = z.object({
  defaultTemperature: z.number().min(0).max(2).default(0.7),
  defaultMaxTokens: z.number().min(100).max(128000).default(4000),
  saveHistory: z.boolean().default(true),
  historyLimit: z.number().min(1).max(1000).default(100)
});

// ============================================================
// Memory Schemas
// ============================================================

export const MemoryConfigSchema = z.object({
  enabled: z.boolean().default(true),
  autoRecall: z.boolean().default(true),
  ragEnabled: z.boolean().default(false),
  graphEnabled: z.boolean().default(false),
  knowledgeEnabled: z.boolean().default(false),
  maxMemories: z.number().min(10).max(10000).default(1000)
});

// ============================================================
// Sandbox Schemas
// ============================================================

export const SandboxLevelSchema = z.enum(['minimal', 'conservative', 'balanced', 'relaxed', 'extreme']);

export const SandboxConfigSchema = z.object({
  level: SandboxLevelSchema.default('balanced'),
  allowDangerousOps: z.boolean().default(false),
  confirmOnRisk: z.boolean().default(true)
});

// ============================================================
// Circuit Breaker Schemas
// ============================================================

export const CircuitBreakerConfigSchema = z.object({
  failureThreshold: z.number().min(1).max(20).default(5),
  resetTimeout: z.number().min(1000).max(300000).default(60000),
  halfOpenMaxCalls: z.number().min(1).max(10).default(3),
});

// ============================================================
// Main Config Schema
// ============================================================

export const ConfigSchema = z.object({
  version: z.string().default('1.0'),
  defaultProvider: ProviderTypeSchema.optional(),
  providers: z.record(ProviderTypeSchema, ProviderConfigSchema).default({}),
  chat: ChatConfigSchema.default({}),
  memory: MemoryConfigSchema.default({}),
  sandbox: SandboxConfigSchema.default({}),
  circuitBreaker: CircuitBreakerConfigSchema.default({}),
});

// ============================================================
// Type Exports
// ============================================================

export type Config = z.infer<typeof ConfigSchema>;
export type ProviderType = z.infer<typeof ProviderTypeSchema>;
export type ProviderConfig = z.infer<typeof ProviderConfigSchema>;
export type ChatConfig = z.infer<typeof ChatConfigSchema>;
export type MemoryConfig = z.infer<typeof MemoryConfigSchema>;
export type SandboxConfig = z.infer<typeof SandboxConfigSchema>;
export type SandboxLevel = z.infer<typeof SandboxLevelSchema>;
export type CircuitBreakerConfig = z.infer<typeof CircuitBreakerConfigSchema>;
