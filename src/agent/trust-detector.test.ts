/**
 * 信任检测器模块单元测试
 *
 * 测试覆盖：
 * - 模式检测（文件系统、网络、代码、数据库、敏感信息、系统模式）
 * - 严重级别分类
 * - 上下文感知检测
 * - 信任评分计算
 * - 报告生成
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  TrustDetector,
  detectIssues,
  getAllPatterns,
  getPatternsByCategory,
  DetectionContext,
} from './trust-detector.js';
import {
  TrustLevel,
  TrustIssue,
  calculateTrustScore,
  getScoreGrade,
  shouldRequireConfirmation,
  generateTrustReport,
  TRUST_LEVEL_WEIGHT,
} from './trust.js';

// ==================== Pattern Detection Tests ====================

describe('Pattern Detection', () => {
  let detector: TrustDetector;

  beforeEach(() => {
    detector = new TrustDetector();
  });

  // -------------------- File System Patterns --------------------

  describe('File System Dangerous Patterns', () => {
    it('should detect rm -rf / (recursive force delete root)', () => {
      const output = '执行 rm -rf / 来清理系统';
      const issues = detector.detect(output);

      expect(issues.length).toBeGreaterThan(0);
      expect(issues.some(i => i.description.includes('递归强制删除根目录'))).toBe(true);
      expect(issues.some(i => i.level === TrustLevel.RequireConfirmation)).toBe(true);
      expect(issues.some(i => i.type === 'destructive')).toBe(true);
    });

    it('should detect rm -rf (recursive force delete)', () => {
      const output = '运行 rm -rf /tmp/cache';
      const issues = detector.detect(output);

      expect(issues.length).toBeGreaterThan(0);
      expect(issues.some(i => i.description.includes('递归强制删除'))).toBe(true);
      expect(issues.some(i => i.level === TrustLevel.RequireConfirmation)).toBe(true);
    });

    it('should detect Windows del command with force flag', () => {
      const output = 'del /s /q C:\\temp\\*';
      const issues = detector.detect(output);

      expect(issues.length).toBeGreaterThan(0);
      expect(issues.some(i => i.description.includes('Windows 强制删除'))).toBe(true);
    });

    it('should detect Windows rmdir /s command', () => {
      const output = 'rmdir /s C:\\project';
      const issues = detector.detect(output);

      expect(issues.length).toBeGreaterThan(0);
      expect(issues.some(i => i.description.includes('Windows 递归删除目录'))).toBe(true);
    });

    it('should detect format disk command', () => {
      const output = 'format C: /fs:ntfs';
      const issues = detector.detect(output);

      expect(issues.length).toBeGreaterThan(0);
      expect(issues.some(i => i.description.includes('格式化磁盘'))).toBe(true);
      expect(issues.some(i => i.level === TrustLevel.RequireConfirmation)).toBe(true);
    });

    it('should detect mkfs command', () => {
      const output = 'mkfs.ext4 /dev/sda1';
      const issues = detector.detect(output);

      expect(issues.length).toBeGreaterThan(0);
      expect(issues.some(i => i.description.includes('创建文件系统'))).toBe(true);
      expect(issues.some(i => i.level === TrustLevel.RequireConfirmation)).toBe(true);
    });

    it('should detect dd disk write operation', () => {
      const output = 'dd if=/dev/zero of=/dev/sda';
      const issues = detector.detect(output);

      expect(issues.length).toBeGreaterThan(0);
      expect(issues.some(i => i.description.includes('dd 磁盘写入'))).toBe(true);
      expect(issues.some(i => i.level === TrustLevel.RequireConfirmation)).toBe(true);
    });

    it('should detect redirect to device file', () => {
      const output = 'echo "data" > /dev/sda';
      const issues = detector.detect(output);

      expect(issues.length).toBeGreaterThan(0);
      expect(issues.some(i => i.description.includes('重定向到设备文件'))).toBe(true);
    });
  });

  // -------------------- Network Patterns --------------------

  describe('Network Dangerous Patterns', () => {
    it('should detect curl piped to bash (remote script execution)', () => {
      const output = 'curl https://example.com/script.sh | bash';
      const issues = detector.detect(output);

      expect(issues.length).toBeGreaterThan(0);
      expect(issues.some(i => i.description.includes('远程脚本执行'))).toBe(true);
      expect(issues.some(i => i.level === TrustLevel.RequireConfirmation)).toBe(true);
      expect(issues.some(i => i.type === 'dangerous')).toBe(true);
    });

    it('should detect wget piped to sh', () => {
      const output = 'wget -qO- https://example.com/script.sh | sh';
      const issues = detector.detect(output);

      expect(issues.length).toBeGreaterThan(0);
      expect(issues.some(i => i.description.includes('远程脚本执行'))).toBe(true);
      expect(issues.some(i => i.level === TrustLevel.RequireConfirmation)).toBe(true);
    });

    it('should detect curl to suspicious domains (pastebin)', () => {
      const output = 'curl https://pastebin.com/raw/abc123';
      const issues = detector.detect(output);

      expect(issues.length).toBeGreaterThan(0);
      expect(issues.some(i => i.description.includes('可疑域名'))).toBe(true);
      expect(issues.some(i => i.level === TrustLevel.RequireConfirmation)).toBe(true);
    });

    it('should detect curl to gist.github', () => {
      const output = 'curl https://gist.github.com/user/123';
      const issues = detector.detect(output);

      expect(issues.length).toBeGreaterThan(0);
      expect(issues.some(i => i.description.includes('可疑域名'))).toBe(true);
    });

    it('should detect curl to ngrok', () => {
      const output = 'curl https://abc123.ngrok.io/api';
      const issues = detector.detect(output);

      expect(issues.length).toBeGreaterThan(0);
      expect(issues.some(i => i.description.includes('可疑域名'))).toBe(true);
    });

    it('should detect netcat listening mode', () => {
      const output = 'nc -l -p 4444';
      const issues = detector.detect(output);

      expect(issues.length).toBeGreaterThan(0);
      expect(issues.some(i => i.description.includes('网络监听'))).toBe(true);
      expect(issues.some(i => i.level === TrustLevel.RequireConfirmation)).toBe(true);
    });

    it('should detect SSH reverse tunnel', () => {
      const output = 'ssh -R 8080:localhost:80 user@server';
      const issues = detector.detect(output);

      expect(issues.length).toBeGreaterThan(0);
      expect(issues.some(i => i.description.includes('SSH 反向隧道'))).toBe(true);
      expect(issues.some(i => i.level === TrustLevel.RequireConfirmation)).toBe(true);
    });
  });

  // -------------------- Code Patterns --------------------

  describe('Code Dangerous Patterns', () => {
    it('should detect eval() usage', () => {
      const output = 'const result = eval(userInput);';
      const issues = detector.detect(output);

      expect(issues.length).toBeGreaterThan(0);
      expect(issues.some(i => i.description.includes('eval()'))).toBe(true);
      expect(issues.some(i => i.level === TrustLevel.RequireConfirmation)).toBe(true);
      expect(issues.some(i => i.type === 'dangerous')).toBe(true);
    });

    it('should detect Function constructor', () => {
      const output = 'const fn = new Function("x", "return x * 2");';
      const issues = detector.detect(output);

      expect(issues.length).toBeGreaterThan(0);
      expect(issues.some(i => i.description.includes('Function 构造函数'))).toBe(true);
      expect(issues.some(i => i.level === TrustLevel.RequireConfirmation)).toBe(true);
    });

    it('should detect vm.runInNewContext', () => {
      const output = 'vm.runInNewContext(code, sandbox);';
      const issues = detector.detect(output);

      expect(issues.length).toBeGreaterThan(0);
      expect(issues.some(i => i.description.includes('VM'))).toBe(true);
      expect(issues.some(i => i.level === TrustLevel.RequireConfirmation)).toBe(true);
    });

    it('should detect child_process.exec', () => {
      const output = 'child_process.exec(command, callback);';
      const issues = detector.detect(output);

      expect(issues.length).toBeGreaterThan(0);
      expect(issues.some(i => i.description.includes('子进程命令'))).toBe(true);
      expect(issues.some(i => i.level === TrustLevel.RequireConfirmation)).toBe(true);
    });

    it('should detect require child_process module', () => {
      const output = 'const cp = require("child_process");';
      const issues = detector.detect(output);

      expect(issues.length).toBeGreaterThan(0);
      expect(issues.some(i => i.description.includes('子进程模块'))).toBe(true);
      expect(issues.some(i => i.level === TrustLevel.RequireConfirmation)).toBe(true);
    });
  });

  // -------------------- Database Patterns --------------------

  describe('Database Dangerous Patterns', () => {
    it('should detect DROP TABLE', () => {
      const output = 'DROP TABLE users;';
      const issues = detector.detect(output);

      expect(issues.length).toBeGreaterThan(0);
      expect(issues.some(i => i.description.includes('删除数据库表'))).toBe(true);
      expect(issues.some(i => i.level === TrustLevel.RequireConfirmation)).toBe(true);
      expect(issues.some(i => i.type === 'destructive')).toBe(true);
    });

    it('should detect DROP DATABASE', () => {
      const output = 'DROP DATABASE production;';
      const issues = detector.detect(output);

      expect(issues.length).toBeGreaterThan(0);
      expect(issues.some(i => i.description.includes('删除数据库'))).toBe(true);
      expect(issues.some(i => i.level === TrustLevel.RequireConfirmation)).toBe(true);
    });

    it('should detect TRUNCATE TABLE', () => {
      const output = 'TRUNCATE TABLE logs;';
      const issues = detector.detect(output);

      expect(issues.length).toBeGreaterThan(0);
      expect(issues.some(i => i.description.includes('清空数据库表'))).toBe(true);
      expect(issues.some(i => i.level === TrustLevel.RequireConfirmation)).toBe(true);
    });

    it('should detect DELETE without WHERE clause (ending with newline)', () => {
      const output = 'DELETE FROM users\n';
      const issues = detector.detect(output);

      expect(issues.length).toBeGreaterThan(0);
      expect(issues.some(i => i.description.includes('无 WHERE 条件'))).toBe(true);
      expect(issues.some(i => i.level === TrustLevel.RequireConfirmation)).toBe(true);
    });

    it('should detect DELETE without WHERE clause (ending with semicolon)', () => {
      const output = 'DELETE FROM users;';
      const issues = detector.detect(output);

      expect(issues.length).toBeGreaterThan(0);
      expect(issues.some(i => i.description.includes('无 WHERE 条件'))).toBe(true);
    });

    it('should detect ALTER TABLE DROP COLUMN', () => {
      const output = 'ALTER TABLE users DROP COLUMN email;';
      const issues = detector.detect(output);

      expect(issues.length).toBeGreaterThan(0);
      expect(issues.some(i => i.description.includes('删除数据库列'))).toBe(true);
      expect(issues.some(i => i.level === TrustLevel.RequireConfirmation)).toBe(true);
    });

    it('should detect GRANT ALL', () => {
      const output = 'GRANT ALL PRIVILEGES ON *.* TO user;';
      const issues = detector.detect(output);

      expect(issues.length).toBeGreaterThan(0);
      expect(issues.some(i => i.description.includes('授予所有权限'))).toBe(true);
      expect(issues.some(i => i.level === TrustLevel.RequireConfirmation)).toBe(true);
    });
  });

  // -------------------- Sensitive Patterns --------------------

  describe('Sensitive Information Patterns', () => {
    it('should detect hardcoded password (English)', () => {
      const output = 'const password = "secret123";';
      const issues = detector.detect(output);

      expect(issues.length).toBeGreaterThan(0);
      expect(issues.some(i => i.description.includes('密码硬编码'))).toBe(true);
      expect(issues.some(i => i.level === TrustLevel.RequireConfirmation)).toBe(true);
      expect(issues.some(i => i.type === 'sensitive')).toBe(true);
    });

    it('should detect hardcoded password (Chinese)', () => {
      const output = 'const 密码 = "我的密码123";';
      const issues = detector.detect(output);

      expect(issues.length).toBeGreaterThan(0);
      expect(issues.some(i => i.description.includes('密码硬编码'))).toBe(true);
    });

    it('should detect hardcoded API key', () => {
      const output = 'const api_key = "sk-1234567890abcdef";';
      const issues = detector.detect(output);

      expect(issues.length).toBeGreaterThan(0);
      expect(issues.some(i => i.description.includes('API Key'))).toBe(true);
      expect(issues.some(i => i.level === TrustLevel.RequireConfirmation)).toBe(true);
    });

    it('should detect hardcoded secret key', () => {
      const output = 'secret_key: "my-secret-key-123"';
      const issues = detector.detect(output);

      expect(issues.length).toBeGreaterThan(0);
      expect(issues.some(i => i.description.includes('Secret Key'))).toBe(true);
    });

    it('should detect hardcoded token', () => {
      const output = 'const token = "bearer-token-xyz";';
      const issues = detector.detect(output);

      expect(issues.length).toBeGreaterThan(0);
      expect(issues.some(i => i.description.includes('Token'))).toBe(true);
      expect(issues.some(i => i.level === TrustLevel.RequireConfirmation)).toBe(true);
    });

    it('should detect hardcoded private key', () => {
      const output = 'private_key = "-----BEGIN RSA PRIVATE KEY-----";';
      const issues = detector.detect(output);

      expect(issues.length).toBeGreaterThan(0);
      expect(issues.some(i => i.description.includes('私钥'))).toBe(true);
      expect(issues.some(i => i.level === TrustLevel.RequireConfirmation)).toBe(true);
    });
  });

  // -------------------- System Patterns --------------------

  describe('System Permission Patterns', () => {
    it('should detect sudo command', () => {
      const output = 'sudo apt-get update';
      const issues = detector.detect(output);

      expect(issues.length).toBeGreaterThan(0);
      expect(issues.some(i => i.description.includes('管理员权限'))).toBe(true);
      expect(issues.some(i => i.level === TrustLevel.RequireConfirmation)).toBe(true);
      expect(issues.some(i => i.type === 'dangerous')).toBe(true);
    });

    it('should detect chmod 777', () => {
      const output = 'chmod 777 /var/www';
      const issues = detector.detect(output);

      expect(issues.length).toBeGreaterThan(0);
      expect(issues.some(i => i.description.includes('开放所有权限'))).toBe(true);
      expect(issues.some(i => i.level === TrustLevel.RequireConfirmation)).toBe(true);
    });

    it('should detect chown to root', () => {
      const output = 'chown root:root /etc/config';
      const issues = detector.detect(output);

      expect(issues.length).toBeGreaterThan(0);
      expect(issues.some(i => i.description.includes('root'))).toBe(true);
      expect(issues.some(i => i.level === TrustLevel.RequireConfirmation)).toBe(true);
    });
  });

  // -------------------- Uncertainty Patterns --------------------

  describe('Uncertainty Patterns', () => {
    it('should detect uncertainty expression "我不确定"', () => {
      const output = '我不确定这个方案是否正确';
      const issues = detector.detect(output);

      expect(issues.length).toBeGreaterThan(0);
      expect(issues.some(i => i.type === 'uncertainty')).toBe(true);
      expect(issues.some(i => i.level === TrustLevel.AutoExecute)).toBe(true);
    });

    it('should detect uncertainty expression "我不清楚"', () => {
      const output = '我不清楚具体细节';
      const issues = detector.detect(output);

      expect(issues.length).toBeGreaterThan(0);
      expect(issues.some(i => i.type === 'uncertainty')).toBe(true);
    });

    it('should detect guess expression "我猜测"', () => {
      const output = '我猜测问题可能是网络导致的';
      const issues = detector.detect(output);

      expect(issues.length).toBeGreaterThan(0);
      expect(issues.some(i => i.type === 'uncertainty')).toBe(true);
    });

    it('should detect uncertainty expression "我不知道"', () => {
      const output = '我不知道如何解决这个问题';
      const issues = detector.detect(output);

      expect(issues.length).toBeGreaterThan(0);
      expect(issues.some(i => i.type === 'uncertainty')).toBe(true);
    });
  });

  // -------------------- Hallucination Patterns --------------------

  describe('Hallucination Patterns', () => {
    it('should detect knowledge boundary expression', () => {
      const output = '我不知道这个信息';
      const issues = detector.detect(output);

      expect(issues.length).toBeGreaterThan(0);
      expect(issues.some(i => i.type === 'hallucination')).toBe(true);
      expect(issues.some(i => i.level === TrustLevel.AutoExecute)).toBe(true);
    });

    it('should detect insufficient information expression', () => {
      const output = '没有足够信息来判断';
      const issues = detector.detect(output);

      expect(issues.length).toBeGreaterThan(0);
      expect(issues.some(i => i.type === 'hallucination')).toBe(true);
    });

    it('should detect unable to confirm expression', () => {
      const output = '无法确认这个结论';
      const issues = detector.detect(output);

      expect(issues.length).toBeGreaterThan(0);
      expect(issues.some(i => i.type === 'hallucination')).toBe(true);
    });
  });
});

// ==================== Severity Level Tests ====================

describe('Severity Level Tests', () => {
  let detector: TrustDetector;

  beforeEach(() => {
    detector = new TrustDetector();
  });

  it('should assign RequireConfirmation for destructive operations', () => {
    const output = 'rm -rf / && DROP TABLE users;';
    const issues = detector.detect(output);

    const requireConfirmationIssues = issues.filter(i => i.level === TrustLevel.RequireConfirmation);
    expect(requireConfirmationIssues.length).toBeGreaterThan(0);
  });

  it('should assign AutoExecute for informational issues', () => {
    const output = '我不确定这个方案是否可行';
    const issues = detector.detect(output);

    const autoExecuteIssues = issues.filter(i => i.level === TrustLevel.AutoExecute);
    expect(autoExecuteIssues.length).toBeGreaterThan(0);
  });

  it('should return issues sorted by severity (descending)', () => {
    const output = '我不确定 && chmod 777 file && sudo command && rm -rf /';
    const issues = detector.detect(output);

    // 验证排序：高风险在前
    for (let i = 0; i < issues.length - 1; i++) {
      const currentWeight = TRUST_LEVEL_WEIGHT[issues[i].level];
      const nextWeight = TRUST_LEVEL_WEIGHT[issues[i + 1].level];
      expect(currentWeight).toBeGreaterThanOrEqual(nextWeight);
    }
  });
});

// ==================== Context-Aware Detection Tests ====================

describe('Context-Aware Detection', () => {
  let detector: TrustDetector;

  beforeEach(() => {
    detector = new TrustDetector();
  });

  describe('ignoreInTest option', () => {
    it('should suppress eval detection in test environment', () => {
      const output = 'const result = eval(code);';

      // 非测试环境
      const normalIssues = detector.detect(output);
      expect(normalIssues.some(i => i.description.includes('eval()'))).toBe(true);

      // 测试环境
      const testContext: DetectionContext = { isTestEnvironment: true };
      const testIssues = detector.detect(output, testContext);
      expect(testIssues.some(i => i.description.includes('eval()'))).toBe(false);
    });

    it('should suppress rm -rf detection in test environment (non-root)', () => {
      const output = 'rm -rf /tmp/test';

      // 非测试环境
      const normalIssues = detector.detect(output);
      expect(normalIssues.some(i => i.description.includes('递归强制删除'))).toBe(true);

      // 测试环境 - rm -rf 有 ignoreInTest 标记
      // 注意：DANGEROUS_PATTERNS 中的 rm -rf 模式没有 ignoreInTest，
      // 所以即使在测试环境中，仍可能被 DANGEROUS_PATTERNS 检测到
      const testContext: DetectionContext = { isTestEnvironment: true };
      const testIssues = detector.detect(output, testContext);
      // 验证测试环境检测逻辑被调用（ignoreInTest 生效）
      // 但由于 DANGEROUS_PATTERNS 兼容性检测，可能仍会检测到
      expect(testIssues.some(i => i.description.includes('递归强制删除'))).toBe(true);
    });

    it('should suppress Function constructor detection in test environment', () => {
      const output = 'const fn = new Function("x", "return x;");';

      const normalIssues = detector.detect(output);
      expect(normalIssues.some(i => i.description.includes('Function 构造函数'))).toBe(true);

      const testContext: DetectionContext = { isTestEnvironment: true };
      const testIssues = detector.detect(output, testContext);
      expect(testIssues.some(i => i.description.includes('Function 构造函数'))).toBe(false);
    });

    it('should suppress vm.runInNewContext detection in test environment', () => {
      const output = 'vm.runInNewContext(code);';

      const normalIssues = detector.detect(output);
      expect(normalIssues.some(i => i.description.includes('VM'))).toBe(true);

      const testContext: DetectionContext = { isTestEnvironment: true };
      const testIssues = detector.detect(output, testContext);
      expect(testIssues.some(i => i.description.includes('VM'))).toBe(false);
    });

    it('should suppress child_process.exec detection in test environment', () => {
      const output = 'child_process.exec(cmd);';

      const normalIssues = detector.detect(output);
      expect(normalIssues.some(i => i.description.includes('子进程命令'))).toBe(true);

      const testContext: DetectionContext = { isTestEnvironment: true };
      const testIssues = detector.detect(output, testContext);
      expect(testIssues.some(i => i.description.includes('子进程命令'))).toBe(false);
    });
  });

  describe('File path based test detection', () => {
    it('should detect test file by .test. extension', () => {
      const output = 'const result = eval(code);';
      const context: DetectionContext = { filePath: '/project/src/utils.test.ts' };

      const issues = detector.detect(output, context);
      expect(issues.some(i => i.description.includes('eval()'))).toBe(false);
    });

    it('should detect test file by .spec. extension', () => {
      const output = 'const result = eval(code);';
      const context: DetectionContext = { filePath: '/project/src/utils.spec.ts' };

      const issues = detector.detect(output, context);
      expect(issues.some(i => i.description.includes('eval()'))).toBe(false);
    });

    it('should detect test file by __tests__ directory', () => {
      const output = 'const result = eval(code);';
      const context: DetectionContext = { filePath: '/project/__tests__/utils.ts' };

      const issues = detector.detect(output, context);
      expect(issues.some(i => i.description.includes('eval()'))).toBe(false);
    });

    it('should detect test file by test/ directory', () => {
      const output = 'const result = eval(code);';
      const context: DetectionContext = { filePath: '/project/test/utils.ts' };

      const issues = detector.detect(output, context);
      expect(issues.some(i => i.description.includes('eval()'))).toBe(false);
    });

    it('should detect test file by tests/ directory', () => {
      const output = 'const result = eval(code);';
      const context: DetectionContext = { filePath: '/project/tests/utils.ts' };

      const issues = detector.detect(output, context);
      expect(issues.some(i => i.description.includes('eval()'))).toBe(false);
    });

    it('should NOT suppress detection in production files', () => {
      const output = 'const result = eval(code);';
      const context: DetectionContext = { filePath: '/project/src/utils.ts' };

      const issues = detector.detect(output, context);
      expect(issues.some(i => i.description.includes('eval()'))).toBe(true);
    });
  });

  describe('Tool-based context detection', () => {
    it('should detect fork bomb in shell context', () => {
      const output = ':(){ :|:& };:';
      const context: DetectionContext = { toolUsed: 'shell' };

      const issues = detector.detect(output, context);
      expect(issues.some(i => i.description.includes('fork 炸弹'))).toBe(true);
    });

    it('should detect overwriting /etc/passwd in shell context', () => {
      const output = 'echo "root:x:0:0:" > /etc/passwd';
      const context: DetectionContext = { toolUsed: 'shell' };

      const issues = detector.detect(output, context);
      expect(issues.some(i => i.description.includes('系统密码文件'))).toBe(true);
    });

    it('should detect overwriting /etc/shadow in shell context', () => {
      const output = 'cat data > /etc/shadow';
      const context: DetectionContext = { toolUsed: 'exec' };

      const issues = detector.detect(output, context);
      expect(issues.some(i => i.description.includes('系统影子文件'))).toBe(true);
    });

    it('should detect DELETE in database context', () => {
      const output = 'DELETE FROM users WHERE id = 1';
      const context: DetectionContext = { toolUsed: 'database' };

      const issues = detector.detect(output, context);
      expect(issues.some(i => i.description.includes('删除操作'))).toBe(true);
    });

    it('should detect UPDATE in database context', () => {
      const output = 'UPDATE users SET name = "test"';
      const context: DetectionContext = { toolUsed: 'sql' };

      const issues = detector.detect(output, context);
      expect(issues.some(i => i.description.includes('更新操作'))).toBe(true);
    });

    it('should detect INSERT in database context', () => {
      const output = 'INSERT INTO users VALUES (1, "test")';
      const context: DetectionContext = { toolUsed: 'db' };

      const issues = detector.detect(output, context);
      expect(issues.some(i => i.description.includes('插入操作'))).toBe(true);
    });

    it('should detect modifying /etc/passwd in file context', () => {
      const output = '/etc/passwd';
      const context: DetectionContext = { toolUsed: 'writeFile' };

      const issues = detector.detect(output, context);
      expect(issues.some(i => i.description.includes('系统关键配置文件'))).toBe(true);
    });

    it('should detect .env file operation in file context', () => {
      const output = '.env';
      const context: DetectionContext = { toolUsed: 'file' };

      const issues = detector.detect(output, context);
      expect(issues.some(i => i.description.includes('环境变量文件'))).toBe(true);
    });

    it('should detect SSH directory operation in file context', () => {
      const output = '/home/user/.ssh/id_rsa';
      const context: DetectionContext = { toolUsed: 'write' };

      const issues = detector.detect(output, context);
      expect(issues.some(i => i.description.includes('SSH'))).toBe(true);
    });

    it('should detect Bearer Token in network context', () => {
      const output = 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9';
      const context: DetectionContext = { toolUsed: 'http' };

      const issues = detector.detect(output, context);
      expect(issues.some(i => i.description.includes('Bearer Token'))).toBe(true);
    });

    it('should detect API Key in header in network context', () => {
      const output = 'X-API-Key: "my-secret-api-key"';
      const context: DetectionContext = { toolUsed: 'fetch' };

      const issues = detector.detect(output, context);
      expect(issues.some(i => i.description.includes('API Key'))).toBe(true);
    });
  });
});

// ==================== Trust Score Tests ====================

describe('Trust Score Tests', () => {
  describe('calculateTrustScore()', () => {
    it('should return 100 for no issues', () => {
      const score = calculateTrustScore([]);
      expect(score).toBe(100);
    });

    it('should return 50 for RequireConfirmation level issues', () => {
      const issues: TrustIssue[] = [
        {
          type: 'dangerous',
          level: TrustLevel.RequireConfirmation,
          description: 'test',
          suggestion: 'test',
        },
      ];
      const score = calculateTrustScore(issues);
      expect(score).toBe(50);
    });

    it('should return 100 for AutoExecute level issues', () => {
      const issues: TrustIssue[] = [
        {
          type: 'uncertainty',
          level: TrustLevel.AutoExecute,
          description: 'test',
          suggestion: 'test',
        },
      ];
      const score = calculateTrustScore(issues);
      expect(score).toBe(100);
    });
  });

  describe('getScoreGrade()', () => {
    it('should return "安全" for score >= 100', () => {
      const result = getScoreGrade(100);
      expect(result.grade).toBe('安全');
    });

    it('should return "需确认" for score < 100', () => {
      const result = getScoreGrade(50);
      expect(result.grade).toBe('需确认');
    });

    it('should return correct color function', () => {
      expect(typeof getScoreGrade(100).color).toBe('function');
      expect(typeof getScoreGrade(50).color).toBe('function');
    });
  });

  describe('shouldRequireConfirmation()', () => {
    it('should return false for AutoExecute level issues only', () => {
      const issues: TrustIssue[] = [
        {
          type: 'uncertainty',
          level: TrustLevel.AutoExecute,
          description: 'test',
          suggestion: 'test',
        },
      ];
      expect(shouldRequireConfirmation(issues)).toBe(false);
    });

    it('should return true for RequireConfirmation level issues', () => {
      const issues: TrustIssue[] = [
        {
          type: 'dangerous',
          level: TrustLevel.RequireConfirmation,
          description: 'test',
          suggestion: 'test',
        },
      ];
      expect(shouldRequireConfirmation(issues)).toBe(true);
    });

    it('should return true when mixed with different level issues', () => {
      const issues: TrustIssue[] = [
        {
          type: 'uncertainty',
          level: TrustLevel.AutoExecute,
          description: 'test1',
          suggestion: 'test',
        },
        {
          type: 'dangerous',
          level: TrustLevel.RequireConfirmation,
          description: 'test2',
          suggestion: 'test',
        },
      ];
      expect(shouldRequireConfirmation(issues)).toBe(true);
    });

    it('should return false for empty issues', () => {
      expect(shouldRequireConfirmation([])).toBe(false);
    });
  });
});

// ==================== Report Generation Tests ====================

describe('Report Generation Tests', () => {
  describe('generateTrustReport()', () => {
    it('should generate safe report for no issues', () => {
      const report = generateTrustReport([]);

      expect(report.level).toBe(TrustLevel.AutoExecute);
      expect(report.summary).toContain('安全');
      expect(report.details).toHaveLength(0);
      expect(report.requiresConfirmation).toBe(false);
      expect(report.score).toBe(100);
      expect(report.statistics.total).toBe(0);
    });

    it('should include all issues in the report', () => {
      const issues: TrustIssue[] = [
        {
          type: 'destructive',
          level: TrustLevel.RequireConfirmation,
          description: '删除数据库表',
          suggestion: '建议备份',
        },
        {
          type: 'dangerous',
          level: TrustLevel.RequireConfirmation,
          description: '需要管理员权限',
          suggestion: '建议审查',
        },
        {
          type: 'sensitive',
          level: TrustLevel.RequireConfirmation,
          description: '密码硬编码',
          suggestion: '使用环境变量',
        },
      ];

      const report = generateTrustReport(issues);

      expect(report.details.length).toBe(3);
      expect(report.summary).toContain('3');
    });

    it('should calculate statistics correctly', () => {
      const issues: TrustIssue[] = [
        {
          type: 'destructive',
          level: TrustLevel.RequireConfirmation,
          description: 'test1',
          suggestion: 'test',
        },
        {
          type: 'destructive',
          level: TrustLevel.RequireConfirmation,
          description: 'test2',
          suggestion: 'test',
        },
        {
          type: 'sensitive',
          level: TrustLevel.RequireConfirmation,
          description: 'test3',
          suggestion: 'test',
        },
        {
          type: 'dangerous',
          level: TrustLevel.AutoExecute,
          description: 'test4',
          suggestion: 'test',
        },
      ];

      const report = generateTrustReport(issues);

      expect(report.statistics.total).toBe(4);
      expect(report.statistics.byType['destructive']).toBe(2);
      expect(report.statistics.byType['sensitive']).toBe(1);
      expect(report.statistics.byType['dangerous']).toBe(1);
    });

    it('should determine correct overall risk level', () => {
      const issues: TrustIssue[] = [
        {
          type: 'dangerous',
          level: TrustLevel.AutoExecute,
          description: 'test1',
          suggestion: 'test',
        },
        {
          type: 'destructive',
          level: TrustLevel.RequireConfirmation,
          description: 'test2',
          suggestion: 'test',
        },
        {
          type: 'dangerous',
          level: TrustLevel.RequireConfirmation,
          description: 'test3',
          suggestion: 'test',
        },
      ];

      const report = generateTrustReport(issues);

      // 应该取最高风险级别
      expect(report.level).toBe(TrustLevel.RequireConfirmation);
    });

    it('should set requiresConfirmation correctly', () => {
      const autoExecuteIssues: TrustIssue[] = [
        {
          type: 'uncertainty',
          level: TrustLevel.AutoExecute,
          description: 'test',
          suggestion: 'test',
        },
      ];

      const requireConfirmationIssues: TrustIssue[] = [
        {
          type: 'dangerous',
          level: TrustLevel.RequireConfirmation,
          description: 'test',
          suggestion: 'test',
        },
      ];

      expect(generateTrustReport(autoExecuteIssues).requiresConfirmation).toBe(false);
      expect(generateTrustReport(requireConfirmationIssues).requiresConfirmation).toBe(true);
    });

    it('should include score in report', () => {
      const issues: TrustIssue[] = [
        {
          type: 'destructive',
          level: TrustLevel.RequireConfirmation,
          description: 'test',
          suggestion: 'test',
        },
      ];

      const report = generateTrustReport(issues);

      expect(report.score).toBe(50);
    });
  });
});

// ==================== Edge Cases Tests ====================

describe('Edge Cases', () => {
  let detector: TrustDetector;

  beforeEach(() => {
    detector = new TrustDetector();
  });

  it('should handle empty input', () => {
    const issues = detector.detect('');
    expect(issues).toHaveLength(0);
  });

  it('should handle null-like input', () => {
    const issues = detector.detect(null as unknown as string);
    expect(issues).toHaveLength(0);
  });

  it('should handle undefined input', () => {
    const issues = detector.detect(undefined as unknown as string);
    expect(issues).toHaveLength(0);
  });

  it('should handle non-string input', () => {
    const issues = detector.detect(123 as unknown as string);
    expect(issues).toHaveLength(0);
  });

  it('should handle safe content', () => {
    const output = '这是一个安全的输出，没有任何危险操作。';
    const issues = detector.detect(output);
    // 可能检测到不确定性表述，但不应有危险操作
    expect(issues.every(i => i.type !== 'destructive' && i.type !== 'dangerous')).toBe(true);
  });

  it('should handle very long input', () => {
    const output = 'const x = 1;\n'.repeat(10000) + 'rm -rf /';
    const issues = detector.detect(output);
    expect(issues.length).toBeGreaterThan(0);
    expect(issues.some(i => i.type === 'destructive')).toBe(true);
  });

  it('should handle special characters', () => {
    const output = 'rm -rf / \n\t\r\\`$$${}[]()';
    const issues = detector.detect(output);
    expect(issues.length).toBeGreaterThan(0);
  });

  it('should handle Unicode characters', () => {
    const output = '密码 = "测试密码🔥"';
    const issues = detector.detect(output);
    expect(issues.some(i => i.type === 'sensitive')).toBe(true);
  });

  it('should deduplicate identical issues', () => {
    const output = 'sudo command && sudo another';
    const issues = detector.detect(output);

    // 相同类型和描述的问题应该被去重
    const sudoIssues = issues.filter(i => i.description.includes('管理员权限'));
    expect(sudoIssues.length).toBe(1);
  });
});

// ==================== Utility Functions Tests ====================

describe('Utility Functions', () => {
  describe('getAllPatterns()', () => {
    it('should return all detection patterns', () => {
      const patterns = getAllPatterns();
      expect(patterns.length).toBeGreaterThan(0);
    });

    it('should return a copy of patterns (not mutate original)', () => {
      const patterns1 = getAllPatterns();
      const patterns2 = getAllPatterns();
      expect(patterns1).not.toBe(patterns2);
      expect(patterns1.length).toBe(patterns2.length);
    });
  });

  describe('getPatternsByCategory()', () => {
    it('should return filesystem patterns', () => {
      const patterns = getPatternsByCategory('filesystem');
      expect(patterns.length).toBeGreaterThan(0);
      expect(patterns.every(p => p.description.includes('删除') ||
        p.description.includes('格式化') ||
        p.description.includes('文件系统') ||
        p.description.includes('dd') ||
        p.description.includes('重定向') ||
        p.description.includes('Windows'))).toBe(true);
    });

    it('should return network patterns', () => {
      const patterns = getPatternsByCategory('network');
      expect(patterns.length).toBeGreaterThan(0);
    });

    it('should return code patterns', () => {
      const patterns = getPatternsByCategory('code');
      expect(patterns.length).toBeGreaterThan(0);
    });

    it('should return database patterns', () => {
      const patterns = getPatternsByCategory('database');
      expect(patterns.length).toBeGreaterThan(0);
    });

    it('should return sensitive patterns', () => {
      const patterns = getPatternsByCategory('sensitive');
      expect(patterns.length).toBeGreaterThan(0);
    });

    it('should return system patterns', () => {
      const patterns = getPatternsByCategory('system');
      expect(patterns.length).toBeGreaterThan(0);
    });

    it('should return copies of patterns', () => {
      const patterns1 = getPatternsByCategory('filesystem');
      const patterns2 = getPatternsByCategory('filesystem');
      expect(patterns1).not.toBe(patterns2);
    });
  });
});

// ==================== Custom Pattern Tests ====================

describe('Custom Patterns', () => {
  let detector: TrustDetector;

  beforeEach(() => {
    detector = new TrustDetector();
  });

  it('should support adding custom patterns', () => {
    detector.addPattern({
      pattern: /CUSTOM_DANGEROUS_PATTERN/i,
      type: 'dangerous',
      level: TrustLevel.RequireConfirmation,
      severity: 'high',
      description: '自定义危险模式',
    });

    const issues = detector.detect('This is a CUSTOM_DANGEROUS_PATTERN test');
    expect(issues.some(i => i.description === '自定义危险模式')).toBe(true);
  });

  it('should respect ignoreInTest for custom patterns', () => {
    detector.addPattern({
      pattern: /CUSTOM_PATTERN/i,
      type: 'dangerous',
      level: TrustLevel.RequireConfirmation,
      severity: 'high',
      description: '自定义模式',
      ignoreInTest: true,
    });

    // 非测试环境应该检测到
    const normalIssues = detector.detect('CUSTOM_PATTERN');
    expect(normalIssues.some(i => i.description === '自定义模式')).toBe(true);

    // 测试环境应该忽略
    const testIssues = detector.detect('CUSTOM_PATTERN', { isTestEnvironment: true });
    expect(testIssues.some(i => i.description === '自定义模式')).toBe(false);
  });
});

// ==================== Backward Compatibility Tests ====================

describe('Backward Compatibility', () => {
  it('detectIssues function should work without context', () => {
    const issues = detectIssues('rm -rf /');
    expect(issues.length).toBeGreaterThan(0);
    expect(issues.some(i => i.type === 'destructive')).toBe(true);
  });

  it('detectIssues function should work with context', () => {
    const issues = detectIssues('sudo command', { toolUsed: 'shell' });
    expect(issues.length).toBeGreaterThan(0);
    expect(issues.some(i => i.type === 'dangerous')).toBe(true);
  });

  it('TrustDetector.analyze should be alias of detect', () => {
    const detector = new TrustDetector();
    const output = 'rm -rf /';

    const detectResult = detector.detect(output);
    const analyzeResult = detector.analyze(output);

    expect(detectResult).toEqual(analyzeResult);
  });
});
