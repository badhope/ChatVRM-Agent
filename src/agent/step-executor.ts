import type { TaskStep } from './types.js';
import { toolRegistry } from '../tools/registry.js';

/**
 * 步骤执行器
 * 执行单个任务步骤，调用相应工具并返回结果。
 */

/**
 * 执行单个任务步骤
 * @param step    任务步骤
 * @param context 执行上下文
 * @returns 执行结果字符串
 */
export async function executeStep(step: TaskStep, context: Record<string, unknown>): Promise<string> {
  if (!step.tool) {
    return `（手动步骤）${step.description}`;
  }

  // === 防止幻觉工具调用：验证工具存在 ===
  if (!toolRegistry.has(step.tool)) {
    throw new Error(`工具 "${step.tool}" 不存在。可用工具: ${[...toolRegistry.toolsMap.keys()].join(', ')}`);
  }

  // === 防止范围蔓延：步骤数量上限检查 ===
  const maxSteps = 20;
  if (context['_stepCount'] !== undefined) {
    const currentCount = context['_stepCount'] as number;
    if (currentCount > maxSteps) {
      throw new Error(`任务步骤超过上限(${maxSteps}步)，已自动停止。可能是任务范围过大，请分解任务后重试。`);
    }
    context['_stepCount'] = currentCount + 1;
  } else {
    context['_stepCount'] = 1;
  }

  try {
    const args: Record<string, string> = {};
    if (step.args) {
      for (const [key, value] of Object.entries(step.args)) {
        args[key] = String(value ?? '');
      }
    }
    const result = await toolRegistry.execute(step.tool, args);
    if (typeof result === 'string') return result;
    // 处理 ToolResult 对象
    if (result && typeof result === 'object' && 'output' in result) {
      const toolResult = result as { success?: boolean; output?: string; error?: string };
      if (toolResult.success === false) {
        throw new Error(toolResult.error || `工具 ${step.tool} 执行失败`);
      }
      return toolResult.output || JSON.stringify(result, null, 2);
    }
    return JSON.stringify(result, null, 2);
  } catch (error) {
    throw new Error(`工具 ${step.tool} 执行失败: ${error instanceof Error ? error.message : String(error)}`);
  }
}
