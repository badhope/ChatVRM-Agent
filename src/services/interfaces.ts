// ============================================================
// 服务接口定义
// 用于依赖注入和松散耦合的架构设计
// ============================================================

import type { ProviderType } from '../types.js';
import type { Config, ManagerProviderConfig, SandboxLevel } from '../config/config-types.js';
import type { MemoryInteraction, MemoryRecord, MemoryStats } from '../memory/memory-types.js';

// ============================================================
// 配置管理器接口
// ============================================================

/**
 * 配置管理器接口
 * 定义配置管理的核心操作
 */
export interface IConfigManager {
  /** 初始化配置管理器 */
  init(): Promise<void>;

  /** 检查配置是否已存在 */
  configExists(): Promise<boolean>;

  /** 获取指定提供商的配置 */
  getProviderConfig(provider: ProviderType): ManagerProviderConfig;

  /** 设置指定提供商的配置 */
  setProviderConfig(provider: ProviderType, config: Partial<ManagerProviderConfig>): Promise<void>;

  /** 获取 API 密钥 */
  getApiKey(provider: ProviderType): string | undefined;

  /** 设置 API 密钥 */
  setApiKey(provider: ProviderType, apiKey: string): Promise<void>;

  /** 移除 API 密钥 */
  removeApiKey(provider: ProviderType): Promise<void>;

  /** 获取默认提供商 */
  getDefaultProvider(): ProviderType | undefined;

  /** 设置默认提供商 */
  setDefaultProvider(provider: ProviderType): Promise<void>;

  /** 获取聊天配置 */
  getChatConfig(): Config['chat'];

  /** 更新聊天配置 */
  updateChatConfig(config: Partial<Config['chat']>): Promise<void>;

  /** 获取记忆配置 */
  getMemoryConfig(): Config['memory'];

  /** 更新记忆配置 */
  updateMemoryConfig(config: Partial<Config['memory']>): Promise<void>;

  /** 获取沙箱配置 */
  getSandboxConfig(): Config['sandbox'];

  /** 更新沙箱配置 */
  updateSandboxConfig(config: Partial<Config['sandbox']>): Promise<void>;

  /** 设置沙箱级别 */
  setSandboxLevel(level: SandboxLevel): Promise<void>;

  /** 获取沙箱权限 */
  getSandboxPermissions(): {
    allowDelete: boolean;
    allowSystemModify: boolean;
    allowNetwork: boolean;
    allowExec: boolean;
  };

  /** 检查沙箱权限 */
  checkSandboxPermission(
    action: 'delete' | 'modify' | 'network' | 'exec',
    path?: string
  ): {
    allowed: boolean;
    requiresConfirmation: boolean;
    reason?: string;
  };

  /** 获取配置文件路径 */
  getConfigPath(): string;

  /** 获取所有配置（深拷贝） */
  getAllConfig(): Config;
}

// ============================================================
// 记忆管理器接口
// ============================================================

/**
 * 记忆管理器接口
 * 定义记忆存储和检索的核心操作
 */
export interface IMemoryManager {
  /** 初始化记忆管理器 */
  init(): Promise<void>;

  /** 初始化 RAG 模块 */
  initRAG(apiKey?: string): Promise<boolean>;

  /** 启用/禁用 RAG 功能 */
  setRAGEnabled(enabled: boolean): void;

  /** 检查 RAG 是否启用 */
  isRAGEnabled(): boolean;

  /**
   * 记录一次对话交互
   */
  rememberChat(params: {
    input: string;
    output: string;
    provider: string;
    model: string;
    taskId?: string;
    tags?: string[];
  }): Promise<void>;

  /** 获取所有记忆记录 */
  loadAllRecords(): Promise<MemoryInteraction[]>;

  /**
   * 根据上下文搜索相关记忆
   * @param context 搜索上下文
   * @param limit 返回结果数量限制
   */
  recall(context: string, limit?: number): Promise<MemoryRecord[]>;

  /**
   * 获取最近对话
   * @param limit 返回结果数量限制
   */
  getRecent(limit?: number): Promise<Array<{
    input: string;
    output: string;
    time: string;
    skill: string;
  }>>;

  /** 获取记忆统计 */
  getStats(): Promise<MemoryStats>;

  /** 清空所有记忆 */
  clear(): Promise<void>;
}

// ============================================================
// 提供商工厂接口
// ============================================================

/**
 * LLM 提供商工厂接口
 */
export interface IProviderFactory {
  /** 获取指定类型的提供商实例 */
  getProvider(type: ProviderType): ILLMProvider | undefined;

  /** 获取默认提供商实例 */
  getDefaultProvider(): ILLMProvider | undefined;

  /** 列出所有可用的提供商 */
  listAvailableProviders(): ProviderType[];

  /** 检查提供商是否可用 */
  isProviderAvailable(type: ProviderType): boolean;
}

/**
 * LLM 提供商接口
 */
export interface ILLMProvider {
  /** 发送聊天请求 */
  chat(params: {
    model: string;
    messages: Array<{ role: string; content: string }>;
    temperature?: number;
    maxTokens?: number;
  }): Promise<{
    content: string;
    usage?: {
      promptTokens: number;
      completionTokens: number;
      totalTokens: number;
    };
  }>;

  /** 流式聊天请求 */
  stream(params: {
    model: string;
    messages: Array<{ role: string; content: string }>;
    temperature?: number;
    maxTokens?: number;
  }): AsyncGenerator<{
    content: string;
    done: boolean;
  }>;

  /** 检查提供商是否可用 */
  isAvailable(): Promise<boolean>;

  /** 获取提供商名称 */
  getName(): string;

  /** 列出可用模型 */
  listModels(): Promise<string[]>;
}

// ============================================================
// Git 管理器接口
// ============================================================

/**
 * Git 管理器接口
 */
export interface IGitManager {
  /** 检查当前目录是否为 Git 仓库 */
  isGitRepo(): Promise<boolean>;

  /** 获取当前分支 */
  getCurrentBranch(): Promise<string>;

  /** 检查是否有未提交的更改 */
  hasUncommittedChanges(): Promise<boolean>;

  /** 创建检查点（临时提交） */
  createCheckpoint(message: string): Promise<string>;

  /** 恢复到指定检查点 */
  restoreCheckpoint(commitHash: string): Promise<void>;

  /** 获取最近的提交历史 */
  getRecentCommits(limit?: number): Promise<Array<{
    hash: string;
    message: string;
    author: string;
    date: Date;
  }>>;
}

// ============================================================
// 工具注册表接口
// ============================================================

/**
 * 工具定义
 */
export interface Tool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  execute: (args: Record<string, unknown>) => Promise<unknown>;
}

/**
 * 工具注册表接口
 */
export interface IToolRegistry {
  /** 注册工具 */
  register(tool: Tool): void;

  /** 获取工具 */
  get(name: string): Tool | undefined;

  /** 列出所有工具 */
  listAll(): Tool[];

  /** 检查工具是否存在 */
  has(name: string): boolean;

  /** 执行工具 */
  execute(name: string, args: Record<string, unknown>): Promise<unknown>;
}

// ============================================================
// 插件加载器接口
// ============================================================

/**
 * 插件定义
 */
export interface Plugin {
  name: string;
  version: string;
  description?: string;
  activate: () => Promise<void>;
  deactivate?: () => Promise<void>;
}

/**
 * 插件加载器接口
 */
export interface IPluginLoader {
  /** 加载插件 */
  load(pluginPath: string): Promise<Plugin>;

  /** 卸载插件 */
  unload(pluginName: string): Promise<void>;

  /** 获取已加载的插件 */
  getPlugin(name: string): Plugin | undefined;

  /** 列出所有已加载的插件 */
  listPlugins(): Plugin[];

  /** 激活插件 */
  activatePlugin(name: string): Promise<void>;

  /** 停用插件 */
  deactivatePlugin(name: string): Promise<void>;
}

// ============================================================
// 历史管理器接口
// ============================================================

/**
 * 历史条目
 */
export interface HistoryEntry {
  id: string;
  command: string;
  args: Record<string, unknown>;
  result?: unknown;
  error?: string;
  timestamp: Date;
  duration: number;
}

/**
 * 历史管理器接口
 */
export interface IHistoryManager {
  /** 记录命令执行 */
  record(entry: Omit<HistoryEntry, 'id' | 'timestamp'>): Promise<HistoryEntry>;

  /** 获取历史记录 */
  getHistory(limit?: number): Promise<HistoryEntry[]>;

  /** 搜索历史记录 */
  search(query: string): Promise<HistoryEntry[]>;

  /** 清空历史 */
  clear(): Promise<void>;

  /** 导出历史 */
  export(format: 'json' | 'csv'): Promise<string>;
}
