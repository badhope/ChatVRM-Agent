/**
 * Plan/Act 协调器
 *
 * 管理 Plan 和 Act 模式的切换，确保上下文在模式间无缝传递。
 */

import chalk from 'chalk';
import { runPlanMode, type PlanResult } from './plan-mode.js';
import { runActMode, type ActResult, type ActModeConfig } from './act-mode.js';
import type { ReasonerConfig } from './llm-caller.js';

/** Plan/Act 执行配置 */
export interface PlanActConfig {
  /** LLM 配置 */
  llm?: ReasonerConfig;
  /** Act 模式配置 */
  act?: ActModeConfig;
  /** 跳过 Plan 直接 Act */
  skipPlan?: boolean;
  /** 跳过用户确认 */
  autoApprove?: boolean;
}

/** Plan/Act 完整结果 */
export interface PlanActResult {
  plan: PlanResult | null;
  act: ActResult | null;
  totalDurationMs: number;
}

/**
 * 执行 Plan/Act 流程
 */
export async function runPlanAct(
  taskDescription: string,
  config?: PlanActConfig,
  onOutput?: (text: string) => void
): Promise<PlanActResult> {
  const output = onOutput || ((text: string) => console.log(text));
  const totalStart = Date.now();
  let plan: PlanResult | null = null;
  let act: ActResult | null = null;

  // === Plan 阶段 ===
  if (!config?.skipPlan) {
    output(chalk.bold('\n📋 Plan 模式 — 只读分析\n'));
    plan = await runPlanMode(taskDescription, config?.llm, output);

    // 展示 Plan 结果
    output(chalk.bold('\n📄 执行计划:'));
    output(plan.detailedPlan);

    // 用户确认
    if (!config?.autoApprove) {
      try {
        const inquirer = await import('inquirer');
        const { action } = await inquirer.default.prompt([{
          type: 'list',
          name: 'action',
          message: '接下来要做什么？',
          choices: [
            { name: '▶ 执行计划 (Act)', value: 'act' },
            { name: '✏️ 修改计划 (重新规划)', value: 'replan' },
            { name: '❌ 取消', value: 'cancel' },
          ],
        }]);

        if (action === 'cancel') {
          output(chalk.yellow('用户取消'));
          return { plan, act: null, totalDurationMs: Date.now() - totalStart };
        }

        if (action === 'replan') {
          output(chalk.cyan('\n🔄 重新规划...\n'));
          plan = await runPlanMode(taskDescription, config?.llm, output);
          output(chalk.bold('\n📄 更新后的计划:'));
          output(plan.detailedPlan);
        }
      } catch {
        output(chalk.dim('非交互模式，自动进入 Act'));
      }
    }
  }

  // === Act 阶段 ===
  output(chalk.bold('\n⚡ Act 模式 — 执行计划\n'));
  act = await runActMode(plan ?? undefined, taskDescription, {
    ...config?.act,
    autoApprove: config?.autoApprove,
  }, output);

  // 展示结果
  output('');
  if (act.allSuccess) {
    output(chalk.green('✅ 所有步骤执行成功'));
  } else {
    output(chalk.yellow('⚠️ 部分步骤执行失败'));
  }
  output(chalk.dim(`  ${act.summary}`));

  return {
    plan,
    act,
    totalDurationMs: Date.now() - totalStart,
  };
}
