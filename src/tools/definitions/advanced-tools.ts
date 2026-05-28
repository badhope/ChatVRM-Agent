import fs from 'fs/promises';
import path from 'path';
import type { ToolDefinition, ToolResult } from '../registry.js';
import { getErrorMessage } from '../../utils/error-handling.js';

function validatePath(filePath: string): string {
  const resolved = path.resolve(filePath);
  const unixBlocked = ['/etc', '/usr', '/bin', '/sbin', '/var', '/sys', '/proc', '/boot', '/dev'];
  const windowsBlocked = ['C:\\Windows', 'C:\\Program Files', 'C:\\Program Files (x86)'];
  const allBlocked = process.platform === 'win32' ? [...windowsBlocked, ...unixBlocked] : [...unixBlocked];

  for (const dir of allBlocked) {
    const separator = process.platform === 'win32' ? '\\' : '/';
    if (resolved.startsWith(dir + separator) || resolved === dir) {
      throw new Error(`Access denied: cannot operate on system path ${filePath}`);
    }
  }
  return resolved;
}

export const batchReadTool: ToolDefinition = {
  name: 'batch_read',
  description: '批量读取多个文件内容',
  parameters: [
    { name: 'paths', type: 'string', description: '文件路径列表（JSON数组）', required: true },
    { name: 'separator', type: 'string', description: '文件内容分隔符', required: false },
  ],
  execute: async (args): Promise<ToolResult> => {
    try {
      const paths = JSON.parse(args.paths) as string[];
      if (!Array.isArray(paths) || paths.length === 0) {
        return { success: false, output: '', error: 'paths必须是有效的非空数组' };
      }

      const separator = args.separator || '\n' + '='.repeat(80) + '\n';
      const results: string[] = [];
      const errors: string[] = [];

      for (let index = 0; index < paths.length; index++) {
        const filePath = paths[index];
        try {
          const safePath = validatePath(filePath);
          const content = await fs.readFile(safePath, 'utf-8');
          results.push(`📄 ${filePath}\n${content}`);
        } catch (error) {
          errors.push(`❌ ${filePath}: ${getErrorMessage(error)}`);
        }
      }

      const output = results.join(separator);
      const errorMsg = errors.length > 0 ? `\n\n${errors.join('\n')}` : '';

      return {
        success: errors.length === 0,
        output: `${output}${errorMsg}\n\n总计: ${results.length} 成功, ${errors.length} 失败`,
      };
    } catch (error) {
      return { success: false, output: '', error: `批量读取失败: ${getErrorMessage(error)}` };
    }
  },
};

export const batchWriteTool: ToolDefinition = {
  name: 'batch_write',
  description: '批量写入多个文件',
  parameters: [
    { name: 'files', type: 'string', description: '文件数据（JSON数组: [{path, content}]）', required: true },
  ],
  execute: async (args): Promise<ToolResult> => {
    try {
      const files = JSON.parse(args.files) as Array<{ path: string; content: string }>;
      if (!Array.isArray(files) || files.length === 0) {
        return { success: false, output: '', error: 'files必须是有效的非空数组' };
      }

      const results: string[] = [];
      const errors: string[] = [];

      for (const file of files) {
        try {
          const safePath = validatePath(file.path);
          await fs.mkdir(path.dirname(safePath), { recursive: true });
          await fs.writeFile(safePath, file.content);
          results.push(`✅ ${file.path}`);
        } catch (error) {
          errors.push(`❌ ${file.path}: ${getErrorMessage(error)}`);
        }
      }

      const errorMsg = errors.length > 0 ? `\n\n${errors.join('\n')}` : '';

      return {
        success: errors.length === 0,
        output: `${results.join('\n')}${errorMsg}\n\n总计: ${results.length} 成功, ${errors.length} 失败`,
      };
    } catch (error) {
      return { success: false, output: '', error: `批量写入失败: ${getErrorMessage(error)}` };
    }
  },
};

export const copyMoveTool: ToolDefinition = {
  name: 'copy_move',
  description: '复制或移动文件/目录',
  parameters: [
    { name: 'operation', type: 'string', description: '操作类型: copy|move', required: true },
    { name: 'source', type: 'string', description: '源路径', required: true },
    { name: 'destination', type: 'string', description: '目标路径', required: true },
  ],
  execute: async (args): Promise<ToolResult> => {
    try {
      const safeSource = validatePath(args.source);
      const safeDest = validatePath(args.destination);
      const operation = args.operation.toLowerCase();

      if (operation === 'copy') {
        const stat = await fs.stat(safeSource);
        if (stat.isDirectory()) {
          await copyDirectory(safeSource, safeDest);
        } else {
          await fs.copyFile(safeSource, safeDest);
        }
        return { success: true, output: `✅ 已复制: ${args.source} → ${args.destination}` };
      } else if (operation === 'move') {
        await fs.rename(safeSource, safeDest);
        return { success: true, output: `✅ 已移动: ${args.source} → ${args.destination}` };
      } else {
        return { success: false, output: '', error: 'operation 必须是 copy 或 move' };
      }
    } catch (error) {
      return { success: false, output: '', error: `操作失败: ${getErrorMessage(error)}` };
    }
  },
};

async function copyDirectory(src: string, dest: string): Promise<void> {
  await fs.mkdir(dest, { recursive: true });
  const entries = await fs.readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      await copyDirectory(srcPath, destPath);
    } else {
      await fs.copyFile(srcPath, destPath);
    }
  }
}
