/**
 * 上下文感知检测模块
 *
 * 提供基于上下文的问题检测功能。
 */

import { TrustIssue } from '../trust-types.js';
import {
  detectShellContext,
  detectDatabaseContext,
  detectFileContext,
  detectNetworkContext,
} from './context-detect.js';

// Re-export context detection functions
export {
  detectShellContext,
  detectDatabaseContext,
  detectFileContext,
  detectNetworkContext,
} from './context-detect.js';

// ==================== Types ====================

/**
 * 检测上下文
 */
export interface DetectionContext {
  /** 用户意图 */
  intent?: string;
  /** 使用的工具 */
  toolUsed?: string;
  /** 文件路径（用于上下文感知） */
  filePath?: string;
  /** 是否在测试环境中 */
  isTestEnvironment?: boolean;
}

// ==================== Context Detection Functions ====================

/**
 * 判断文件路径是否为测试文件
 *
 * @param filePath - 文件路径
 * @returns 是否为测试文件
 */
export function isTestFile(filePath: string): boolean {
  const lower = filePath.toLowerCase();
  return (
    lower.includes('.test.') ||
    lower.includes('.spec.') ||
    lower.includes('__tests__') ||
    lower.includes('test/') ||
    lower.includes('tests/')
  );
}

/**
 * 判断是否应该在测试环境中跳过检测
 *
 * @param context - 检测上下文
 * @returns 是否跳过
 */
export function shouldSkipInTest(context?: DetectionContext): boolean {
  if (context?.isTestEnvironment !== undefined) {
    return context.isTestEnvironment;
  }

  if (context?.filePath) {
    return isTestFile(context.filePath);
  }

  return false;
}

/**
 * 获取工具上下文类型
 *
 * @param toolUsed - 使用的工具名称
 * @returns 工具上下文类型
 */
export function getToolContext(toolUsed: string): 'shell' | 'database' | 'file' | 'network' | 'unknown' {
  const toolLower = toolUsed.toLowerCase();

  if (toolLower === 'shell' || toolLower === 'exec') {
    return 'shell';
  }

  if (toolLower.includes('database') || toolLower.includes('db') || toolLower.includes('sql')) {
    return 'database';
  }

  if (toolLower.includes('write') || toolLower.includes('file')) {
    return 'file';
  }

  if (toolLower.includes('http') || toolLower.includes('fetch') || toolLower.includes('request')) {
    return 'network';
  }

  return 'unknown';
}

/**
 * 基于上下文进行检测
 *
 * @param output - 输出文本
 * @param context - 检测上下文
 * @returns 检测到的问题列表
 */
export function detectWithContext(output: string, context: DetectionContext): TrustIssue[] {
  const issues: TrustIssue[] = [];

  if (context.toolUsed) {
    const toolContext = getToolContext(context.toolUsed);

    switch (toolContext) {
      case 'shell':
        issues.push(...detectShellContext(output));
        break;
      case 'database':
        issues.push(...detectDatabaseContext(output));
        break;
      case 'file':
        issues.push(...detectFileContext(output));
        break;
      case 'network':
        issues.push(...detectNetworkContext(output));
        break;
    }
  }

  return issues;
}
