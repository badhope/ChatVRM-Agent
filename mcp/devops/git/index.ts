/**
 * Git 工具包
 * 提供 Git 仓库操作的工具
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import type { MCPToolPackage, MCPToolDefinition, MCPToolResult } from '../../../src/types/mcp.js';

const execAsync = promisify(exec);

/**
 * 执行 Git 命令
 */
async function runGitCommand(cwd: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  const command = ['git', ...args].join(' ');
  return execAsync(command, { cwd });
}

/**
 * Git 状态
 */
const gitStatusTool: MCPToolDefinition = {
  name: 'git_status',
  description: '查看 Git 仓库状态',
  category: 'devops',
  version: '1.0.0',
  parameters: [
    {
      name: 'path',
      type: 'string',
      description: 'Git 仓库路径',
      required: false,
      default: '.',
    },
  ],
  execute: async (args: Record<string, unknown>): Promise<MCPToolResult> => {
    try {
      const repoPath = path.resolve(args.path as string || '.');
      const { stdout } = await runGitCommand(repoPath, ['status']);
      return {
        success: true,
        output: stdout,
        metadata: { path: repoPath },
      };
    } catch (error: unknown) {
      return {
        success: false,
        error: `Failed to get git status: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  },
};

/**
 * Git 添加文件
 */
const gitAddTool: MCPToolDefinition = {
  name: 'git_add',
  description: '添加文件到暂存区',
  category: 'devops',
  version: '1.0.0',
  parameters: [
    {
      name: 'path',
      type: 'string',
      description: '文件路径或通配符',
      required: true,
    },
    {
      name: 'repoPath',
      type: 'string',
      description: 'Git 仓库路径',
      required: false,
      default: '.',
    },
  ],
  execute: async (args: Record<string, unknown>): Promise<MCPToolResult> => {
    try {
      const repoPath = path.resolve(args.repoPath as string || '.');
      const filePath = args.path as string;
      const { stdout } = await runGitCommand(repoPath, ['add', filePath]);
      return {
        success: true,
        output: `Successfully added ${filePath}`,
        metadata: { path: repoPath, files: filePath },
      };
    } catch (error: unknown) {
      return {
        success: false,
        error: `Failed to add files: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  },
};

/**
 * Git 提交
 */
const gitCommitTool: MCPToolDefinition = {
  name: 'git_commit',
  description: '提交变更',
  category: 'devops',
  version: '1.0.0',
  parameters: [
    {
      name: 'message',
      type: 'string',
      description: '提交信息',
      required: true,
    },
    {
      name: 'repoPath',
      type: 'string',
      description: 'Git 仓库路径',
      required: false,
      default: '.',
    },
  ],
  requiresConfirmation: true,
  execute: async (args: Record<string, unknown>): Promise<MCPToolResult> => {
    try {
      const repoPath = path.resolve(args.repoPath as string || '.');
      const message = args.message as string;
      const { stdout } = await runGitCommand(repoPath, ['commit', '-m', message]);
      return {
        success: true,
        output: stdout,
        metadata: { path: repoPath, message },
      };
    } catch (error: unknown) {
      return {
        success: false,
        error: `Failed to commit: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  },
};

/**
 * Git 推送
 */
const gitPushTool: MCPToolDefinition = {
  name: 'git_push',
  description: '推送到远程仓库',
  category: 'devops',
  version: '1.0.0',
  parameters: [
    {
      name: 'remote',
      type: 'string',
      description: '远程仓库名称',
      required: false,
      default: 'origin',
    },
    {
      name: 'branch',
      type: 'string',
      description: '分支名称',
      required: false,
    },
    {
      name: 'repoPath',
      type: 'string',
      description: 'Git 仓库路径',
      required: false,
      default: '.',
    },
  ],
  requiresConfirmation: true,
  dangerous: true,
  execute: async (args: Record<string, unknown>): Promise<MCPToolResult> => {
    try {
      const repoPath = path.resolve(args.repoPath as string || '.');
      const remote = args.remote as string || 'origin';
      const branch = args.branch as string;

      const pushArgs = ['push', remote];
      if (branch) {
        pushArgs.push(branch);
      }

      const { stdout } = await runGitCommand(repoPath, pushArgs);
      return {
        success: true,
        output: stdout,
        metadata: { path: repoPath, remote, branch },
      };
    } catch (error: unknown) {
      return {
        success: false,
        error: `Failed to push: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  },
};

/**
 * Git 拉取
 */
const gitPullTool: MCPToolDefinition = {
  name: 'git_pull',
  description: '从远程仓库拉取最新变更',
  category: 'devops',
  version: '1.0.0',
  parameters: [
    {
      name: 'remote',
      type: 'string',
      description: '远程仓库名称',
      required: false,
      default: 'origin',
    },
    {
      name: 'branch',
      type: 'string',
      description: '分支名称',
      required: false,
    },
    {
      name: 'repoPath',
      type: 'string',
      description: 'Git 仓库路径',
      required: false,
      default: '.',
    },
  ],
  requiresConfirmation: true,
  execute: async (args: Record<string, unknown>): Promise<MCPToolResult> => {
    try {
      const repoPath = path.resolve(args.repoPath as string || '.');
      const remote = args.remote as string || 'origin';

      const pullArgs = ['pull', remote];
      if (args.branch) {
        pullArgs.push(args.branch as string);
      }

      const { stdout } = await runGitCommand(repoPath, pullArgs);
      return {
        success: true,
        output: stdout,
        metadata: { path: repoPath, remote, branch: args.branch },
      };
    } catch (error: unknown) {
      return {
        success: false,
        error: `Failed to pull: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  },
};

/**
 * Git 查看日志
 */
const gitLogTool: MCPToolDefinition = {
  name: 'git_log',
  description: '查看提交历史',
  category: 'devops',
  version: '1.0.0',
  parameters: [
    {
      name: 'limit',
      type: 'number',
      description: '显示最近的 N 条记录',
      required: false,
      default: 10,
    },
    {
      name: 'repoPath',
      type: 'string',
      description: 'Git 仓库路径',
      required: false,
      default: '.',
    },
  ],
  execute: async (args: Record<string, unknown>): Promise<MCPToolResult> => {
    try {
      const repoPath = path.resolve(args.repoPath as string || '.');
      const limit = args.limit as number || 10;
      const { stdout } = await runGitCommand(repoPath, ['log', `-${limit}`, '--oneline']);
      return {
        success: true,
        output: stdout,
        metadata: { path: repoPath, limit },
      };
    } catch (error: unknown) {
      return {
        success: false,
        error: `Failed to get git log: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  },
};

/**
 * 工具包定义
 */
const gitPackage: MCPToolPackage = {
  name: 'git',
  version: '1.0.0',
  description: 'Git 仓库操作工具包，提供状态查看、添加、提交、推送、拉取等功能',
  category: 'devops',
  author: 'Personal Assistant',
  tools: [
    gitStatusTool,
    gitAddTool,
    gitCommitTool,
    gitPushTool,
    gitPullTool,
    gitLogTool,
  ],
  dependencies: [],
};

export default gitPackage;
