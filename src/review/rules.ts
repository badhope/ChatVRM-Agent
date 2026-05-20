import path from 'path';
import fs from 'fs/promises';
import { ESLint } from 'eslint';
import type { ReviewIssue } from './types.js';

/**
 * 默认 ESLint 配置（当用户没有本地配置时使用）
 */
const DEFAULT_ESLINT_CONFIG: ESLint.ConfigData = {
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
  },
  globals: {
    console: 'readonly',
    process: 'readonly',
    Buffer: 'readonly',
    setTimeout: 'readonly',
    clearTimeout: 'readonly',
    setInterval: 'readonly',
    clearInterval: 'readonly',
    setImmediate: 'readonly',
    clearImmediate: 'readonly',
  },
  rules: {
    // 安全相关
    'no-eval': 'error',
    'no-implied-eval': 'error',
    'no-new-func': 'error',

    // Bug 预防
    'eqeqeq': ['warn', 'always'],
    'no-catch-shadow': 'warn',
    'no-promise-executor-return': 'error',
    'no-unsafe-optional-chaining': 'error',

    // 代码质量
    'no-console': 'off',
    'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    'prefer-const': 'warn',
  },
};

/**
 * ESLint 严重程度到 ReviewIssue 严重程度的映射
 */
const SEVERITY_MAP: Record<number, 'error' | 'warning' | 'info'> = {
  2: 'error',
  1: 'warning',
  0: 'info',
};

/**
 * 规则分类映射
 */
const RULE_CATEGORIES: Record<string, 'security' | 'bugs' | 'performance' | 'quality'> = {
  // 安全
  'no-eval': 'security',
  'no-implied-eval': 'security',
  'no-new-func': 'security',
  'no-script-url': 'security',

  // Bug
  'eqeqeq': 'bugs',
  'no-catch-shadow': 'bugs',
  'no-promise-executor-return': 'bugs',
  'no-unsafe-optional-chaining': 'bugs',
  'no-unreachable': 'bugs',
  'no-constant-condition': 'bugs',

  // 性能
  'no-await-in-loop': 'performance',

  // 质量
  'no-unused-vars': 'quality',
  'prefer-const': 'quality',
  'no-var': 'quality',
};

/**
 * 代码规则引擎 - 基于 ESLint
 */
export class ReviewRulesEngine {
  private eslint: ESLint | null = null;
  private enabledRules: Set<string> = new Set();
  private disabledRules: Set<string> = new Set();
  private cwd: string;
  private initialized = false;

  constructor(cwd: string = process.cwd()) {
    this.cwd = cwd;
  }

  /**
   * 初始化 ESLint 实例
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    const hasLocalConfig = await this.hasLocalEslintConfig();

    this.eslint = new ESLint({
      cwd: this.cwd,
      useEslintrc: hasLocalConfig,
      overrideConfig: hasLocalConfig ? undefined : DEFAULT_ESLINT_CONFIG,
      extensions: ['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs'],
    } as ESLint.Options);

    this.initialized = true;
  }

  /**
   * 检查是否存在本地 ESLint 配置
   */
  private async hasLocalEslintConfig(): Promise<boolean> {
    const configFiles = [
      '.eslintrc.js',
      '.eslintrc.cjs',
      '.eslintrc.yaml',
      '.eslintrc.yml',
      '.eslintrc.json',
      '.eslintrc',
      'eslint.config.js',
      'eslint.config.mjs',
    ];

    for (const file of configFiles) {
      try {
        await fs.access(path.join(this.cwd, file));
        return true;
      } catch {
        // 文件不存在，继续检查下一个
      }
    }

    // 检查 package.json 中是否有 eslintConfig
    try {
      const pkgPath = path.join(this.cwd, 'package.json');
      const pkg = JSON.parse(await fs.readFile(pkgPath, 'utf-8'));
      if (pkg.eslintConfig) return true;
    } catch {
      // 忽略错误
    }

    return false;
  }

  /**
   * 分析代码文件
   * @param filePath 文件路径
   * @returns 检测到的问题列表
   */
  async analyze(filePath: string): Promise<ReviewIssue[]> {
    await this.initialize();

    if (!this.eslint) {
      throw new Error('ESLint 未初始化');
    }

    try {
      const results = await this.eslint.lintFiles([filePath]);
      const issues: ReviewIssue[] = [];

      for (const result of results) {
        for (const message of result.messages) {
          // 检查规则是否被禁用
          if (this.disabledRules.has(message.ruleId || 'unknown')) {
            continue;
          }

          // 检查规则是否被强制启用
          if (this.enabledRules.size > 0 && !this.enabledRules.has(message.ruleId || 'unknown')) {
            continue;
          }

          issues.push(this.convertToReviewIssue(message, filePath));
        }
      }

      return issues;
    } catch (error) {
      // ESLint 分析失败时，返回一个错误提示
      return [{
        ruleId: 'ESLINT_ERROR',
        message: `ESLint 分析失败: ${error instanceof Error ? error.message : String(error)}`,
        severity: 'warning',
        category: 'quality',
        line: 1,
        suggestion: '请检查 ESLint 配置或文件语法',
      }];
    }
  }

  /**
   * 将 ESLint 消息转换为 ReviewIssue
   */
  private convertToReviewIssue(
    message: { ruleId: string | null; severity: number; message: string; line?: number; column?: number },
    filePath: string
  ): ReviewIssue {
    const ruleId = message.ruleId || 'unknown';
    const severity = SEVERITY_MAP[message.severity] || 'info';
    const category = RULE_CATEGORIES[ruleId] || 'quality';

    return {
      ruleId,
      message: message.message,
      severity,
      category,
      line: message.line || 1,
      column: message.column,
      suggestion: this.getSuggestion(ruleId, message.message),
    };
  }

  /**
   * 获取规则建议
   */
  private getSuggestion(ruleId: string, message: string): string | undefined {
    const suggestions: Record<string, string> = {
      'no-eval': '避免使用 eval()，考虑使用 JSON.parse 或其他安全替代方案',
      'no-implied-eval': '避免使用隐式 eval，如 setTimeout 传入字符串',
      'no-new-func': '避免使用 Function 构造函数',
      'eqeqeq': '使用 === 和 !== 进行严格相等比较',
      'no-unused-vars': '删除未使用的变量，或在其名称前加下划线前缀',
      'prefer-const': '对于不会被重新赋值的变量，使用 const 声明',
      'no-var': '使用 let 或 const 替代 var',
      'no-await-in-loop': '考虑使用 Promise.all() 并行执行异步操作',
    };

    return suggestions[ruleId];
  }

  /**
   * 获取当前启用的规则列表
   */
  async getRules(): Promise<string[]> {
    await this.initialize();

    if (!this.eslint) return [];

    try {
      const rules = await this.eslint.calculateConfigForFile('dummy.js');
      return Object.keys(rules.rules || {});
    } catch {
      return Object.keys(DEFAULT_ESLINT_CONFIG.rules || {});
    }
  }

  /**
   * 启用指定规则
   */
  enableRule(ruleId: string): void {
    this.enabledRules.add(ruleId);
    this.disabledRules.delete(ruleId);
  }

  /**
   * 禁用指定规则
   */
  disableRule(ruleId: string): void {
    this.disabledRules.add(ruleId);
    this.enabledRules.delete(ruleId);
  }

  /**
   * 快速规则检测（基于正则，无需 ESLint 初始化）
   * @param content 代码内容
   * @param filePath 文件路径
   * @returns 检测到的问题列表
   */
  static quickCheck(content: string, filePath: string): ReviewIssue[] {
    const issues: ReviewIssue[] = [];
    const lines = content.split('\n');
    const ext = path.extname(filePath).toLowerCase();

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNum = i + 1;

      // === 安全审计 ===
      if (/password\s*[:=]\s*['"][^'"]{3,}/i.test(line) || /api[_-]?key\s*[:=]\s*['"][^'"]{3,}/i.test(line)) {
        issues.push({
          ruleId: 'SEC001',
          message: '检测到硬编码的敏感信息（密码或API密钥）',
          severity: 'error',
          category: 'security',
          line: lineNum,
          suggestion: '使用环境变量或配置管理工具存储敏感信息',
          code: line.trim(),
        });
      }

      if (/\+\s*['"`].*SELECT|INSERT|UPDATE|DELETE|DROP/i.test(line) && !/prepared|parameterized|escape/i.test(line)) {
        issues.push({
          ruleId: 'SEC002',
          message: '潜在的SQL注入风险：字符串拼接SQL语句',
          severity: 'error',
          category: 'security',
          line: lineNum,
          suggestion: '使用参数化查询或ORM',
          code: line.trim(),
        });
      }

      if (/\.innerHTML\s*=/.test(line)) {
        issues.push({
          ruleId: 'SEC004',
          message: '使用innerHTML可能导致XSS攻击',
          severity: 'warning',
          category: 'security',
          line: lineNum,
          suggestion: '使用textContent或DOMPurify进行清理',
          code: line.trim(),
        });
      }

      // === Bug检测 ===
      if ((ext === '.js' || ext === '.ts' || ext === '.jsx' || ext === '.tsx') && /[^=!]==[^=]/.test(line) && !/===/.test(line)) {
        issues.push({
          ruleId: 'BUG001',
          message: '使用==可能导致类型转换问题，建议使用===',
          severity: 'warning',
          category: 'bugs',
          line: lineNum,
          suggestion: '使用===进行严格比较',
          code: line.trim(),
        });
      }

      if (/catch\s*\([^)]*\)\s*\{\s*\}/.test(line)) {
        issues.push({
          ruleId: 'BUG002',
          message: '空的catch块会吞掉错误',
          severity: 'warning',
          category: 'bugs',
          line: lineNum,
          suggestion: '至少记录错误日志',
          code: line.trim(),
        });
      }

      // === 代码质量 ===
      if (line.length > 150) {
        issues.push({
          ruleId: 'QUAL001',
          message: `行过长 (${line.length} 字符)，建议不超过120字符`,
          severity: 'info',
          category: 'quality',
          line: lineNum,
          suggestion: '拆分为多行',
        });
      }

      if (/\/\/\s*(TODO|FIXME|HACK|XXX)/i.test(line) || /#\s*(TODO|FIXME|HACK|XXX)/i.test(line)) {
        issues.push({
          ruleId: 'QUAL002',
          message: '代码中包含TODO/FIXME标记',
          severity: 'info',
          category: 'quality',
          line: lineNum,
          code: line.trim(),
        });
      }
    }

    return issues;
  }
}
