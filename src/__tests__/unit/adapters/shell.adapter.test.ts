import { describe, it, expect } from 'vitest';
import { ShellExecutor } from '../../../adapters/shell.adapter.js';
import type { ITrustPort } from '../../../ports/trust.port.js';

const makeTrust = (): ITrustPort => ({
  evaluate: () => ({ level: 'Safe' as never, issues: [], score: 0, requiresConfirmation: false, summary: 'test' }),
  detectIssues: () => [],
});
const makeExecutor = () => new ShellExecutor({ trustService: makeTrust() });

describe('ShellExecutor', () => {
  it('should echo a command and capture output', async () => {
    const exec = makeExecutor();
    const result = await exec.execute('echo hello');
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe('hello');
  });

  it('should capture non-zero exit code on failure', async () => {
    const exec = makeExecutor();
    const result = await exec.execute('exit 7');
    expect(result.exitCode).toBe(7);
  });

  it('should throw on empty command', async () => {
    const exec = makeExecutor();
    await expect(exec.execute('   ')).rejects.toThrow();
  });

  it('should capture stderr separately', async () => {
    const exec = makeExecutor();
    const result = await exec.execute('echo err >&2');
    expect(result.stderr.trim()).toBe('err');
  });

  it('should report duration', async () => {
    const exec = makeExecutor();
    const result = await exec.execute('echo fast');
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(typeof result.durationMs).toBe('number');
  });

  it('should get current working directory', async () => {
    const exec = makeExecutor();
    const cwd = await exec.getCwd();
    expect(cwd).toBe(process.cwd());
  });

  it('should get home directory', async () => {
    const exec = makeExecutor();
    const home = await exec.getHome();
    expect(home.length).toBeGreaterThan(0);
  });

  it('should get temp dir', async () => {
    const exec = makeExecutor();
    const tmp = await exec.getTempDir();
    expect(tmp.length).toBeGreaterThan(0);
  });

  it('should check path exists', async () => {
    const exec = makeExecutor();
    const exists = await exec.pathExists(process.cwd());
    expect(exists).toBe(true);

    const notExists = await exec.pathExists('/nonexistent-path-zzz-xxx');
    expect(notExists).toBe(false);
  });

  it('should join path segments', async () => {
    const exec = makeExecutor();
    const joined = await exec.joinPath('a', 'b', 'c.txt');
    expect(joined).toContain('a');
    expect(joined).toContain('c.txt');
  });

  it('should refuse dangerous command via trust service', async () => {
    const trustService: ITrustPort = {
      evaluate: () => ({ level: 'Critical' as never, issues: [], score: 100, requiresConfirmation: true, summary: 'destructive' }),
      detectIssues: () => [],
    };
    const exec = new ShellExecutor({ trustService });
    await expect(exec.execute('rm -rf /')).rejects.toThrow(/dangerous/);
  });

  it('should allow safe command via trust service', async () => {
    const trustService: ITrustPort = {
      evaluate: () => ({ level: 'Safe' as never, issues: [], score: 0, requiresConfirmation: false, summary: 'safe' }),
      detectIssues: () => [],
    };
    const exec = new ShellExecutor({ trustService });
    const result = await exec.execute('echo safe');
    expect(result.exitCode).toBe(0);
  });

  it('should throw when constructed without a trust service', () => {
    // @ts-expect-error -- testing runtime guard against the previous
    // "optional trustService" design that let production code skip the
    // trust gate entirely.
    expect(() => new ShellExecutor()).toThrow(/trustService/);
    // @ts-expect-error -- empty options object also rejected.
    expect(() => new ShellExecutor({})).toThrow(/trustService/);
  });
});
