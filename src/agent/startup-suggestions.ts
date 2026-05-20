/**
 * Startup Suggestions
 *
 * 启动建议生成器 - 在 Agent 启动时运行健康检查，
 * 生成简洁的项目状态摘要和建议列表。
 */

import { AutonomousGoalManager, type HealthCheckResult } from './autonomous-goals.js';

export interface StartupSuggestionResult {
  summary: string;
  suggestions: string[];
  healthStatus: 'healthy' | 'warning' | 'critical';
}

/**
 * 生成启动建议
 *
 * 运行所有健康检查并格式化为简洁的摘要，
 * 适合在 Agent 启动时展示给用户。
 */
export async function generateStartupSuggestions(rootDir: string): Promise<StartupSuggestionResult> {
  const manager = new AutonomousGoalManager();
  const results = await manager.runHealthChecks(rootDir);

  const warnings = results.filter(r => r.status === 'warning');
  const criticals = results.filter(r => r.status === 'critical');

  // 确定整体健康状态
  let healthStatus: 'healthy' | 'warning' | 'critical';
  if (criticals.length > 0) {
    healthStatus = 'critical';
  } else if (warnings.length > 0) {
    healthStatus = 'warning';
  } else {
    healthStatus = 'healthy';
  }

  // 生成摘要
  const parts: string[] = [];
  if (criticals.length > 0) {
    parts.push(`${criticals.length}个严重问题`);
  }
  if (warnings.length > 0) {
    parts.push(`${warnings.length}个警告`);
  }
  if (parts.length === 0) {
    parts.push('一切正常');
  }

  const summary = parts.join(', ');

  // 生成建议列表（最多 5 条，优先显示严重问题）
  const allIssues = [...criticals, ...warnings];
  const suggestions: string[] = [];

  for (const issue of allIssues) {
    if (suggestions.length >= 5) break;
    const line = issue.suggestion
      ? `${issue.message} - ${issue.suggestion}`
      : issue.message;
    suggestions.push(line);
  }

  return { summary, suggestions, healthStatus };
}

/**
 * 将健康检查结果格式化为系统提示词片段
 *
 * 当 Agent 有待处理的自主目标时，将其注入到系统提示词中，
 * 让 AI 了解项目当前的问题状态。
 */
export function formatGoalsForSystemPrompt(goals: Array<{ description: string; priority: number }>): string {
  if (goals.length === 0) return '';

  const lines = ['## 待处理事项（自主发现）'];
  for (const goal of goals.slice(0, 8)) {
    lines.push(`- [ ] ${goal.description}`);
  }

  return lines.join('\n');
}

/**
 * 将健康检查结果格式化为 CLI 展示文本
 */
export function formatHealthCheckForCLI(result: StartupSuggestionResult): string {
  if (result.healthStatus === 'healthy') {
    return '项目健康检查: 一切正常';
  }

  const icon = result.healthStatus === 'critical' ? '!!' : '!';
  return `项目健康检查: ${result.summary}`;
}
