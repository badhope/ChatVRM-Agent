import fs from 'fs/promises';
import fsCb from 'fs';
import path from 'path';
import { glob } from 'glob';
import { formatBytes } from '../utils/format.js';

export interface FileResult {
  success: boolean;
  path: string;
  content?: string;
  size?: number;
  error?: string;
}

export interface SearchResult {
  filePath: string;
  line: number;
  content: string;
  matchStart: number;
  matchEnd: number;
}

// 读取文件
export async function readFile(filePath: string, encoding: BufferEncoding = 'utf-8'): Promise<FileResult> {
  try {
    const content = await fs.readFile(filePath, encoding);
    const stat = await fs.stat(filePath);
    return { success: true, path: filePath, content, size: stat.size };
  } catch (error) {
    return { success: false, path: filePath, error: `读取失败: ${error}` };
  }
}

// 写入文件
export async function writeFile(filePath: string, content: string): Promise<FileResult> {
  try {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, content);
    const stat = await fs.stat(filePath);
    return { success: true, path: filePath, size: stat.size };
  } catch (error) {
    return { success: false, path: filePath, error: `写入失败: ${error}` };
  }
}

// 追加文件
export async function appendFile(filePath: string, content: string): Promise<FileResult> {
  try {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.appendFile(filePath, content);
    const stat = await fs.stat(filePath);
    return { success: true, path: filePath, size: stat.size };
  } catch (error) {
    return { success: false, path: filePath, error: `追加失败: ${error}` };
  }
}

// 删除文件
export async function deleteFile(filePath: string): Promise<FileResult> {
  try {
    await fs.unlink(filePath);
    return { success: true, path: filePath };
  } catch (error) {
    return { success: false, path: filePath, error: `删除失败: ${error}` };
  }
}

// 创建目录
export async function createDirectory(dirPath: string, recursive = true): Promise<FileResult> {
  try {
    await fs.mkdir(dirPath, { recursive });
    return { success: true, path: dirPath };
  } catch (error) {
    return { success: false, path: dirPath, error: `创建目录失败: ${error}` };
  }
}

// 列出目录
export async function listDirectory(dirPath: string): Promise<FileResult> {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    const content = entries.map(e => {
      const type = e.isDirectory() ? '📁' : e.isFile() ? '📄' : '🔗';
      return `${type} ${e.name}`;
    }).join('\n');
    return { success: true, path: dirPath, content };
  } catch (error) {
    return { success: false, path: dirPath, error: `列出目录失败: ${error}` };
  }
}

// 搜索文件内容
export async function searchInFile(filePath: string, pattern: string): Promise<SearchResult[]> {
  const results: SearchResult[] = [];
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const lines = content.split('\n');
    const regex = new RegExp(pattern, 'gi');

    for (let i = 0; i < lines.length; i++) {
      const match = regex.exec(lines[i]);
      if (match) {
        results.push({
          filePath,
          line: i + 1,
          content: lines[i].trim(),
          matchStart: match.index,
          matchEnd: match.index + match[0].length,
        });
      }
    }
  } catch {
    // 跳过无法读取的文件
  }
  return results;
}

// 在目录中搜索
export async function searchInDirectory(dirPath: string, pattern: string, filePattern: string = '**/*'): Promise<SearchResult[]> {
  const files = await glob(filePattern, { cwd: dirPath, ignore: ['**/node_modules/**', '**/dist/**', '**/.git/**'] });
  const allResults: SearchResult[] = [];

  for (const file of files.slice(0, 100)) { // 限制搜索文件数量
    const filePath = path.join(dirPath, file);
    const results = await searchInFile(filePath, pattern);
    allResults.push(...results);
  }

  return allResults;
}

// 获取文件树
export async function getFileTree(dirPath: string, maxDepth: number = 3, ignore: string[] = ['node_modules', 'dist', '.git', 'coverage', 'build']): Promise<string> {
  function buildTree(currentPath: string, prefix: string, depth: number): string {
    if (depth > maxDepth) return '';

    let result = '';
    const entries = fsCb.readdirSync(currentPath, { withFileTypes: true })
      .filter(e => !ignore.includes(e.name) && !e.name.startsWith('.'))
      .sort((a, b) => {
        if (a.isDirectory() && !b.isDirectory()) return -1;
        if (!a.isDirectory() && b.isDirectory()) return 1;
        return a.name.localeCompare(b.name);
      });

    entries.forEach((entry, index) => {
      const isLast = index === entries.length - 1;
      const connector = isLast ? '└── ' : '├── ';
      const childPrefix = isLast ? '    ' : '│   ';

      if (entry.isDirectory()) {
        result += `${prefix}${connector}📁 ${entry.name}\n`;
        result += buildTree(path.join(currentPath, entry.name), prefix + childPrefix, depth + 1);
      } else {
        result += `${prefix}${connector}📄 ${entry.name}\n`;
      }
    });

    return result;
  }

  const dirName = path.basename(dirPath);
  return `📁 ${dirName}\n${buildTree(dirPath, '', 0)}`;
}

// 获取文件信息
export async function getFileInfo(filePath: string): Promise<FileResult> {
  try {
    const stat = await fs.stat(filePath);
    const ext = path.extname(filePath).slice(1);
    const content = [
      `路径: ${filePath}`,
      `大小: ${formatBytes(stat.size)}`,
      `类型: ${ext || '未知'}`,
      `修改时间: ${stat.mtime.toLocaleString('zh-CN')}`,
      `是否目录: ${stat.isDirectory() ? '是' : '否'}`,
    ].join('\n');
    return { success: true, path: filePath, content, size: stat.size };
  } catch (error) {
    return { success: false, path: filePath, error: `获取信息失败: ${error}` };
  }
}

export async function copyFile(src: string, dest: string): Promise<FileResult> {
  try {
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.copyFile(src, dest);
    const stat = await fs.stat(dest);
    return { success: true, path: dest, size: stat.size };
  } catch (error) {
    return { success: false, path: dest, error: `复制失败: ${error}` };
  }
}

export async function moveFile(src: string, dest: string): Promise<FileResult> {
  try {
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.rename(src, dest);
    const stat = await fs.stat(dest);
    return { success: true, path: dest, size: stat.size };
  } catch (error) {
    return { success: false, path: dest, error: `移动失败: ${error}` };
  }
}
