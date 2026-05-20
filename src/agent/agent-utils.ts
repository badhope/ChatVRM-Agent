import type { Task } from './types.js';
import { toolRegistry } from '../tools/registry.js';
import chalk from 'chalk';

/**
 * Agent 工具函数
 * 从 AgentExecutor 中提取的内部工具方法。
 */

/**
 * 从 AI 响应中解析工具参数
 * @param toolName  工具名称
 * @param aiResponse AI 响应文本
 * @returns 解析出的参数对象
 */
export function parseToolArgsFromAI(toolName: string, aiResponse: string): Record<string, unknown> {
  const jsonBlockMatch = aiResponse.match(/```(?:json)?\s*([\s\S]*?)```/);
  const jsonStr = jsonBlockMatch ? jsonBlockMatch[1] : aiResponse;
  const braceMatch = jsonStr.match(/\{[\s\S]*\}/);
  if (braceMatch) {
    try {
      const parsed = JSON.parse(braceMatch[0]);
      const result: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(parsed)) {
        result[key] = value;
      }
      return result;
    } catch (error) {
      // Fall through to fallback parsing
    }
  }
  const tool = toolRegistry.get(toolName);
  if (tool) {
    const requiredParams = tool.parameters.filter(p => p.required);
    if (requiredParams.length === 1) {
      const trimmed = aiResponse.trim();
      if (trimmed.length > 10000) {
        return { [requiredParams[0].name]: trimmed.substring(0, 10000) + '...[truncated]' };
      }
      return { [requiredParams[0].name]: trimmed };
    }
  }
  return {};
}

/**
 * 生成任务执行总结
 * @param task 任务对象
 * @returns 格式化的总结文本
 */
export function generateSummary(task: Task): string {
  const total = task.steps.length;
  const done = task.steps.filter(s => s.status === 'done').length;
  const failed = task.steps.filter(s => s.status === 'error').length;
  const skipped = task.steps.filter(s => s.status === 'skipped').length;
  const duration = ((task.completedAt || Date.now()) - task.startedAt) / 1000;

  return [
    `  • 任务类型: ${chalk.cyan(task.intent || 'chat')}`,
    `  • 执行步骤: ${done}/${total} 成功`,
    failed > 0 ? `  • 失败: ${chalk.red(failed)}` : '',
    skipped > 0 ? `  • 跳过: ${chalk.yellow(skipped)}` : '',
    `  • 耗时: ${duration.toFixed(1)}秒`,
  ].filter(Boolean).join('\n');
}
