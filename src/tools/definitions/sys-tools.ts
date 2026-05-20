import { execFile } from 'child_process';
import { promisify } from 'util';
import os from 'os';
import path from 'path';
import fs from 'fs/promises';
import type { ToolDefinition } from '../registry.js';
import { formatBytes } from '../../utils/format.js';
import { getErrorMessage } from '../../utils/error-handling.js';

const execFileAsync = promisify(execFile);

// ==================== 辅助函数 ====================

// 改进的命令解析函数
function parseCommand(command: string): { cmd: string; args: string[] } {
  const trimmed = command.trim();
  if (!trimmed) {
    return { cmd: '', args: [] };
  }

  const args: string[] = [];
  let current = '';
  let inQuote = false;
  let quoteChar = '';

  for (let i = 0; i < trimmed.length; i++) {
    const char = trimmed[i];

    if (!inQuote && (char === '"' || char === "'")) {
      inQuote = true;
      quoteChar = char;
      continue;
    }

    if (inQuote && char === quoteChar) {
      inQuote = false;
      quoteChar = '';
      continue;
    }

    if (!inQuote && /\s/.test(char)) {
      if (current) {
        args.push(current);
        current = '';
      }
      continue;
    }

    current += char;
  }

  if (current) {
    args.push(current);
  }

  return {
    cmd: args[0] || '',
    args: args.slice(1),
  };
}

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const parts: string[] = [];
  if (days > 0) parts.push(`${days}天`);
  if (hours > 0) parts.push(`${hours}小时`);
  if (mins > 0) parts.push(`${mins}分钟`);
  return parts.join(' ') || '刚刚启动';
}

// ==================== Shell 工具 ====================

export const shellTool: ToolDefinition = {
  name: 'shell',
  description: '执行Shell命令',
  parameters: [
    { name: 'command', type: 'string', description: '要执行的命令', required: true },
    { name: 'cwd', type: 'string', description: '工作目录', required: false },
    { name: 'timeout', type: 'number', description: '超时时间(ms)', required: false },
  ],
  execute: async (args) => {
    if (!args || !args.command) {
      return { 
        success: false, 
        output: '', 
        error: '缺少必要参数: command' 
      };
    }
    const { checkShellCommand } = await import('../security.js');
    const check = checkShellCommand(args.command);
    if (!check.allowed) {
      return { 
        success: false, 
        output: '', 
        error: `安全拦截: ${check.reason}` 
      };
    }
    
    try {
      const timeout = args.timeout ? parseInt(args.timeout, 10) : 30000;
      const cwd = args.cwd || process.cwd();

      // === 防止目录遍历攻击：验证 cwd ===
      let cwdResolved: string;
      try {
        cwdResolved = path.resolve(cwd);
        const cwdStat = await fs.stat(cwdResolved);
        if (!cwdStat.isDirectory()) {
          return { success: false, output: '', error: 'cwd 必须是有效的目录路径' };
        }
      } catch {
        return { success: false, output: '', error: 'cwd 目录不存在或无法访问' };
      }

      // 解析命令和参数（使用 execFile 防止 shell 注入）
      const { cmd, args: cmdArgs } = parseCommand(args.command);

      if (!cmd) {
        return { success: false, output: '', error: '无法解析命令' };
      }

      const { stdout, stderr } = await execFileAsync(cmd, cmdArgs, {
        cwd: cwdResolved,
        timeout,
        maxBuffer: 10 * 1024 * 1024,
      });
      return { success: true, output: stdout + (stderr ? '\n--- STDERR ---\n' + stderr : '') };
    } catch (error: unknown) {
      const errorMsg = getErrorMessage(error);
      const errObj = error as { stdout?: string; stderr?: string };
      if (errorMsg.includes('maxBuffer')) {
        return { success: false, output: errObj.stdout || '', error: '命令输出超过缓冲区限制(10MB)，请使用分页或过滤参数' };
      }
      if (errorMsg.includes('ETIMEDOUT') || errorMsg.includes('timeout')) {
        return { success: false, output: errObj.stdout || '', error: '命令执行超时' };
      }
      return { success: false, output: errObj.stdout || '', error: errObj.stderr || errorMsg };
    }
  },
};

// ==================== 系统信息工具 ====================

export const sysInfoTool: ToolDefinition = {
  name: 'sysinfo',
  description: '获取系统信息（CPU、内存、磁盘、Node版本等）',
  parameters: [],
  execute: async () => {
    try {
      const cpus = os.cpus();
      const totalMem = formatBytes(os.totalmem());
      const freeMem = formatBytes(os.freemem());
      const usedMem = formatBytes(os.totalmem() - os.freemem());
      const hostname = os.hostname();
      const platform = `${os.type()} ${os.release()} ${os.arch()}`;
      const uptime = formatUptime(os.uptime());

      const lines = [
        `主机名: ${hostname}`,
        `平台: ${platform}`,
        `Node.js: ${process.version}`,
        `CPU: ${cpus[0]?.model || '未知'} \u00D7 ${cpus.length} 核`,
        `内存: ${usedMem} / ${totalMem} (可用 ${freeMem})`,
        `运行时间: ${uptime}`,
        `当前目录: ${process.cwd()}`,
        `用户: ${os.userInfo().username}`,
      ];

      return { success: true, output: lines.join('\n') };
    } catch (error: unknown) {
      return { success: false, output: '', error: getErrorMessage(error) };
    }
  },
};
