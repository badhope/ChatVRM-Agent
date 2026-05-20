import fs from 'fs/promises';
import path from 'path';
import type { ReviewResult, ReviewOptions, ReviewIssue } from './types.js';
import { calculateMetrics } from './metrics.js';
import { ReviewRulesEngine } from './rules.js';
import { aiReview } from './ai-review.js';
import { createLogger } from '../services/logger.js';

const logger = createLogger('review-analyzer');

/**
 * 代码分析器 - 整合 ESLint 规则检测、AI 审查和代码指标
 */
export class CodeAnalyzer {
  private rulesEngine: ReviewRulesEngine;

  constructor(cwd: string = process.cwd()) {
    this.rulesEngine = new ReviewRulesEngine(cwd);
  }

  /**
   * 分析单个代码文件
   * @param filePath 文件路径
   * @param options 分析选项
   * @returns 审查结果
   */
  async analyzeFile(filePath: string, options: ReviewOptions = {}): Promise<ReviewResult> {
    const content = await fs.readFile(filePath, 'utf-8');
    const ext = path.extname(filePath).slice(1).toLowerCase();

    // ESLint 规则检测
    let eslintIssues: ReviewIssue[] = [];
    if (this.isJavaScriptFile(filePath)) {
      try {
        eslintIssues = await this.rulesEngine.analyze(filePath);
      } catch (error) {
        // ESLint 失败时回退到快速规则检测
        logger.debug({ error: error instanceof Error ? error.message : String(error), filePath }, 'ESLint analysis failed, falling back to quick check');
        eslintIssues = ReviewRulesEngine.quickCheck(content, filePath);
      }
    } else {
      // 非 JS/TS 文件使用快速规则检测
      eslintIssues = ReviewRulesEngine.quickCheck(content, filePath);
    }

    // AI 深度审查（默认开启，useAi=false 时跳过）
    const categories = options.categories || ['quality', 'bugs', 'performance', 'security'];
    const useAi = options.useAi !== false;
    const aiIssues = useAi ? await aiReview(content, filePath, categories) : [];

    // 合并去重
    const allIssues = [...eslintIssues];
    const existingRules = new Set(eslintIssues.map(i => `${i.ruleId}-${i.line}`));

    for (const issue of aiIssues) {
      const key = `${issue.ruleId}-${issue.line}`;
      if (!existingRules.has(key)) {
        allIssues.push(issue);
        existingRules.add(key);
      }
    }

    // 限制数量
    const maxIssues = options.maxIssues || 50;
    const limitedIssues = allIssues.slice(0, maxIssues);

    // 按严重程度排序
    const severityOrder = { error: 0, warning: 1, info: 2 };
    limitedIssues.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

    // 计算代码指标
    const metrics = await calculateMetrics(content, filePath);

    return {
      filePath,
      language: ext,
      issues: limitedIssues,
      summary: {
        total: limitedIssues.length,
        errors: limitedIssues.filter(i => i.severity === 'error').length,
        warnings: limitedIssues.filter(i => i.severity === 'warning').length,
        infos: limitedIssues.filter(i => i.severity === 'info').length,
      },
      metrics: {
        lines: metrics.lines,
        codeLines: metrics.codeLines,
        commentLines: metrics.commentLines,
        blankLines: metrics.blankLines,
        complexity: metrics.complexity,
      },
    };
  }

  /**
   * 批量分析目录
   * @param dirPath 目录路径
   * @param options 分析选项
   * @returns 审查结果列表
   */
  async analyzeDirectory(dirPath: string, options: ReviewOptions = {}): Promise<ReviewResult[]> {
    const results: ReviewResult[] = [];
    const ignorePatterns = options.ignorePatterns || [
      'node_modules', 'dist', '.git', 'coverage',
      '__pycache__', '.next', 'build', 'out'
    ];

    const walkDir = async (currentDir: string): Promise<void> => {
      const entries = await fs.readdir(currentDir, { withFileTypes: true });

      for (const entry of entries) {
        if (ignorePatterns.includes(entry.name)) continue;

        const fullPath = path.join(currentDir, entry.name);

        if (entry.isDirectory()) {
          await walkDir(fullPath);
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).slice(1).toLowerCase();
          const codeExtensions = [
            'js', 'ts', 'jsx', 'tsx', 'mjs', 'cjs',
            'py', 'java', 'go', 'rs', 'cpp', 'c',
            'cs', 'php', 'rb', 'swift', 'kt',
            'html', 'css', 'json', 'yaml', 'yml', 'md'
          ];

          if (codeExtensions.includes(ext)) {
            try {
              const result = await this.analyzeFile(fullPath, options);
              if (result.issues.length > 0) {
                results.push(result);
              }
            } catch (error) {
              // 跳过无法读取的文件
              logger.debug({ error: error instanceof Error ? error.message : String(error), filePath: fullPath }, 'Skipping unreadable file');
            }
          }
        }
      }
    };

    await walkDir(dirPath);
    return results;
  }

  /**
   * 检查是否为 JavaScript/TypeScript 文件
   */
  private isJavaScriptFile(filePath: string): boolean {
    const ext = path.extname(filePath).toLowerCase();
    return ['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs'].includes(ext);
  }

  /**
   * 获取规则引擎实例
   */
  getRulesEngine(): ReviewRulesEngine {
    return this.rulesEngine;
  }
}

/**
 * 分析代码文件（向后兼容的函数接口）
 * @param filePath 文件路径
 * @param options 分析选项
 * @returns 审查结果
 */
export async function analyzeCode(filePath: string, options: ReviewOptions = {}): Promise<ReviewResult> {
  const analyzer = new CodeAnalyzer(process.cwd());
  return analyzer.analyzeFile(filePath, options);
}
