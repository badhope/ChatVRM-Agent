/**
 * 文件系统工具包
 * 提供文件和目录操作的工具
 */

import fs from 'fs/promises';
import path from 'path';
import type { MCPToolPackage, MCPToolDefinition, MCPToolResult } from '../../../src/types/mcp.js';

/**
 * 验证路径是否安全
 */
function validatePath(filePath: string): string {
  const resolved = path.resolve(filePath);

  // 阻止访问系统关键目录
  const blockedPaths = [
    '/etc',
    '/usr',
    '/bin',
    '/sbin',
    '/var',
    '/sys',
    '/proc',
    '/boot',
    '/dev',
    'C:\\Windows',
    'C:\\Program Files',
    'C:\\Program Files (x86)',
  ];

  for (const blocked of blockedPaths) {
    if (resolved.startsWith(blocked + path.sep) || resolved === blocked) {
      throw new Error(`Access denied: Cannot operate on system path ${filePath}`);
    }
  }

  return resolved;
}

/**
 * 复制文件
 */
const copyFileTool: MCPToolDefinition = {
  name: 'copy_file',
  description: '复制文件或目录',
  category: 'utilities',
  version: '1.0.0',
  parameters: [
    {
      name: 'source',
      type: 'string',
      description: '源文件或目录路径',
      required: true,
    },
    {
      name: 'destination',
      type: 'string',
      description: '目标路径',
      required: true,
    },
    {
      name: 'overwrite',
      type: 'boolean',
      description: '是否覆盖已存在的文件',
      required: false,
      default: false,
    },
  ],
  execute: async (args: Record<string, unknown>): Promise<MCPToolResult> => {
    try {
      const source = validatePath(args.source as string);
      const destination = validatePath(args.destination as string);
      const overwrite = args.overwrite as boolean | undefined;

      // 检查源是否存在
      await fs.access(source);

      // 如果目标存在且不覆盖，则报错
      if (!overwrite) {
        try {
          await fs.access(destination);
          return {
            success: false,
            error: `Destination already exists: ${destination}. Use overwrite=true to overwrite.`,
          };
        } catch {
          // 目标不存在，继续
        }
      }

      // 确保目标目录存在
      await fs.mkdir(path.dirname(destination), { recursive: true });

      // 复制
      await fs.cp(source, destination, { recursive: true, force: overwrite });

      return {
        success: true,
        output: `Successfully copied ${source} to ${destination}`,
        metadata: { source, destination, overwrite },
      };
    } catch (error: unknown) {
      return {
        success: false,
        error: `Failed to copy file: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  },
};

/**
 * 移动文件
 */
const moveFileTool: MCPToolDefinition = {
  name: 'move_file',
  description: '移动或重命名文件或目录',
  category: 'utilities',
  version: '1.0.0',
  parameters: [
    {
      name: 'source',
      type: 'string',
      description: '源文件或目录路径',
      required: true,
    },
    {
      name: 'destination',
      type: 'string',
      description: '目标路径',
      required: true,
    },
    {
      name: 'overwrite',
      type: 'boolean',
      description: '是否覆盖已存在的文件',
      required: false,
      default: false,
    },
  ],
  requiresConfirmation: true,
  dangerous: true,
  execute: async (args: Record<string, unknown>): Promise<MCPToolResult> => {
    try {
      const source = validatePath(args.source as string);
      const destination = validatePath(args.destination as string);
      const overwrite = args.overwrite as boolean | undefined;

      // 检查源是否存在
      await fs.access(source);

      // 如果目标存在且不覆盖，则报错
      if (!overwrite) {
        try {
          await fs.access(destination);
          return {
            success: false,
            error: `Destination already exists: ${destination}. Use overwrite=true to overwrite.`,
          };
        } catch {
          // 目标不存在，继续
        }
      }

      // 确保目标目录存在
      await fs.mkdir(path.dirname(destination), { recursive: true });

      // 移动
      await fs.rename(source, destination);

      return {
        success: true,
        output: `Successfully moved ${source} to ${destination}`,
        metadata: { source, destination, overwrite },
      };
    } catch (error: unknown) {
      return {
        success: false,
        error: `Failed to move file: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  },
};

/**
 * 重命名文件
 */
const renameFileTool: MCPToolDefinition = {
  name: 'rename_file',
  description: '重命名文件或目录',
  category: 'utilities',
  version: '1.0.0',
  parameters: [
    {
      name: 'path',
      type: 'string',
      description: '文件或目录路径',
      required: true,
    },
    {
      name: 'newName',
      type: 'string',
      description: '新名称',
      required: true,
    },
  ],
  requiresConfirmation: true,
  dangerous: true,
  execute: async (args: Record<string, unknown>): Promise<MCPToolResult> => {
    try {
      const filePath = validatePath(args.path as string);
      const newName = args.newName as string;

      const dir = path.dirname(filePath);
      const newPath = path.join(dir, newName);

      // 检查源是否存在
      await fs.access(filePath);

      // 重命名
      await fs.rename(filePath, newPath);

      return {
        success: true,
        output: `Successfully renamed ${filePath} to ${newPath}`,
        metadata: { oldPath: filePath, newPath },
      };
    } catch (error: unknown) {
      return {
        success: false,
        error: `Failed to rename file: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  },
};

/**
 * 创建目录
 */
const makeDirTool: MCPToolDefinition = {
  name: 'make_dir',
  description: '创建目录',
  category: 'utilities',
  version: '1.0.0',
  parameters: [
    {
      name: 'path',
      type: 'string',
      description: '目录路径',
      required: true,
    },
    {
      name: 'recursive',
      type: 'boolean',
      description: '是否递归创建父目录',
      required: false,
      default: true,
    },
  ],
  execute: async (args: Record<string, unknown>): Promise<MCPToolResult> => {
    try {
      const dirPath = validatePath(args.path as string);
      const recursive = args.recursive as boolean | undefined ?? true;

      await fs.mkdir(dirPath, { recursive });

      return {
        success: true,
        output: `Successfully created directory: ${dirPath}`,
        metadata: { path: dirPath, recursive },
      };
    } catch (error: unknown) {
      return {
        success: false,
        error: `Failed to create directory: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  },
};

/**
 * 修改文件权限
 */
const chmodFileTool: MCPToolDefinition = {
  name: 'chmod_file',
  description: '修改文件或目录权限',
  category: 'utilities',
  version: '1.0.0',
  parameters: [
    {
      name: 'path',
      type: 'string',
      description: '文件或目录路径',
      required: true,
    },
    {
      name: 'mode',
      type: 'string',
      description: '权限模式（如 755、644）',
      required: true,
    },
  ],
  requiresConfirmation: true,
  dangerous: true,
  execute: async (args: Record<string, unknown>): Promise<MCPToolResult> => {
    try {
      const filePath = validatePath(args.path as string);
      const mode = args.mode as string;

      // 将字符串转换为八进制数
      const modeNum = parseInt(mode, 8);

      await fs.chmod(filePath, modeNum);

      return {
        success: true,
        output: `Successfully changed permissions of ${filePath} to ${mode}`,
        metadata: { path: filePath, mode },
      };
    } catch (error: unknown) {
      return {
        success: false,
        error: `Failed to change permissions: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  },
};

/**
 * 检查文件是否存在
 */
const fileExistsTool: MCPToolDefinition = {
  name: 'file_exists',
  description: '检查文件或目录是否存在',
  category: 'utilities',
  version: '1.0.0',
  parameters: [
    {
      name: 'path',
      type: 'string',
      description: '文件或目录路径',
      required: true,
    },
  ],
  execute: async (args: Record<string, unknown>): Promise<MCPToolResult> => {
    try {
      const filePath = validatePath(args.path as string);

      try {
        const stats = await fs.stat(filePath);
        return {
          success: true,
          output: `Path exists: ${filePath}`,
          data: {
            exists: true,
            isFile: stats.isFile(),
            isDirectory: stats.isDirectory(),
            size: stats.size,
            modified: stats.mtime.toISOString(),
          },
          metadata: { path: filePath },
        };
      } catch {
        return {
          success: true,
          output: `Path does not exist: ${filePath}`,
          data: { exists: false },
          metadata: { path: filePath },
        };
      }
    } catch (error: unknown) {
      return {
        success: false,
        error: `Failed to check file existence: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  },
};

/**
 * 工具包定义
 */
const filesystemPackage: MCPToolPackage = {
  name: 'filesystem',
  version: '1.0.0',
  description: '文件系统操作工具包，提供文件和目录的复制、移动、重命名、创建等功能',
  category: 'utilities',
  author: 'Personal Assistant',
  tools: [
    copyFileTool,
    moveFileTool,
    renameFileTool,
    makeDirTool,
    chmodFileTool,
    fileExistsTool,
  ],
  dependencies: [],
};

export default filesystemPackage;
