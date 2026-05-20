// ============================================================
// 服务接口模块 - Barrel 导出
// ============================================================

// 导出接口类型
export type {
  IConfigManager,
  IMemoryManager,
  IProviderFactory,
  ILLMProvider,
  IGitManager,
  IToolRegistry,
  Tool,
  IPluginLoader,
  Plugin,
  IHistoryManager,
  HistoryEntry,
} from './interfaces.js';

// 导出日志服务
export { logger, type Logger, type LogContext } from './logger.js';

// 导出服务基类
export { BaseService, type ServiceContext } from './base.js';

// 导出 Chat 服务
export { ChatService, type ChatMessage, type ChatOptions, type ChatResult } from './chat-service.js';

// 导出 Agent 服务
export { AgentService, type AgentTask, type AgentTaskResult } from './agent-service.js';

// 导出 Memory 服务
export { MemoryService, type MemoryEntry, type MemorySearchResult } from './memory-service.js';

// 导出 Compression 服务
export { CompressionService, type CompressionResult } from './compression-service.js';
