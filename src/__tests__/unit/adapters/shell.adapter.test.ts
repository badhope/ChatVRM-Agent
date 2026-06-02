import { describe, it, expect } from 'vitest';
import { ShellExecutor } from '../../../adapters/shell.adapter.js';

describe('ShellExecutor', () => {
  it('should echo a command and capture output', async () => {
    const exec = new ShellExecutor();
    const result = await exec.execute('echo hello');
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe('hello');
  });

  it('should capture non-zero exit code on failure', async () => {
    const exec = new ShellExecutor();
    const result = await exec.execute('exit 7');
    expect(result.exitCode).toBe(7);
  });

  it('should throw on empty command', async () => {
    const exec = new ShellExecutor();
    await expect(exec.execute('   ')).rejects.toThrow();
  });

  it('should capture stderr separately', async () => {
    const exec = new ShellExecutor();
    const result = await exec.execute('echo err >&2');
    expect(result.stderr.trim()).toBe('err');
  });

  it('should report duration', async () => {
    const exec = new ShellExecutor();
    const result = await exec.execute('echo fast');
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(typeof result.durationMs).toBe('number');
  });

  it('should get current working directory', async () => {
    const exec = new ShellExecutor();
    const cwd = await exec.getCwd();
    expect(cwd).toBe(process.cwd());
  });

  it('should get home directory', async () => {
    const exec = new ShellExecutor();
    const home = await exec.getHome();
    expect(home.length).toBeGreaterThan(0);
  });

  it('should get temp dir', async () => {
    const exec = new ShellExecutor();
    const tmp = await exec.getTempDir();
    expect(tmp.length).toBeGreaterThan(0);
  });

  it('should check path exists', async () => {
    const exec = new ShellExecutor();
    const exists = await exec.pathExists(process.cwd());
    expect(exists).toBe(true);

    const notExists = await exec.pathExists('/nonexistent-path-zzz-xxx');
    expect(notExists).toBe(false);
  });

  it('should join path segments', async () => {
    const exec = new ShellExecutor();
    const joined = await exec.joinPath('a', 'b', 'c.txt');
    expect(joined).toContain('a');
    expect(joined).toContain('c.txt');
  });

  it('should refuse dangerous command via trust service', async () => {
    const trustService = {
      evaluate: () => ({ level: 'Critical' as const, issues: [], score: 100 }),
    };
    const exec = new ShellExecutor({ trustService });
    await expect(exec.execute('rm -rf /')).rejects.toThrow(/dangerous/);
  });

  it('should allow safe command via trust service', async () => {
    const trustService = {
      evaluate: () => ({ level: 'Safe' as const, issues: [], score: 0 }),
    };
    const exec = new ShellExecutor({ trustService });
    const result = await exec.execute('echo safe');
    expect(result.exitCode).toBe(0);
  });
});
