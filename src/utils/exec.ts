import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

/**
 * 执行选项接口
 */
export interface ExecOptions {
  timeout?: number;
  encoding?: BufferEncoding;
  maxBuffer?: number;
  cwd?: string;
}

export interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs: number;
}

/**
 * 安全执行命令（返回完整结果）
 * @param cmd 命令字符串
 * @param args 命令参数数组
 * @param timeout 超时时间（毫秒）
 * @param cwd 工作目录
 * @returns 执行结果
 */
export async function safeExecRaw(
  cmd: string,
  args: string[] = [],
  timeout: number = 60000,
  cwd?: string
): Promise<ExecResult> {
  const startTime = Date.now();
  try {
    const options: ExecOptions = { timeout, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 };
    if (cwd) options.cwd = cwd;
    const { stdout, stderr } = await execFileAsync(cmd, args, options);
    return {
      stdout: String(stdout || '').trim(),
      stderr: String(stderr || '').trim(),
      exitCode: 0,
      durationMs: Date.now() - startTime
    };
  } catch (e: unknown) {
    const error = e as { stdout?: string; stderr?: string; message?: string; code?: number };
    return {
      stdout: String(error.stdout || '').trim(),
      stderr: String(error.stderr || error.message || '').trim(),
      exitCode: error.code || 1,
      durationMs: Date.now() - startTime
    };
  }
}

/**
 * 安全执行命令（返回输出字符串）
 * @param cmd 命令字符串
 * @param args 命令参数数组
 * @param timeout 超时时间（毫秒）
 * @param cwd 工作目录
 * @returns 命令输出
 */
export async function safeExec(
  cmd: string,
  args: string[] = [],
  timeout: number = 60000,
  cwd?: string
): Promise<string> {
  const result = await safeExecRaw(cmd, args, timeout, cwd);
  return (result.stdout || result.stderr || '').trim();
}
