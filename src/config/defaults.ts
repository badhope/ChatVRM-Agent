import type { SandboxLevel } from './config-types.js';
import { PROJECT_DIR } from '../utils/index.js';
import type { Config } from './schemas.js';

// ============================================================
// 沙盒权限常量
// ============================================================

export const SANDBOX_PERMISSIONS: Record<SandboxLevel, {
  description: string;
  allowDelete: boolean;
  allowSystemModify: boolean;
  allowNetwork: boolean;
  allowExec: boolean;
  maxFileSize: number;
  allowedPaths: string[];
  blockedPaths: string[];
}> = {
  minimal: {
    description: '极小权限 - 仅允许读取和执行只读操作',
    allowDelete: false,
    allowSystemModify: false,
    allowNetwork: false,
    allowExec: false,
    maxFileSize: 0,
    allowedPaths: [],
    blockedPaths: ['*'],
  },
  conservative: {
    description: '保守权限 - 允许基本文件操作，需要确认危险操作',
    allowDelete: false,
    allowSystemModify: false,
    allowNetwork: true,
    allowExec: true,
    maxFileSize: 1024 * 1024,
    allowedPaths: [PROJECT_DIR],
    blockedPaths: ['C:\\Windows', '/etc', '/usr', 'C:\\Program Files'],
  },
  balanced: {
    description: '平衡权限 - 允许常规开发操作，自动备份危险操作',
    allowDelete: true,
    allowSystemModify: false,
    allowNetwork: true,
    allowExec: true,
    maxFileSize: 10 * 1024 * 1024,
    allowedPaths: [PROJECT_DIR],
    blockedPaths: ['C:\\Windows', '/etc', '/bin', '/sbin'],
  },
  relaxed: {
    description: '宽松权限 - 允许更多操作，信任用户判断',
    allowDelete: true,
    allowSystemModify: true,
    allowNetwork: true,
    allowExec: true,
    maxFileSize: 50 * 1024 * 1024,
    allowedPaths: ['*'],
    blockedPaths: ['C:\\Windows\\System32'],
  },
  extreme: {
    description: '极端权限 - 几乎无限制，谨慎使用',
    allowDelete: true,
    allowSystemModify: true,
    allowNetwork: true,
    allowExec: true,
    maxFileSize: 1024 * 1024 * 1024,
    allowedPaths: ['*'],
    blockedPaths: [],
  },
};

// ============================================================
// 默认配置
// ============================================================

export const DEFAULT_CONFIG: Config = {
  version: '1.0',
  providers: {
    openai: { timeout: 30000, maxRetries: 3 },
    anthropic: { timeout: 30000, maxRetries: 3 },
    google: { timeout: 30000, maxRetries: 3 },
    siliconflow: { timeout: 30000, maxRetries: 3 },
    aliyun: { timeout: 30000, maxRetries: 3 },
    zhipu: { timeout: 30000, maxRetries: 3 },
    baidu: { timeout: 30000, maxRetries: 3 },
    deepseek: { timeout: 30000, maxRetries: 3 },
    ollama: { timeout: 60000, maxRetries: 1 },
    lmstudio: { timeout: 60000, maxRetries: 1 },
  },
  defaultProvider: 'aliyun',
  chat: {
    defaultTemperature: 0.7,
    defaultMaxTokens: 4096,
    saveHistory: true,
    historyLimit: 100,
  },
  memory: {
    enabled: true,
    autoRecall: true,
    ragEnabled: false,
    graphEnabled: true,
    knowledgeEnabled: true,
    maxMemories: 10000,
  },
  sandbox: {
    level: 'balanced',
    allowDangerousOps: false,
    confirmOnRisk: true,
  },
  circuitBreaker: {
    failureThreshold: 5,
    resetTimeout: 60000,
    halfOpenMaxCalls: 3,
  },
};
