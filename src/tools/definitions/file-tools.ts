import fs from 'fs/promises';
import path from 'path';
import { glob } from 'glob';
import type { ToolDefinition } from '../registry.js';
import { formatBytes } from '../../utils/format.js';
import { getErrorMessage } from '../../utils/error-handling.js';

// ==================== 辅助函数 ====================

function validatePath(filePath: string): string {
  const resolved = path.resolve(filePath);
  
  // Unix system paths
  const unixBlocked = ['/etc', '/usr', '/bin', '/sbin', '/var', '/sys', '/proc', '/boot', '/dev'];
  
  // Windows system paths
  const windowsBlocked = ['C:\\Windows', 'C:\\Program Files', 'C:\\Program Files (x86)'];
  
  // Select blocked paths based on platform
  const allBlocked = process.platform === 'win32' 
    ? [...windowsBlocked, ...unixBlocked]
    : [...unixBlocked];
  
  for (const dir of allBlocked) {
    const separator = process.platform === 'win32' ? '\\' : '/';
    if (resolved.startsWith(dir + separator) || resolved === dir) {
      throw new Error(`Access denied: cannot operate on system path ${filePath}`);
    }
  }
  return resolved;
}

// ==================== 文件工具 ====================

export const readFileTool: ToolDefinition = {
  name: 'read_file',
  description: '读取文件内容',
  parameters: [
    { name: 'path', type: 'string', description: '文件路径', required: true },
  ],
  execute: async (args) => {
    try {
      const safePath = validatePath(args.path);
      const stat = await fs.stat(safePath);
      const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
      if (stat.size > MAX_FILE_SIZE) {
        return { success: false, output: '', error: `文件过大: ${stat.size} bytes (最大 ${MAX_FILE_SIZE} bytes)` };
      }
      const ext = safePath.toLowerCase();
      const binaryExts = ['.png','.jpg','.jpeg','.gif','.webp','.ico','.svg','.woff','.woff2','.ttf','.eot','.zip','.tar','.gz','.7z','.pdf','.exe','.dll','.so','.dylib','.node'];
      if (binaryExts.some(b => ext.endsWith(b))) {
        return { success: false, output: '', error: '不支持读取二进制文件' };
      }
      const content = await fs.readFile(safePath, 'utf-8');
      return { success: true, output: content, _meta: `(${stat.size} bytes)` };
    } catch (error: unknown) {
      return { success: false, output: '', error: `读取失败: ${getErrorMessage(error)}` };
    }
  },
};

export const writeFileTool: ToolDefinition = {
  name: 'write_file',
  description: '写入文件内容',
  parameters: [
    { name: 'path', type: 'string', description: '文件路径', required: true },
    { name: 'content', type: 'string', description: '文件内容', required: true },
  ],
  execute: async (args) => {
    try {
      const safePath = validatePath(args.path);
      await fs.mkdir(path.dirname(safePath), { recursive: true });
      await fs.writeFile(safePath, args.content);
      const stat = await fs.stat(safePath);
      return { success: true, output: `文件已写入: ${args.path} (${stat.size} bytes)` };
    } catch (error: unknown) {
      return { success: false, output: '', error: `写入失败: ${getErrorMessage(error)}` };
    }
  },
};

export const searchFilesTool: ToolDefinition = {
  name: 'search_files',
  description: '在目录中搜索文件内容',
  parameters: [
    { name: 'pattern', type: 'string', description: '搜索模式（正则表达式）', required: true },
    { name: 'path', type: 'string', description: '搜索目录', required: true },
    { name: 'file_pattern', type: 'string', description: '文件匹配模式', required: false },
  ],
  execute: async (args) => {
    try {
      const files = await glob(args.file_pattern || '**/*', {
        cwd: args.path,
        ignore: ['**/node_modules/**', '**/dist/**', '**/.git/**'],
      });
      
      // Validate regex pattern for potential ReDoS
      const MAX_PATTERN_LENGTH = 100;
      if (args.pattern.length > MAX_PATTERN_LENGTH) {
        return { success: false, output: '', error: `Regex pattern too long (max ${MAX_PATTERN_LENGTH} characters)` };
      }
      // Check for nested quantifiers that can cause ReDoS
      if (/\+|\*/.test(args.pattern) && /\([^)]*[+*][^)]*\)[+*]/.test(args.pattern)) {
        return { success: false, output: '', error: 'Regex pattern contains potentially dangerous nested quantifiers' };
      }
      
      const regex = new RegExp(args.pattern, 'gi');
      const results: string[] = [];
      const MAX_RESULTS = 200;     // 最大结果数
      const MAX_FILE_SIZE = 1024 * 1024; // 最大读取文件大小 1MB
      const MAX_LINE_LENGTH = 200;  // 最大行长度
      let totalMatches = 0;

      for (const file of files.slice(0, 100)) {
        const filePath = path.join(args.path, file);
        try {
          const stat = await fs.stat(filePath);
          // 跳过过大的文件
          if (stat.size > MAX_FILE_SIZE) {
            continue;
          }
          const content = await fs.readFile(filePath, 'utf-8');
          const lines = content.split('\n');
          for (let i = 0; i < lines.length; i++) {
            if (regex.test(lines[i])) {
              totalMatches++;
              const line = lines[i].trim().slice(0, MAX_LINE_LENGTH);
              results.push(`${filePath}:${i + 1}: ${line}`);
              // 超过最大结果数时截断
              if (results.length >= MAX_RESULTS) {
                results.push(`...(结果已截断，共找到 ${totalMatches} 处匹配)`);
                break;
              }
            }
            regex.lastIndex = 0;
          }
        } catch (error) {
          // Skip files that cannot be read
        }
        // 结果过多时提前终止
        if (results.length >= MAX_RESULTS) break;
      }

      return { success: true, output: results.length > 0 ? results.join('\n') : '未找到匹配结果' };
    } catch (error: unknown) {
      return { success: false, output: '', error: `搜索失败: ${getErrorMessage(error)}` };
    }
  },
};

export const listDirTool: ToolDefinition = {
  name: 'list_dir',
  description: '列出目录内容',
  parameters: [
    { name: 'path', type: 'string', description: '目录路径', required: true },
  ],
  execute: async (args) => {
    try {
      const safePath = validatePath(args.path);
      const entries = await fs.readdir(safePath, { withFileTypes: true });
      const content = entries.map(e => {
        const type = e.isDirectory() ? '\uD83D\uDCC1' : e.isFile() ? '\uD83D\uDCC4' : '\uD83D\uDD17';
        return `${type} ${e.name}`;
      }).join('\n');
      return { success: true, output: content };
    } catch (error: unknown) {
      return { success: false, output: '', error: `列出目录失败: ${getErrorMessage(error)}` };
    }
  },
};

export const fileTreeTool: ToolDefinition = {
  name: 'file_tree',
  description: '显示目录文件树',
  parameters: [
    { name: 'path', type: 'string', description: '目录路径', required: true },
    { name: 'depth', type: 'number', description: '最大深度', required: false },
  ],
  execute: async (args) => {
    const safePath = validatePath(args.path);
    const maxDepth = args.depth ? parseInt(args.depth, 10) : 3;
    const ignore = ['node_modules', 'dist', '.git', 'coverage', 'build'];

    async function buildTree(currentPath: string, prefix: string, depth: number): Promise<string> {
      if (depth > maxDepth) return '';
      let result = '';
      const entries = await fs.readdir(currentPath, { withFileTypes: true });
      const sorted = entries
        .filter(e => !ignore.includes(e.name) && !e.name.startsWith('.'))
        .sort((a, b) => {
          if (a.isDirectory() && !b.isDirectory()) return -1;
          if (!a.isDirectory() && b.isDirectory()) return 1;
          return a.name.localeCompare(b.name);
        });

      for (let index = 0; index < sorted.length; index++) {
        const entry = sorted[index];
        const isLast = index === sorted.length - 1;
        const connector = isLast ? '\u2514\u2500\u2500 ' : '\u251C\u2500\u2500 ';
        const childPrefix = isLast ? '    ' : '\u2502   ';
        if (entry.isDirectory()) {
          result += `${prefix}${connector}\uD83D\uDCC1 ${entry.name}\n`;
          result += await buildTree(path.join(currentPath, entry.name), prefix + childPrefix, depth + 1);
        } else {
          result += `${prefix}${connector}\uD83D\uDCC4 ${entry.name}\n`;
        }
      }
      return result;
    }

    const dirName = path.basename(args.path);
    const tree = await buildTree(safePath, '', 0);
    return { success: true, output: `\uD83D\uDCC1 ${dirName}\n${tree}` };
  },
};

export const fileInfoTool: ToolDefinition = {
  name: 'file_info',
  description: '获取文件详细信息',
  parameters: [
    { name: 'path', type: 'string', description: '文件路径', required: true },
  ],
  execute: async (args) => {
    try {
      // === 添加路径验证 ===
      const safePath = validatePath(args.path);
      const stat = await fs.stat(safePath);
      const ext = path.extname(safePath).slice(1);
      const content = [
        `路径: ${safePath}`,
        `大小: ${formatBytes(stat.size)}`,
        `类型: ${ext || '未知'}`,
        `修改时间: ${stat.mtime.toLocaleString('zh-CN')}`,
        `是否目录: ${stat.isDirectory() ? '是' : '否'}`,
      ].join('\n');
      return { success: true, output: content };
    } catch (error: unknown) {
      return { success: false, output: '', error: `获取信息失败: ${getErrorMessage(error)}` };
    }
  },
};

export const deleteFileTool: ToolDefinition = {
  name: 'delete_file',
  description: '删除文件或目录（危险操作，需要确认）',
  parameters: [
    { name: 'path', type: 'string', description: '文件或目录路径', required: true },
    { name: 'recursive', type: 'boolean', description: '是否递归删除目录', required: false },
    { name: 'confirm', type: 'boolean', description: '确认删除（必须为true才能执行）', required: false },
  ],
  execute: async (args) => {
    try {
      const safePath = validatePath(args.path);
      const stat = await fs.stat(safePath);

      // === 危险操作保护：强制要求确认 ===
      const confirmArg = args.confirm as boolean | string | undefined;
      const confirmValue = confirmArg === true || confirmArg === 'true';
      if (!confirmValue) {
        const isDirectory = stat.isDirectory();
        const recursiveArg = args.recursive as boolean | string | undefined;
        const isRecursive = recursiveArg === true || recursiveArg === 'true';

        return {
          success: false,
          output: '',
          error: `危险操作！删除${isDirectory ? '目录' : '文件'}需要确认。请设置 confirm=true 参数。${isRecursive ? ' 递归删除危险度更高！' : ''}`,
          warning: `即将删除: ${args.path}${isDirectory && isRecursive ? ' (递归)' : ''}`,
        };
      }

      // 递归删除目录
      if (stat.isDirectory()) {
        const recursiveArg = args.recursive as boolean | string | undefined;
        const recursiveValue = recursiveArg === true || recursiveArg === 'true';
        if (recursiveValue) {
          await fs.rm(safePath, { recursive: true });
        } else {
          return { success: false, output: '', error: '目录需要 recursive=true 参数' };
        }
      } else {
        await fs.unlink(safePath);
      }
      return { success: true, output: `已删除: ${args.path}` };
    } catch (error: unknown) {
      return { success: false, output: '', error: `删除失败: ${getErrorMessage(error)}` };
    }
  },
};
