/**
 * Autonomous Goal System
 *
 * 自主目标管理系统 - 让 Agent 能够主动发现项目中的问题并生成改进建议。
 * 通过内置的健康检查（Git、依赖、代码质量、安全），在启动时和运行中
 * 自动检测问题，生成可操作的目标。
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { createLogger } from '../services/logger.js';

const logger = createLogger('AutonomousGoals');

// ==================== 常量定义 ====================

const MAX_GOALS = 10; // 最大目标数量

// ==================== 类型定义 ====================

export interface AutonomousGoal {
  id: string;
  type: 'health-check' | 'improvement' | 'learning' | 'maintenance';
  priority: number;          // 0-100
  description: string;
  status: 'pending' | 'in-progress' | 'completed' | 'deferred';
  createdAt: string;
  lastCheckedAt?: string;
  findings?: string[];
}

export interface HealthCheckResult {
  category: string;
  status: 'healthy' | 'warning' | 'critical';
  message: string;
  suggestion?: string;
}

// ==================== AutonomousGoalManager ====================

export class AutonomousGoalManager {
  private goals: Map<string, AutonomousGoal> = new Map();
  private healthChecks: Array<(rootDir: string) => Promise<HealthCheckResult[]>> = [];

  constructor() {
    // 注册内置健康检查
    this.healthChecks.push(
      (dir) => this.checkGitStatus(dir),
      (dir) => this.checkDependencies(dir),
      (dir) => this.checkCodeQuality(dir),
      (dir) => this.checkSecurityVulnerabilities(dir),
    );
  }

  /**
   * 注册自定义健康检查
   */
  registerHealthCheck(check: (rootDir: string) => Promise<HealthCheckResult[]>): void {
    this.healthChecks.push(check);
  }

  /**
   * 运行所有已注册的健康检查
   */
  async runHealthChecks(rootDir: string): Promise<HealthCheckResult[]> {
    const allResults: HealthCheckResult[] = [];
    for (const check of this.healthChecks) {
      try {
        const results = await check(rootDir);
        allResults.push(...results);
      } catch {
        // 单个检查失败不影响其他检查
      }
      // 限制结果数量，避免过多目标
      if (allResults.length >= MAX_GOALS * 2) {
        break;
      }
    }
    return allResults;
  }

  /**
   * 从健康检查结果生成自主目标
   */
  async generateGoalsFromHealthChecks(results: HealthCheckResult[]): Promise<AutonomousGoal[]> {
    const newGoals: AutonomousGoal[] = [];

    for (const result of results) {
      if (result.status === 'healthy') continue;

      const goalId = `goal-${result.category}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

      const goal: AutonomousGoal = {
        id: goalId,
        type: 'health-check',
        priority: result.status === 'critical' ? 80 : result.status === 'warning' ? 50 : 20,
        description: result.message,
        status: 'pending',
        createdAt: new Date().toISOString(),
        findings: result.suggestion ? [result.suggestion] : [],
      };

      // 避免重复目标
      const isDuplicate = [...this.goals.values()].some(
        existing => existing.description === goal.description && existing.status !== 'completed'
      );
      if (!isDuplicate) {
        this.goals.set(goalId, goal);
        newGoals.push(goal);
      }

      // 限制目标数量
      if (newGoals.length >= MAX_GOALS) {
        logger.warn(`生成了 ${results.length} 个目标，已限制为前 ${MAX_GOALS} 个`);
        break;
      }
    }

    return newGoals;
  }

  /**
   * 获取所有待处理目标（按优先级排序）
   */
  async getPendingGoals(): Promise<AutonomousGoal[]> {
    return [...this.goals.values()]
      .filter(g => g.status === 'pending')
      .sort((a, b) => b.priority - a.priority);
  }

  /**
   * 标记目标为已完成
   */
  async completeGoal(goalId: string): Promise<void> {
    const goal = this.goals.get(goalId);
    if (goal) {
      goal.status = 'completed';
      goal.lastCheckedAt = new Date().toISOString();
    }
  }

  /**
   * 延迟目标
   */
  async deferGoal(goalId: string, reason: string): Promise<void> {
    const goal = this.goals.get(goalId);
    if (goal) {
      goal.status = 'deferred';
      goal.lastCheckedAt = new Date().toISOString();
      if (!goal.findings) goal.findings = [];
      goal.findings.push(`延迟原因: ${reason}`);
    }
  }

  // ==================== 内置健康检查 ====================

  /**
   * Git 状态检查：未提交更改、大型文件
   */
  private async checkGitStatus(rootDir: string): Promise<HealthCheckResult[]> {
    const results: HealthCheckResult[] = [];

    try {
      // 检查是否是 Git 仓库
      const gitDir = path.join(rootDir, '.git');
      try {
        await fs.access(gitDir);
      } catch {
        // 不是 Git 仓库，跳过
        return results;
      }

      // 检查 package-lock.json 是否存在
      const lockFile = path.join(rootDir, 'package-lock.json');
      const hasLockFile = await this.fileExists(lockFile);
      const pkgFile = path.join(rootDir, 'package.json');
      const hasPkgFile = await this.fileExists(pkgFile);

      if (hasPkgFile && !hasLockFile) {
        results.push({
          category: 'git',
          status: 'warning',
          message: 'package.json 存在但缺少 package-lock.json',
          suggestion: '运行 npm install 生成锁文件，确保依赖版本一致性',
        });
      }

      // 检查 .gitignore 是否存在
      const gitignoreFile = path.join(rootDir, '.gitignore');
      if (!(await this.fileExists(gitignoreFile))) {
        results.push({
          category: 'git',
          status: 'warning',
          message: '缺少 .gitignore 文件',
          suggestion: '创建 .gitignore 文件，排除 node_modules、dist 等目录',
        });
      }

      // 检查 dist 目录是否被忽略（简单检查 .gitignore 内容）
      if (await this.fileExists(gitignoreFile)) {
        try {
          const gitignoreContent = await fs.readFile(gitignoreFile, 'utf-8');
          if (!gitignoreContent.includes('dist') && !gitignoreContent.includes('build')) {
            results.push({
              category: 'git',
              status: 'warning',
              message: '.gitignore 可能缺少 dist/ 或 build/ 目录',
              suggestion: '在 .gitignore 中添加 dist/ 和 build/ 目录',
            });
          }
        } catch {
          // 读取失败，跳过
        }
      }
    } catch {
      // Git 检查失败，静默跳过
    }

    return results;
  }

  /**
   * 依赖检查：读取 package.json 检查过时依赖
   */
  private async checkDependencies(rootDir: string): Promise<HealthCheckResult[]> {
    const results: HealthCheckResult[] = [];

    try {
      const pkgPath = path.join(rootDir, 'package.json');
      const pkgContent = await fs.readFile(pkgPath, 'utf-8');
      const pkg = JSON.parse(pkgContent);

      const allDeps: Record<string, string> = {
        ...(pkg.dependencies || {}),
        ...(pkg.devDependencies || {}),
      };

      if (Object.keys(allDeps).length === 0) {
        return results;
      }

      // 检查常见过时版本模式
      const outdatedPatterns: Array<{ pattern: RegExp; name: string; suggestion: string }> = [
        { pattern: /^0\./, name: '0.x 版本', suggestion: '考虑升级到稳定版本' },
        { pattern: /^\^0\./, name: '0.x 版本', suggestion: '考虑升级到稳定版本' },
      ];

      let outdatedCount = 0;
      const outdatedPackages: string[] = [];

      for (const [name, version] of Object.entries(allDeps)) {
        for (const { pattern } of outdatedPatterns) {
          if (pattern.test(version)) {
            outdatedCount++;
            if (outdatedPackages.length < 5) {
              outdatedPackages.push(`${name}@${version}`);
            }
            break;
          }
        }
      }

      if (outdatedCount > 3) {
        results.push({
          category: 'dependencies',
          status: 'warning',
          message: `发现 ${outdatedCount} 个 0.x 版本的依赖包`,
          suggestion: `过时依赖: ${outdatedPackages.join(', ')}${outdatedCount > 5 ? '...' : ''}。考虑运行 npm audit 检查安全更新`,
        });
      }

      // 检查是否缺少 scripts 中的常用脚本
      const scripts = pkg.scripts || {};
      const recommendedScripts = ['build', 'test', 'lint'];
      const missingScripts = recommendedScripts.filter(s => !scripts[s]);

      if (missingScripts.length > 0 && Object.keys(allDeps).length > 5) {
        results.push({
          category: 'dependencies',
          status: 'warning',
          message: `package.json 缺少常用脚本: ${missingScripts.join(', ')}`,
          suggestion: `建议添加 ${missingScripts.join(', ')} 脚本以规范化开发流程`,
        });
      }
    } catch {
      // 没有 package.json，跳过
    }

    return results;
  }

  /**
   * 代码质量检查：TODO/FIXME、大文件、console.log
   */
  private async checkCodeQuality(rootDir: string): Promise<HealthCheckResult[]> {
    const results: HealthCheckResult[] = [];
    const srcDir = path.join(rootDir, 'src');

    try {
      await fs.access(srcDir);
    } catch {
      // 没有 src 目录，跳过
      return results;
    }

    try {
      const todoCount = await this.countPatternInDir(srcDir, /\b(TODO|FIXME|HACK|XXX)\b/g);
      const consoleLogCount = await this.countPatternInDir(srcDir, /console\.(log|warn|error|debug)\s*\(/g);
      const largeFiles = await this.findLargeFiles(srcDir, 500);

      if (todoCount > 10) {
        results.push({
          category: 'code-quality',
          status: 'warning',
          message: `发现 ${todoCount} 处 TODO/FIXME/HACK 注释`,
          suggestion: '建议逐步清理或转化为正式的 issue 跟踪',
        });
      }

      if (consoleLogCount > 5) {
        results.push({
          category: 'code-quality',
          status: 'warning',
          message: `发现 ${consoleLogCount} 处 console.log 调用`,
          suggestion: '建议使用正式的日志系统替代 console.log，或清理调试日志',
        });
      }

      if (largeFiles.length > 0) {
        const fileNames = largeFiles.slice(0, 3).map(f => path.relative(rootDir, f));
        results.push({
          category: 'code-quality',
          status: 'warning',
          message: `发现 ${largeFiles.length} 个超过 500 行的文件`,
          suggestion: `大文件: ${fileNames.join(', ')}${largeFiles.length > 3 ? '...' : ''}。考虑拆分为更小的模块`,
        });
      }
    } catch {
      // 代码质量检查失败，静默跳过
    }

    return results;
  }

  /**
   * 安全检查：硬编码密钥、API key
   */
  private async checkSecurityVulnerabilities(rootDir: string): Promise<HealthCheckResult[]> {
    const results: HealthCheckResult[] = [];
    const srcDir = path.join(rootDir, 'src');

    try {
      await fs.access(srcDir);
    } catch {
      return results;
    }

    try {
      // 检查硬编码密钥模式
      const secretPatterns = [
        { regex: /(?:api[_-]?key|apikey|secret[_-]?key|password|token)\s*[:=]\s*['"][^'"]{8,}['"]/gi, label: 'API 密钥/密码' },
        { regex: /sk-[a-zA-Z0-9]{20,}/g, label: 'OpenAI API Key' },
        { regex: /ghp_[a-zA-Z0-9]{36}/g, label: 'GitHub Token' },
        { regex: /AKIA[0-9A-Z]{16}/g, label: 'AWS Access Key' },
      ];

      let totalSecrets = 0;
      const foundTypes: string[] = [];

      for (const { regex, label } of secretPatterns) {
        const count = await this.countPatternInDir(srcDir, regex);
        if (count > 0) {
          totalSecrets += count;
          foundTypes.push(`${label}(${count})`);
        }
      }

      if (totalSecrets > 0) {
        results.push({
          category: 'security',
          status: 'critical',
          message: `发现 ${totalSecrets} 处可能的硬编码密钥: ${foundTypes.join(', ')}`,
          suggestion: '将密钥移至 .env 文件或环境变量，确保 .env 已加入 .gitignore',
        });
      }

      // 检查 .env 文件是否被 gitignore
      const envFile = path.join(rootDir, '.env');
      const gitignoreFile = path.join(rootDir, '.gitignore');

      if (await this.fileExists(envFile)) {
        if (await this.fileExists(gitignoreFile)) {
          const gitignoreContent = await fs.readFile(gitignoreFile, 'utf-8');
          if (!gitignoreContent.includes('.env')) {
            results.push({
              category: 'security',
              status: 'critical',
              message: '.env 文件存在但未被 .gitignore 排除',
              suggestion: '在 .gitignore 中添加 .env 以防止敏感信息泄露',
            });
          }
        } else {
          results.push({
            category: 'security',
            status: 'critical',
            message: '.env 文件存在但缺少 .gitignore',
            suggestion: '创建 .gitignore 并添加 .env 以防止敏感信息泄露',
          });
        }
      }
    } catch {
      // 安全检查失败，静默跳过
    }

    return results;
  }

  // ==================== 运行所有检查 ====================

  /**
   * 运行所有健康检查并生成目标
   */
  async runAllChecks(rootDir: string): Promise<HealthCheckResult[]> {
    const results = await this.runHealthChecks(rootDir);
    await this.generateGoalsFromHealthChecks(results);
    return results;
  }

  /**
   * 生成启动建议列表
   */
  async generateStartupSuggestions(rootDir: string): Promise<string[]> {
    const results = await this.runAllChecks(rootDir);
    const suggestions: string[] = [];

    for (const result of results) {
      if (result.status === 'critical') {
        suggestions.push(`[严重] ${result.message}${result.suggestion ? ` - ${result.suggestion}` : ''}`);
      } else if (result.status === 'warning') {
        suggestions.push(`[警告] ${result.message}${result.suggestion ? ` - ${result.suggestion}` : ''}`);
      }
    }

    // 最多返回 5 条建议，避免信息过载
    return suggestions.slice(0, 5);
  }

  /**
   * 获取所有目标（包括已完成和延迟的）
   */
  getAllGoals(): AutonomousGoal[] {
    return [...this.goals.values()];
  }

  /**
   * 清除已完成的目标
   */
  clearCompletedGoals(): void {
    for (const [id, goal] of this.goals) {
      if (goal.status === 'completed') {
        this.goals.delete(id);
      }
    }
  }

  // ==================== 工具方法 ====================

  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 在目录中递归统计匹配模式的次数
   */
  private async countPatternInDir(dirPath: string, pattern: RegExp): Promise<number> {
    let count = 0;
    const maxFiles = 100; // 限制扫描文件数量，确保速度
    let filesScanned = 0;

    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        if (filesScanned >= maxFiles) break;

        const fullPath = path.join(dirPath, entry.name);

        // 跳过 node_modules、dist、.git 等目录
        if (entry.isDirectory()) {
          if (['node_modules', 'dist', '.git', 'coverage', '.next', '.nuxt', 'build'].includes(entry.name)) {
            continue;
          }
          count += await this.countPatternInDir(fullPath, pattern);
          continue;
        }

        // 只扫描代码文件
        if (!this.isCodeFile(entry.name)) continue;

        filesScanned++;
        try {
          const content = await fs.readFile(fullPath, 'utf-8');
          const matches = content.match(pattern);
          if (matches) {
            count += matches.length;
          }
        } catch {
          // 读取文件失败，跳过
        }
      }
    } catch {
      // 目录读取失败，跳过
    }

    return count;
  }

  /**
   * 查找超过指定行数的文件
   */
  private async findLargeFiles(dirPath: string, maxLines: number): Promise<string[]> {
    const largeFiles: string[] = [];
    const maxFiles = 100;
    let filesScanned = 0;

    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        if (filesScanned >= maxFiles) break;

        const fullPath = path.join(dirPath, entry.name);

        if (entry.isDirectory()) {
          if (['node_modules', 'dist', '.git', 'coverage', '.next', '.nuxt', 'build'].includes(entry.name)) {
            continue;
          }
          largeFiles.push(...await this.findLargeFiles(fullPath, maxLines));
          continue;
        }

        if (!this.isCodeFile(entry.name)) continue;

        filesScanned++;
        try {
          const content = await fs.readFile(fullPath, 'utf-8');
          const lineCount = content.split('\n').length;
          if (lineCount > maxLines) {
            largeFiles.push(fullPath);
          }
        } catch {
          // 读取文件失败，跳过
        }
      }
    } catch {
      // 目录读取失败，跳过
    }

    return largeFiles;
  }

  /**
   * 判断文件是否是代码文件
   */
  private isCodeFile(fileName: string): boolean {
    const codeExtensions = [
      '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
      '.py', '.rb', '.go', '.rs', '.java', '.kt',
      '.c', '.cpp', '.h', '.hpp',
      '.vue', '.svelte', '.astro',
    ];
    return codeExtensions.some(ext => fileName.endsWith(ext));
  }
}

/** 全局实例 */
export const autonomousGoalManager = new AutonomousGoalManager();
