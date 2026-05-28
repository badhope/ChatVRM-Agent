/**
 * 测试辅助工具
 * 提供统一的测试上下文、Mock LLM、临时文件系统等
 */

import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * 创建临时目录用于测试
 */
export async function createTempDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'pa-test-'));
  return dir;
}

/**
 * 递归删除目录
 */
export async function cleanupTempDir(dir: string): Promise<void> {
  try {
    await fs.rm(dir, { recursive: true, force: true });
  } catch {
    // 忽略清理错误
  }
}

/**
 * 临时目录管理器
 */
export class TempDirManager {
  private dirs: string[] = [];

  async create(): Promise<string> {
    const dir = await createTempDir();
    this.dirs.push(dir);
    return dir;
  }

  async cleanup(): Promise<void> {
    await Promise.all(this.dirs.map((d) => cleanupTempDir(d)));
    this.dirs = [];
  }
}

/**
 * Mock LLM 提供者
 */
export class MockLLMProvider {
  private responses: Map<string, string> = new Map();
  private defaultResponse = 'Mock LLM response';
  private callCount = 0;
  private lastMessages: unknown[] = [];

  /**
   * 设置特定请求的响应
   */
  setResponse(pattern: string, response: string): void {
    this.responses.set(pattern, response);
  }

  /**
   * 设置默认响应
   */
  setDefaultResponse(response: string): void {
    this.defaultResponse = response;
  }

  /**
   * 获取调用次数
   */
  getCallCount(): number {
    return this.callCount;
  }

  /**
   * 获取最后一次调用的消息
   */
  getLastMessages(): unknown[] {
    return this.lastMessages;
  }

  /**
   * 模拟调用 LLM
   */
  async call(messages: unknown[], options?: unknown): Promise<string> {
    this.callCount++;
    this.lastMessages = messages;

    // 尝试匹配响应
    const messageContent = JSON.stringify(messages);
    for (const [pattern, response] of this.responses) {
      if (messageContent.includes(pattern)) {
        return response;
      }
    }

    return this.defaultResponse;
  }

  /**
   * 重置状态
   */
  reset(): void {
    this.responses.clear();
    this.callCount = 0;
    this.lastMessages = [];
  }
}

/**
 * 测试上下文
 */
export interface TestContext {
  tempDir: string;
  mockLLM: MockLLMProvider;
}

/**
 * 创建测试上下文
 */
export async function createTestContext(): Promise<TestContext> {
  const tempDir = await createTempDir();
  const mockLLM = new MockLLMProvider();

  return {
    tempDir,
    mockLLM,
  };
}

/**
 * 清理测试上下文
 */
export async function cleanupTestContext(ctx: TestContext): Promise<void> {
  await cleanupTempDir(ctx.tempDir);
}

/**
 * 在临时目录中创建测试文件
 */
export async function createTestFile(
  dir: string,
  filePath: string,
  content: string
): Promise<string> {
  const fullPath = path.join(dir, filePath);
  const dirPath = path.dirname(fullPath);
  await fs.mkdir(dirPath, { recursive: true });
  await fs.writeFile(fullPath, content, 'utf-8');
  return fullPath;
}

/**
 * 读取测试文件
 */
export async function readTestFile(dir: string, filePath: string): Promise<string> {
  const fullPath = path.join(dir, filePath);
  return await fs.readFile(fullPath, 'utf-8');
}

/**
 * 等待一段时间
 */
export async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 捕获异步错误
 */
export async function captureError<T>(fn: () => Promise<T>): Promise<Error | null> {
  try {
    await fn();
    return null;
  } catch (e) {
    return e as Error;
  }
}

/**
 * 检查函数是否抛出预期错误
 */
export async function expectError<T>(
  fn: () => Promise<T>,
  errorMessage?: string
): Promise<void> {
  const error = await captureError(fn);
  if (!error) {
    throw new Error('Expected an error to be thrown');
  }
  if (errorMessage && !error.message.includes(errorMessage)) {
    throw new Error(
      `Expected error message to include "${errorMessage}", but got "${error.message}"`
    );
  }
}

/**
 * 测试辅助工具导出
 */
export const testUtils = {
  createTempDir,
  cleanupTempDir,
  TempDirManager,
  MockLLMProvider,
  createTestContext,
  cleanupTestContext,
  createTestFile,
  readTestFile,
  sleep,
  captureError,
  expectError,
};

export default testUtils;
