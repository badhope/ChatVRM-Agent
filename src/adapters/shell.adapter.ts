import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import os from 'os';
import type { IShellPort } from '../ports/shell.port.js';
import type { ITrustPort } from '../ports/trust.port.js';

const execAsync = promisify(exec);

const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_BUFFER = 10 * 1024 * 1024;

const ALLOWED_ENV = new Set(['PATH', 'HOME', 'USER', 'SHELL', 'LANG', 'LC_ALL', 'TZ', 'TMPDIR', 'NODE_ENV', 'PWD', 'OLDPWD']);

export class ShellExecutor implements IShellPort {
  private trustService: ITrustPort;

  /**
   * @param options.trustService REQUIRED. The trust gate that decides whether
   *   a candidate shell command is safe to execute. Every `execute()` call is
   *   evaluated against it. If the level is `HighRisk` or `Critical` we
   *   refuse to spawn the child process entirely — the previous "optional
   *   trustService" design meant production callers could omit it, which
   *   left the dangerous-command check dead code in CI.
   */
  constructor(options: { trustService: ITrustPort }) {
    if (!options || !options.trustService) {
      throw new Error('ShellExecutor requires a trustService. Wire one in via createAdapters() or pass it explicitly.');
    }
    this.trustService = options.trustService;
  }

  async execute(command: string, options?: { cwd?: string; timeout?: number; env?: Record<string, string> }): Promise<{ stdout: string; stderr: string; exitCode: number; durationMs: number }> {
    if (!command || command.trim().length === 0) {
      throw new Error('Command must be non-empty');
    }

    const verdict = this.trustService.evaluate({ output: command, context: JSON.stringify({ intent: 'shell', toolUsed: 'shell' }) });
    if (verdict.level === 'Critical' || verdict.level === 'HighRisk') {
      throw new Error(`Refused to execute dangerous command: ${verdict.level} (${verdict.summary})`);
    }

    const cwd = options?.cwd ?? process.cwd();
    const timeout = options?.timeout ?? DEFAULT_TIMEOUT_MS;

    const safeEnv: Record<string, string> = {};
    for (const key of ALLOWED_ENV) {
      const val = process.env[key];
      if (val !== undefined) {
        safeEnv[key] = val;
      }
    }
    if (options?.env) {
      // Caller-supplied env goes through the same allowlist as the
      // ambient env. Without this, a caller can set
      //   options.env = { LD_PRELOAD: '/tmp/evil.so' }
      // and hijack every native lib loaded by the spawned shell.
      for (const [k, v] of Object.entries(options.env)) {
        if (!ALLOWED_ENV.has(k)) continue;
        safeEnv[k] = v;
      }
    }

    const start = performance.now();
    try {
      const { stdout, stderr } = await execAsync(command, {
        cwd,
        timeout,
        maxBuffer: MAX_BUFFER,
        env: safeEnv,
        shell: process.platform === 'win32' ? path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'cmd.exe') : '/bin/sh',
      });
      const durationMs = performance.now() - start;
      return { stdout, stderr, exitCode: 0, durationMs: Math.round(durationMs) };
    } catch (err) {
      const durationMs = performance.now() - start;
      const error = err as NodeJS.ErrnoException & { stdout?: string; stderr?: string; code?: number | string; killed?: boolean };
      if (error.killed) {
        throw new Error(`Command timed out after ${timeout}ms: ${command}`);
      }
      return {
        stdout: error.stdout ?? '',
        stderr: error.stderr ?? error.message,
        exitCode: typeof error.code === 'number' ? error.code : 1,
        durationMs: Math.round(durationMs),
      };
    }
  }

  async getCwd(): Promise<string> {
    return process.cwd();
  }

  async getHome(): Promise<string> {
    return os.homedir();
  }

  async getTempDir(): Promise<string> {
    return os.tmpdir();
  }

  async pathExists(p: string): Promise<boolean> {
    const path = await import('fs/promises');
    try {
      await path.access(p);
      return true;
    } catch {
      return false;
    }
  }

  async joinPath(...segments: string[]): Promise<string> {
    return path.join(...segments);
  }
}
