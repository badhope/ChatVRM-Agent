import 'reflect-metadata';
import { injectable } from 'tsyringe';
import {
  readFileTool,
  writeFileTool,
  searchFilesTool,
  listDirTool,
  fileTreeTool,
  fileInfoTool,
  deleteFileTool,
} from './definitions/file-tools.js';
import { shellTool, sysInfoTool } from './definitions/sys-tools.js';
import { httpTool, jsonTool, textTool, hashTool } from './definitions/data-tools.js';
import { toolLogger } from '../services/logger.js';


// ============================================================
// 接口定义
// ============================================================

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    name: string;
    type: string;
    description: string;
    required: boolean;
  }[];
  execute: (args: Record<string, string>) => Promise<ToolResult>;
}

export interface ToolResult {
  success: boolean;
  output: string;
  error?: string;
  [key: string]: unknown; // 允许额外元数据
}

// ============================================================
// 工具注册表类
// ============================================================

/**
 * 工具注册表
 * 管理所有可用工具的注册、查询和执行
 */
@injectable()
export class ToolRegistry {
  private tools: Map<string, ToolDefinition> = new Map();

  constructor() {
    this.registerDefaultTools();
  }

  /**
   * 注册默认工具
   */
  private registerDefaultTools(): void {
    // Shell
    this.register(shellTool);
    // 文件操作
    this.register(readFileTool);
    this.register(writeFileTool);
    this.register(searchFilesTool);
    this.register(listDirTool);
    this.register(fileTreeTool);
    this.register(fileInfoTool);
    this.register(deleteFileTool);
    // 实用工具
    this.register(sysInfoTool);
    this.register(httpTool);
    this.register(jsonTool);
    this.register(textTool);
    this.register(hashTool);
  }

  /**
   * 注册工具
   */
  register(tool: ToolDefinition): void {
    this.tools.set(tool.name, tool);
    toolLogger.debug({ tool: tool.name }, 'Tool registered');
  }

  /**
   * 注销工具
   */
  unregister(name: string): boolean {
    const existed = this.tools.delete(name);
    if (existed) {
      toolLogger.debug({ tool: name }, 'Tool unregistered');
    }
    return existed;
  }

  /**
   * 获取工具
   */
  get(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  /**
   * 检查工具是否存在
   */
  has(name: string): boolean {
    return this.tools.has(name);
  }

  /**
   * 获取内部工具 Map（向后兼容）
   * 返回 ReadonlyMap 类型以表明不应直接修改
   */
  get toolsMap(): ReadonlyMap<string, ToolDefinition> {
    return this.tools;
  }

  /**
   * 列出所有工具
   */
  listAll(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  /**
   * 执行工具
   */
  async execute(name: string, args: Record<string, string>): Promise<ToolResult> {
    const tool = this.tools.get(name);
    if (!tool) {
      toolLogger.warn({ tool: name }, 'Unknown tool requested');
      return {
        success: false,
        output: '',
        error: `未知工具: ${name}。可用工具: ${[...this.tools.keys()].join(', ')}`,
      };
    }
    toolLogger.debug({ tool: name, args }, 'Executing tool');
    const result = await tool.execute(args);
    if (result.success) {
      toolLogger.info({ tool: name }, 'Tool executed successfully');
    } else {
      toolLogger.error({ tool: name, error: result.error }, 'Tool execution failed');
    }
    return result;
  }

  /**
   * 获取所有工具定义（用于AI function calling）
   */
  getToolDefinitions(): Array<{
    type: 'function';
    function: {
      name: string;
      description: string;
      parameters: {
        type: 'object';
        properties: Record<string, { type: string; description: string }>;
        required: string[];
      };
    };
  }> {
    return Array.from(this.tools.values()).map(tool => ({
      type: 'function' as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: {
          type: 'object',
          properties: Object.fromEntries(
            tool.parameters.map(p => [p.name, { type: p.type, description: p.description }])
          ),
          required: tool.parameters.filter(p => p.required).map(p => p.name),
        },
      },
    }));
  }

  /**
   * 列出所有工具（带分类）
   */
  listTools(): Array<{
    name: string;
    description: string;
    category: string;
  }> {
    const tools: Array<{ name: string; description: string; category: string }> = [];

    for (const [name, tool] of this.tools) {
      tools.push({
        name,
        description: tool.description,
        category: name.includes('file') || name.includes('dir') || name.includes('tree')
          ? '文件操作'
          : name === 'shell'
            ? '系统命令'
            : name === 'http'
              ? '网络'
              : '实用工具',
      });
    }

    return tools;
  }
}

// ============================================================
// 全局单例
// ============================================================

/** 全局工具注册表单例 */
export const toolRegistry = new ToolRegistry();
