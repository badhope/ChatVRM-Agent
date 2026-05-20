import fs from 'fs/promises';
import path from 'path';

/**
 * 检查文件是否存在
 * @param filePath 文件路径
 * @returns 是否存在
 */
export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * 读取 JSON 文件
 * @param filePath 文件路径
 * @returns 解析后的数据或 null
 */
export async function readJsonFile<T = unknown>(filePath: string): Promise<T | null> {
  try {
    const content = await fs.readFile(filePath, 'utf8');
    return JSON.parse(content) as T;
  } catch {
    return null;
  }
}

/**
 * 写入 JSON 文件
 * @param filePath 文件路径
 * @param data 要写入的数据
 * @returns 是否成功
 */
export async function writeJsonFile<T = unknown>(filePath: string, data: T): Promise<boolean> {
  try {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch {
    return false;
  }
}
