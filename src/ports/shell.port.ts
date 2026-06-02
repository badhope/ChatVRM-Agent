export interface ShellExecuteOptions {
  cwd?: string;
  timeout?: number;
  env?: Record<string, string>;
}

export interface ShellExecuteResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs: number;
}

export interface IShellPort {
  execute(command: string, options?: ShellExecuteOptions): Promise<ShellExecuteResult>;
  getCwd(): Promise<string>;
  getHome(): Promise<string>;
  getTempDir(): Promise<string>;
  pathExists(p: string): Promise<boolean>;
  joinPath(...segments: string[]): Promise<string>;
}
