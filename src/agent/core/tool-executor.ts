/**
 * Agent Tool Executor
 *
 * Handles tool execution, parameter parsing, and result processing.
 * Extracted from core.ts for better modularity.
 */

import { toolRegistry } from '../../tools/registry.js';
import { agentLogger } from '../../services/logger.js';
import { reasonStep } from '../reasoner.js';
import { parseToolArgsFromAI } from '../agent-utils.js';
import type { TaskStep, ToolResult, StepExecutionContext } from './types.js';
import chalk from 'chalk';

/**
 * 工具执行选项
 */
export interface ToolExecutionOptions {
  /** 任务ID */
  taskId: string;
  /** 用户输入 */
  userInput: string;
  /** 任务意图 */
  intent?: string;
  /** 输出回调 */
  onOutput?: (text: string) => void;
  /** 获取上下文的函数 */
  getContext: () => Promise<string[]>;
}

/**
 * 执行工具步骤
 *
 * 处理带工具调用的步骤，包括参数推理、工具执行和结果处理。
 *
 * @param step 任务步骤
 * @param stepIndex 步骤索引
 * @param context 执行上下文
 * @param options 执行选项
 * @returns 工具执行结果
 */
export async function executeToolStep(
  step: TaskStep,
  stepIndex: number,
  context: Record<string, unknown>,
  options: ToolExecutionOptions
): Promise<ToolResult> {
  const { taskId, userInput, intent, onOutput, getContext } = options;

  if (!step.tool) {
    return {
      success: true,
      output: `（手动步骤）${step.description}`,
    };
  }

  // 验证工具存在（防止幻觉工具调用）
  if (!toolRegistry.has(step.tool)) {
    const availableTools = [...toolRegistry.toolsMap.keys()].join(', ');
    const error = `工具 "${step.tool}" 不存在。可用工具: ${availableTools}`;
    return {
      success: false,
      error,
    };
  }

  // 防止范围蔓延：步骤数量上限检查
  const maxSteps = 20;
  if (context['_stepCount'] !== undefined) {
    const currentCount = context['_stepCount'] as number;
    if (currentCount > maxSteps) {
      return {
        success: false,
        error: `任务步骤超过上限(${maxSteps}步)，已自动停止。可能是任务范围过大，请分解任务后重试。`,
      };
    }
    context['_stepCount'] = currentCount + 1;
  } else {
    context['_stepCount'] = 1;
  }

  try {
    // 简化：移除复杂的决策记录，仅保留必要的日志
    agentLogger.debug({ taskId, step: stepIndex, tool: step.tool }, 'Executing tool step');

    // 如果没有参数，使用AI推理参数
    if (!step.args || Object.keys(step.args).length === 0) {
      onOutput?.(chalk.dim(`  🧠 AI 推理工具参数: ${chalk.cyan(step.tool)}...`));

      const paramReasoning = await reasonStep({
        taskDescription: userInput,
        intent: intent || 'chat',
        stepDescription: `为工具 "${step.tool}" 确定执行参数。步骤描述: ${step.description}。请以 JSON 格式输出参数，例如: {"command": "ls -la"} 或 {"path": "/src/index.ts", "content": "..."}`,
        previousResults: await getContext(),
        availableTools: [step.tool],
      });

      step.args = parseToolArgsFromAI(step.tool, paramReasoning);
    }

    onOutput?.(chalk.dim(`  → 执行工具: ${chalk.cyan(step.tool)} ${step.args ? JSON.stringify(step.args) : ''}...`));

    // 执行工具
    const startTime = Date.now();
    const result = await executeToolWithArgs(step.tool, step.args);
    const duration = Date.now() - startTime;

    if (result.success) {
      onOutput?.(chalk.green(`  ✓ 完成: ${step.description}`));
      agentLogger.info({ taskId, step: stepIndex, tool: step.tool }, 'Tool step completed');
    } else {
      onOutput?.(chalk.red(`  ✗ 失败: ${result.error}`));
    }

    return { ...result, duration };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    agentLogger.error({ taskId, step: stepIndex, error: errorMessage }, 'Step execution failed');

    return {
      success: false,
      error: `工具 ${step.tool} 执行失败: ${errorMessage}`,
    };
  }
}

/**
 * 执行工具并处理参数
 *
 * @param toolName 工具名称
 * @param args 工具参数
 * @returns 工具执行结果
 */
async function executeToolWithArgs(
  toolName: string,
  args?: Record<string, unknown>
): Promise<ToolResult> {
  try {
    const stringArgs: Record<string, string> = {};
    if (args) {
      for (const [key, value] of Object.entries(args)) {
        stringArgs[key] = String(value ?? '');
      }
    }

    const result = await toolRegistry.execute(toolName, stringArgs);

    // 处理字符串结果
    if (typeof result === 'string') {
      return {
        success: true,
        output: result,
      };
    }

    // 处理 ToolResult 对象
    if (result && typeof result === 'object' && 'output' in result) {
      const toolResult = result as { success?: boolean; output?: string; error?: string };
      if (toolResult.success === false) {
        return {
          success: false,
          error: toolResult.error || `工具 ${toolName} 执行失败`,
        };
      }
      return {
        success: true,
        output: toolResult.output || JSON.stringify(result, null, 2),
      };
    }

    return {
      success: true,
      output: JSON.stringify(result, null, 2),
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * 执行推理步骤（无工具调用）
 *
 * @param step 任务步骤
 * @param stepIndex 步骤索引
 * @param options 执行选项
 * @returns 推理结果
 */
export async function executeReasoningStep(
  step: TaskStep,
  stepIndex: number,
  options: ToolExecutionOptions
): Promise<ToolResult> {
  const { userInput, intent, onOutput, getContext } = options;

  onOutput?.(chalk.dim(`  🧠 AI 推理: ${step.description}...`));

  try {
    const startTime = Date.now();
    const reasoning = await reasonStep({
      taskDescription: userInput,
      intent: intent || 'chat',
      stepDescription: step.description,
      previousResults: await getContext(),
      availableTools: [...toolRegistry.toolsMap.keys()],
    });
    const duration = Date.now() - startTime;

    onOutput?.(chalk.green(`  ✓ 推理完成: ${step.description}`));

    return {
      success: true,
      output: reasoning,
      duration,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: `推理失败: ${errorMessage}`,
    };
  }
}

/**
 * 检查步骤是否超时
 *
 * @param context 步骤执行上下文
 * @returns 是否超时
 */
export function isStepTimeout(context: StepExecutionContext): boolean {
  return Date.now() - context.taskStartTime > context.timeoutMs;
}

/**
 * 获取步骤超时剩余时间
 *
 * @param context 步骤执行上下文
 * @returns 剩余时间（毫秒）
 */
export function getRemainingTime(context: StepExecutionContext): number {
  const elapsed = Date.now() - context.taskStartTime;
  return Math.max(0, context.timeoutMs - elapsed);
}

/**
 * 格式化工具结果用于显示
 *
 * @param result 工具结果
 * @returns 格式化后的字符串
 */
export function formatToolResult(result: ToolResult): string {
  if (result.success) {
    return result.output || '（无输出）';
  }
  return `错误: ${result.error || '未知错误'}`;
}

/**
 * 检查工具结果是否需要用户确认
 *
 * @param result 工具结果
 * @returns 是否需要确认
 */
export function requiresConfirmation(result: ToolResult): boolean {
  if (!result.success) return true;

  // 检查输出中是否包含可疑内容
  const output = result.output || '';
  const suspiciousPatterns = [
    /error|错误|失败/i,
    /warning|警告/i,
    /deprecated|已弃用/i,
    /delet|删除|移除/i,
    /drop|丢弃/i,
  ];

  return suspiciousPatterns.some(pattern => pattern.test(output));
}
