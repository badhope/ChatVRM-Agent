/**
 * MCP (Model Context Protocol) 工具类型定义
 */

import type { ToolDefinition as BaseToolDefinition } from '../tools/registry.js';

/**
 * MCP 工具参数类型
 */
export type MCPToolParameterType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'array'
  | 'object'
  | 'string[]'
  | 'number[]';

/**
 * MCP 工具参数定义
 */
export interface MCPToolParameter {
  name: string;
  type: MCPToolParameterType;
  description: string;
  required: boolean;
  default?: unknown;
  enum?: string[];
}

/**
 * MCP 工具执行结果
 */
export interface MCPToolResult {
  success: boolean;
  output?: string;
  error?: string;
  data?: unknown;
  metadata?: Record<string, unknown>;
}

/**
 * MCP 工具定义
 */
export interface MCPToolDefinition {
  name: string;
  description: string;
  category: string;
  version: string;
  parameters: MCPToolParameter[];
  execute: (args: Record<string, unknown>) => Promise<MCPToolResult>;
  requiresConfirmation?: boolean;
  dangerous?: boolean;
}

/**
 * MCP 工具包定义
 */
export interface MCPToolPackage {
  name: string;
  version: string;
  description: string;
  category: string;
  author?: string;
  tools: MCPToolDefinition[];
  dependencies: string[];
  load?: () => Promise<void>;
  unload?: () => Promise<void>;
}

/**
 * 工具包元数据
 */
export interface ToolPackageMetadata {
  name: string;
  version: string;
  description: string;
  category: string;
  author?: string;
  toolNames: string[];
  dependencies: string[];
  path: string;
}

/**
 * 工具库索引
 */
export interface ToolLibraryIndex {
  version: string;
  lastUpdated: string;
  totalPackages: number;
  totalTools: number;
  categories: string[];
  packages: Record<string, ToolPackageMetadata>;
}

/**
 * 工具配置
 */
export interface ToolsConfig {
  version: string;
  installedPackages: string[];
  enabledTools: string[];
  disabledTools: string[];
  lastUpdated: string;
}

/**
 * 工具加载状态
 */
export interface ToolLoadStatus {
  packageName: string;
  toolNames: string[];
  loaded: boolean;
  error?: string;
}

/**
 * 工具执行上下文
 */
export interface ToolExecutionContext {
  userId?: string;
  sessionId?: string;
  timestamp: Date;
  permissions: string[];
}

/**
 * 工具权限级别
 */
export enum ToolPermissionLevel {
  SAFE = 'safe',
  RESTRICTED = 'restricted',
  DANGEROUS = 'dangerous',
  ADMIN = 'admin',
}

/**
 * 工具权限定义
 */
export interface ToolPermission {
  toolName: string;
  level: ToolPermissionLevel;
  requiresUserConfirmation: boolean;
  allowedPaths?: string[];
  blockedPaths?: string[];
}

/**
 * 工具执行日志
 */
export interface ToolExecutionLog {
  id: string;
  toolName: string;
  arguments: Record<string, unknown>;
  result: MCPToolResult;
  context: ToolExecutionContext;
  timestamp: Date;
  duration: number;
}

/**
 * 工具搜索选项
 */
export interface ToolSearchOptions {
  keyword?: string;
  category?: string;
  includeDisabled?: boolean;
  includeDangerous?: boolean;
}

/**
 * 工具过滤选项
 */
export interface ToolFilterOptions {
  categories?: string[];
  packages?: string[];
  excludeNames?: string[];
  permissionLevel?: ToolPermissionLevel;
}

/**
 * 工具注册事件
 */
export type ToolEvent =
  | { type: 'tool_registered'; tool: MCPToolDefinition }
  | { type: 'tool_unregistered'; toolName: string }
  | { type: 'package_loaded'; pkg: MCPToolPackage }
  | { type: 'package_unloaded'; packageName: string }
  | { type: 'tool_executed'; log: ToolExecutionLog };

/**
 * 工具事件监听器
 */
export type ToolEventListener = (event: ToolEvent) => void | Promise<void>;

/**
 * 与现有 ToolDefinition 的兼容类型
 */
export type CompatibleToolDefinition = BaseToolDefinition & {
  category?: string;
  version?: string;
  requiresConfirmation?: boolean;
  dangerous?: boolean;
};
