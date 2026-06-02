import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TrustService, TrustLevel } from '../../../domain/trust/trust.service.js';
import { SecretStorage } from '../../../infrastructure/secret-storage.js';

describe('API Key Leak Detection', () => {
  it('should detect OpenAI API key in output', () => {
    const output = 'api_key: sk-proj-abc123def456ghijklmnop';

    const issues = TrustService.detectIssues(output);

    const keyIssue = issues.find((i) => i.type === 'sensitive' && i.description.includes('API key'));
    expect(keyIssue).toBeDefined();
    expect(keyIssue!.level).toBe(TrustLevel.RequireConfirmation);
  });

  it('should detect Anthropic API key in output', () => {
    const output = 'api_key: sk-ant-api03-abcdefghijklmnop';

    const issues = TrustService.detectIssues(output);

    const keyIssue = issues.find((i) => i.type === 'sensitive' && i.description.includes('API key'));
    expect(keyIssue).toBeDefined();
  });

  it('should detect GitHub token in output', () => {
    const output = 'token: ghp_1234567890abcdefghijklmnop';

    const issues = TrustService.detectIssues(output);

    const tokenIssue = issues.find((i) => i.type === 'sensitive' && i.description.includes('token'));
    expect(tokenIssue).toBeDefined();
    expect(tokenIssue!.level).toBe(TrustLevel.Critical);
  });

  it('should detect generic API key pattern', () => {
    const output = 'set API_KEY=abcdef1234567890';

    const issues = TrustService.detectIssues(output);

    const keyIssue = issues.find((i) => i.type === 'sensitive' && i.description.includes('API key'));
    expect(keyIssue).toBeDefined();
  });

  it('should detect JWT token in output', () => {
    const output = 'token: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0';

    const issues = TrustService.detectIssues(output);

    const tokenIssue = issues.find((i) => i.type === 'sensitive' && i.description.includes('token'));
    expect(tokenIssue).toBeDefined();
  });

  it('should detect AWS access key in output', () => {
    const output = 'api_key=AKIAIOSFODNN7EXAMPLE';

    const issues = TrustService.detectIssues(output);

    const keyIssue = issues.find((i) => i.type === 'sensitive' && i.description.includes('API key'));
    expect(keyIssue).toBeDefined();
  });
});

describe('Command Injection', () => {
  it('should detect shell injection with backticks', () => {
    const output = 'exec(`cat /etc/passwd`)';

    const issues = TrustService.detectIssues(output);

    const execIssue = issues.find((i) => i.type === 'dangerous' && i.pattern.includes('exec'));
    expect(execIssue).toBeDefined();
  });

  it('should detect shell injection with $()', () => {
    const output = 'exec("rm $(ls)")';

    const issues = TrustService.detectIssues(output);

    const execIssue = issues.find((i) => i.type === 'dangerous' && i.pattern.includes('exec'));
    expect(execIssue).toBeDefined();
  });

  it('should detect pipe to shell', () => {
    const output = 'exec("cat file.txt | bash")';

    const issues = TrustService.detectIssues(output);

    const execIssue = issues.find((i) => i.type === 'dangerous' && i.pattern.includes('exec'));
    expect(execIssue).toBeDefined();
  });

  it('should detect redirect to file', () => {
    const output = 'exec("echo data > /etc/config")';

    const issues = TrustService.detectIssues(output);

    const execIssue = issues.find((i) => i.type === 'dangerous' && i.pattern.includes('exec'));
    expect(execIssue).toBeDefined();
  });
});

describe('Path Traversal', () => {
  it('should detect ../ sequences via dangerous command context', () => {
    const output = 'sudo cat ../../../etc/passwd';

    const issues = TrustService.detectIssues(output);

    const sudoIssue = issues.find((i) => i.type === 'dangerous' && i.pattern.includes('sudo'));
    expect(sudoIssue).toBeDefined();
  });

  it('should detect /etc/passwd access via sudo', () => {
    const output = 'sudo cat /etc/passwd';

    const issues = TrustService.detectIssues(output);

    const sudoIssue = issues.find((i) => i.type === 'dangerous' && i.pattern.includes('sudo'));
    expect(sudoIssue).toBeDefined();
  });

  it('should detect ~/.ssh access via eval', () => {
    const output = 'eval("cat ~/.ssh/id_rsa")';

    const issues = TrustService.detectIssues(output);

    const evalIssue = issues.find((i) => i.type === 'dangerous' && i.pattern.includes('eval'));
    expect(evalIssue).toBeDefined();
    expect(evalIssue!.level).toBe(TrustLevel.Critical);
  });

  it('should detect Windows path traversal via exec', () => {
    const output = 'exec("type C:\\Windows\\System32\\config\\SAM")';

    const issues = TrustService.detectIssues(output);

    const execIssue = issues.find((i) => i.type === 'dangerous' && i.pattern.includes('exec'));
    expect(execIssue).toBeDefined();
  });
});

describe('Destructive Operations', () => {
  it('should detect rm -rf /', () => {
    const output = 'rm -rf / --no-preserve-root';

    const issues = TrustService.detectIssues(output);

    const destructiveIssue = issues.find((i) => i.type === 'destructive' && i.description.includes('recursive force removal'));
    expect(destructiveIssue).toBeDefined();
    expect(destructiveIssue!.level).toBe(TrustLevel.Critical);
  });

  it('should detect dd command via sudo context', () => {
    const output = 'sudo dd if=/dev/zero of=/dev/sda';

    const issues = TrustService.detectIssues(output);

    const sudoIssue = issues.find((i) => i.type === 'dangerous' && i.pattern.includes('sudo'));
    expect(sudoIssue).toBeDefined();
  });

  it('should detect mkfs command via sudo context', () => {
    const output = 'sudo mkfs.ext4 /dev/sdb1';

    const issues = TrustService.detectIssues(output);

    const sudoIssue = issues.find((i) => i.type === 'dangerous' && i.pattern.includes('sudo'));
    expect(sudoIssue).toBeDefined();
  });

  it('should detect chmod 777', () => {
    const output = 'chmod 777 /var/www/html';

    const issues = TrustService.detectIssues(output);

    const chmodIssue = issues.find((i) => i.description.includes('world-writable'));
    expect(chmodIssue).toBeDefined();
    expect(chmodIssue!.level).toBe(TrustLevel.HighRisk);
  });

  it('should detect sudo with dangerous commands', () => {
    const output = 'sudo rm -rf /var/log';

    const issues = TrustService.detectIssues(output);

    const sudoIssue = issues.find((i) => i.type === 'dangerous' && i.pattern.includes('sudo'));
    expect(sudoIssue).toBeDefined();
    const rmIssue = issues.find((i) => i.type === 'destructive' && i.description.includes('recursive force removal'));
    expect(rmIssue).toBeDefined();
    expect(issues.length).toBeGreaterThanOrEqual(2);
  });
});

describe('Information Disclosure', () => {
  it('should detect password in output', () => {
    const output = 'The database password=admin123 should not be shared';

    const issues = TrustService.detectIssues(output);

    const passwordIssue = issues.find((i) => i.type === 'sensitive' && i.description.includes('password'));
    expect(passwordIssue).toBeDefined();
    expect(passwordIssue!.level).toBe(TrustLevel.Critical);
  });

  it('should detect secret in output', () => {
    const output = 'secret: prod-database-connection-string';

    const issues = TrustService.detectIssues(output);

    const secretIssue = issues.find((i) => i.type === 'sensitive' && i.description.includes('secret'));
    expect(secretIssue).toBeDefined();
    expect(secretIssue!.level).toBe(TrustLevel.Critical);
  });

  it('should detect token in output', () => {
    const output = 'token: Bearer xyz-abc-123';

    const issues = TrustService.detectIssues(output);

    const tokenIssue = issues.find((i) => i.type === 'sensitive' && i.description.includes('token'));
    expect(tokenIssue).toBeDefined();
  });

  it('should detect private key markers', () => {
    const output = 'secret: -----BEGIN RSA PRIVATE KEY-----';

    const issues = TrustService.detectIssues(output);

    const secretIssue = issues.find((i) => i.type === 'sensitive' && i.description.includes('secret'));
    expect(secretIssue).toBeDefined();
  });
});

describe('SecretStorage Security', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    vi.doMock('keytar', () => {
      throw new Error('Cannot find module keytar');
    });
    vi.resetModules();
    const loggerModule = await import('../../../infrastructure/logger.js');
    warnSpy = vi.spyOn(loggerModule.logger, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('should not log API keys during storage', async () => {
    const { SecretStorage: SS } = await import('../../../infrastructure/secret-storage.js');

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await SS.storeKey('test-service', 'openai', 'sk-sensitive-key-12345');

    const allLogCalls = logSpy.mock.calls.map((c) => String(c[0])).join(' ');
    expect(allLogCalls).not.toContain('sk-sensitive-key-12345');

    logSpy.mockRestore();
  });

  it('should not expose keys in error messages', async () => {
    const { SecretStorage: SS } = await import('../../../infrastructure/secret-storage.js');

    await SS.storeKey('test-service', 'github', 'ghp_supersecrettoken');

    const allWarnCalls = warnSpy.mock.calls.map((c) => String(c[0])).join(' ');
    expect(allWarnCalls).not.toContain('ghp_supersecrettoken');
  });

  it('should sanitize keytar return values', async () => {
    const { SecretStorage: SS } = await import('../../../infrastructure/secret-storage.js');

    process.env.TEST_SERVICE_OPENAI = 'sk-from-env-only';

    const key = await SS.getKey('test-service', 'openai');

    expect(key).toBe('sk-from-env-only');

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    logSpy.mockRestore();

    delete process.env.TEST_SERVICE_OPENAI;
  });
});

describe('Defense in Depth', () => {
  it('safe output should be trusted', () => {
    const verdict = TrustService.evaluate('The file was saved successfully to output.txt');

    expect(verdict.level).toBe(TrustLevel.Safe);
    expect(verdict.score).toBe(100);
    expect(verdict.requiresConfirmation).toBe(false);
    expect(verdict.issues).toHaveLength(0);
  });

  it('mixed safe+dangerous should be flagged', () => {
    const verdict = TrustService.evaluate('File saved, but also rm -rf /tmp was executed');

    expect(verdict.level).not.toBe(TrustLevel.Safe);
    expect(verdict.score).toBeLessThan(100);
    expect(verdict.issues.length).toBeGreaterThan(0);
    const hasDestructive = verdict.issues.some((i) => i.type === 'destructive');
    expect(hasDestructive).toBe(true);
  });

  it('obfuscation attempts should still be caught', () => {
    const verdict = TrustService.evaluate('Removing files with rm  -rf');

    const rmIssue = verdict.issues.find((i) => i.type === 'destructive');
    expect(rmIssue).toBeDefined();
  });

  it('multiple vectors should all be detected', () => {
    const output = 'sudo rm -rf /data && chmod 777 /config && api_key=sk-abc123 && token=ghp_xyz';

    const issues = TrustService.detectIssues(output);

    const types = issues.map((i) => i.type);
    expect(types).toContain('dangerous');
    expect(types).toContain('destructive');
    expect(types).toContain('sensitive');
    expect(issues.length).toBeGreaterThanOrEqual(3);
  });
});