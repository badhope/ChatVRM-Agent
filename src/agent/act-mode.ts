/**
 * Act 模式 - 执行模式
 *
 * 学习自 Cline 的 Act Mode：
 * - 按照Plan模式生成的计划逐步执行
 * - 拥有完整工具权限（写入文件、执行命令等）
 * - 每个步骤可配置自动/手动审批
 */

import chalk from 'chalk';
import type { TaskStep } from './types.js';
import type { PlanResult } from './plan-mode.js';
import { reasonStep } from './reasoner.js';
import { executeStep } from './step-executor.js';
import { intentRecognizer } from './intent-recognizer.js';
import { planTask } from './task-planner.js';
import { detectIssues, generateTrustReport, askUserConfirmation, TrustLevel } from './trust.js';
import { ContextBuilder } from './context-builder.js';
import { ChangeControlManager } from './change-control.js';
import type { ReasonerConfig } from './llm-caller.js';

/** Act 模式配置 */
export interface ActModeConfig {
  /** LLM 配置 */
  llm?: ReasonerConfig;
  /** 是否自动批准所有步骤（跳过确认） */
  autoApprove?: boolean;
  /** 跳过写入类工具（dry-run 模式） */
  dryRun?: boolean;
  /** 项目根目录（用于构建上下文） */
  rootDir?: string;
  /** 是否启用变更控制 */
  enableChangeControl?: boolean;
}

/** Act 步骤结果 */
export interface ActStepResult {
  step: TaskStep;
  success: boolean;
  error?: string;
  durationMs: number;
}

/** Act 执行结果 */
export interface ActResult {
  /** 执行的步骤 */
  stepResults: ActStepResult[];
  /** 总耗时 */
  durationMs: number;
  /** 是否全部成功 */
  allSuccess: boolean;
  /** 摘要 */
  summary: string;
  /** 变更控制统计 */
  changeControlStats?: {
    total: number;
    byRisk: Record<string, number>;
  };
}

/**
 * 执行 Act 模式
 * @param plan Plan 模式的结果（可选，不传则自动规划）
 * @param taskDescription 任务描述
 * @param config Act 模式配置
 * @param onOutput 输出回调
 */
export async function runActMode(
  plan: PlanResult | undefined,
  taskDescription: string,
  config?: ActModeConfig,
  onOutput?: (text: string) => void
): Promise<ActResult> {
  const output = onOutput || ((text: string) => console.log(text));
  const startTime = Date.now();
  const stepResults: ActStepResult[] = [];
  const contextBuilder = new ContextBuilder();
  const changeControl = new ChangeControlManager();
  const projectRoot = config?.rootDir || process.cwd();

  // Disable change control if requested
  if (config?.enableChangeControl === false) {
    changeControl.setEnabled(false);
  }

  // If change control is disabled globally, apply config
  if (config?.autoApprove) {
    changeControl.setEnabled(false);
  }

  // 如果没有 plan，自动规划
  let steps: TaskStep[];
  let intent: string;

  if (plan) {
    steps = plan.steps;
    intent = plan.intent;
    output(chalk.cyan(`📋 按照已有计划执行 (${steps.length} 个步骤)`));

    // 如果 plan 已经有上下文信息，显示它
    if (plan.context) {
      if (plan.context.repoMapIncluded) {
        output(chalk.dim(`  ✓ 代码结构图已加载`));
      }
      if (plan.context.codeSearchIncluded) {
        output(chalk.dim(`  ✓ 相关代码已加载 (${plan.context.codeEntryCount} 个)`));
      }
      if (plan.context.knowledgeIncluded) {
        output(chalk.dim(`  ✓ 知识图谱已加载 (${plan.context.knowledgeEntryCount} 个)`));
      }
    }
  } else {
    output(chalk.cyan('📋 自动规划任务...'));

    // 构建上下文
    output(chalk.dim('📊 构建代码库上下文...'));
    try {
      const contextResult = await contextBuilder.build({
        rootDir: projectRoot,
        query: taskDescription,
        maxTokens: 4000,
        includeRepoMap: true,
        includeKnowledge: true,
        includeCodeSearch: true,
      });
      if (contextResult.repoMapIncluded) {
        output(chalk.green(`  ✓ 代码结构图已生成 (${contextResult.codeEntryCount} 个符号)`));
      }
    } catch {
      output(chalk.dim('  ⚠ 上下文构建失败'));
    }

    const { intent: recognizedIntent } = intentRecognizer.recognizeSync(taskDescription);
    intent = recognizedIntent;
    steps = await planTask(taskDescription, intent);
    output(chalk.dim(`  规划完成: ${steps.length} 个步骤`));
  }

  output('');

  const context: Record<string, unknown> = {};
  const previousResults: string[] = [];

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const stepStart = Date.now();

    // 跳过已完成的步骤
    if (step.status === 'done') {
      previousResults.push(step.result || '');
      continue;
    }

    output(chalk.bold(`  [${i + 1}/${steps.length}] ${step.description}`));

    // Dry-run 模式跳过写入
    if (config?.dryRun && step.tool && isWriteTool(step.tool)) {
      output(chalk.yellow('  ⏭ Dry-run: 跳过写入操作'));
      stepResults.push({
        step,
        success: true,
        durationMs: Date.now() - stepStart,
      });
      continue;
    }

    try {
      let result: string;

      if (step.tool) {
        // 工具步骤 → 生成参数并执行
        if (!step.args || Object.keys(step.args).length === 0) {
          output(chalk.dim('  🧠 AI 推理工具参数...'));
          const reasoning = await reasonStep({
            taskDescription,
            intent,
            stepDescription: `为工具 "${step.tool}" 确定执行参数: ${step.description}`,
            previousResults,
            availableTools: [step.tool],
          }, config?.llm);
          try {
            const jsonMatch = reasoning.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              step.args = JSON.parse(jsonMatch[0]);
            }
          } catch (error) {
            // Parameter extraction failed
          }
        }

        // 信任检查（写入类工具）
        if (step.tool && isWriteTool(step.tool) && !config?.autoApprove) {
          const issues = detectIssues(JSON.stringify(step.args), {
            intent,
            toolUsed: step.tool,
          });
          if (issues.length > 0) {
            const report = generateTrustReport(issues);
            if (report.requiresConfirmation) {
              output(chalk.yellow(`  ⚠ 信任检查: ${issues.length} 个问题`));
              const confirmed = await askUserConfirmation(report);
              if (!confirmed) {
                output(chalk.yellow('  ⏭ 用户拒绝，跳过'));
                stepResults.push({ step, success: false, error: '用户拒绝', durationMs: Date.now() - stepStart });
                continue;
              }
            }
          }
        }

        output(chalk.dim(`  → ${step.tool} ${step.args ? JSON.stringify(step.args).slice(0, 80) : ''}...`));

        // 使用变更控制包装执行（对于写入类操作）
        if (step.tool && isWriteTool(step.tool)) {
          const targetPath = extractTargetPath(step.tool, step.args);
          if (targetPath) {
            const protectedResult = await changeControl.executeProtectedChange(
              toolToAction(step.tool),
              targetPath,
              async () => {
                return executeStep(step, context);
              }
            );
            result = protectedResult.result as string;
            if (!protectedResult.success) {
              throw new Error('变更控制拒绝执行');
            }
          } else {
            result = await executeStep(step, context);
          }
        } else {
          result = await executeStep(step, context);
        }
        previousResults.push(result);
        output(chalk.green('  ✓ 完成'));
      } else {
        // 空操作步骤 → AI 推理
        output(chalk.dim('  🧠 AI 推理...'));
        result = await reasonStep({
          taskDescription,
          intent,
          stepDescription: step.description,
          previousResults,
          availableTools: [],
        }, config?.llm);
        previousResults.push(result);
        output(chalk.green('  ✓ 推理完成'));
      }

      step.result = result;
      step.status = 'done';
      stepResults.push({ step, success: true, durationMs: Date.now() - stepStart });
    } catch (error) {
      step.status = 'error';
      step.error = error instanceof Error ? error.message : String(error);
      stepResults.push({
        step,
        success: false,
        error: step.error,
        durationMs: Date.now() - stepStart,
      });
      output(chalk.red(`  ✗ 失败: ${step.error}`));

      // 询问是否继续
      if (!config?.autoApprove) {
        try {
          const inquirer = await import('inquirer');
          const { cont } = await inquirer.default.prompt([{
            type: 'confirm',
            name: 'cont',
            message: '步骤失败，是否继续？',
            default: false,
          }]);
          if (!cont) break;
        } catch (error) {
          break;
        }
      }
    }
  }

  const allSuccess = stepResults.every(r => r.success);
  const successCount = stepResults.filter(r => r.success).length;

  return {
    stepResults,
    durationMs: Date.now() - startTime,
    allSuccess,
    summary: `完成 ${successCount}/${stepResults.length} 个步骤，耗时 ${(Date.now() - startTime) / 1000}s`,
    changeControlStats: changeControl.getStats(),
  };
}

/** 判断是否为写入类工具 */
function isWriteTool(tool: string): boolean {
  return ['write_file', 'delete_file', 'shell'].includes(tool);
}

/**
 * 提取工具参数中的目标路径
 */
function extractTargetPath(tool: string, args?: Record<string, unknown>): string | null {
  if (!args) return null;

  switch (tool) {
    case 'write_file':
    case 'delete_file':
    case 'read_file':
      return args.path as string || null;
    case 'shell':
      return args.command as string || null;
    default:
      return null;
  }
}

/**
 * 将工具名转换为变更控制动作
 */
function toolToAction(tool: string): 'create' | 'modify' | 'delete' | 'read' | 'shell' {
  switch (tool) {
    case 'write_file':
      return 'create';
    case 'delete_file':
      return 'delete';
    case 'shell':
      return 'shell';
    case 'read_file':
      return 'read';
    default:
      return 'modify';
  }
}
