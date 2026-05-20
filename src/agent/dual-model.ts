/**
 * 双模型协调器 - Architect/Editor 模式
 *
 * 管理双模型分工的完整流程：
 * 1. Architect 分析问题、设计方案
 * 2. 用户审阅方案
 * 3. Editor 根据方案执行修改
 *
 * 学习自 Aider 的 /architect 命令。
 */

import chalk from 'chalk';
import type { ReasonerConfig } from './llm-caller.js';
import { architectAnalyze, type ArchitectResult } from './architect.js';
import { editorExecute, type EditorResult } from './editor.js';

/** 双模型执行配置 */
export interface DualModelConfig {
  /** Architect 模型配置（建议使用强推理模型） */
  architect?: ReasonerConfig;
  /** Editor 模型配置（建议使用快速编码模型） */
  editor?: ReasonerConfig;
  /** 是否跳过用户确认（直接执行） */
  skipConfirmation?: boolean;
}

/** 双模型执行结果 */
export interface DualModelResult {
  /** Architect 分析结果 */
  architect: ArchitectResult;
  /** Editor 执行结果 */
  editor: EditorResult;
  /** 总耗时（毫秒） */
  durationMs: number;
}

/**
 * 双模型执行入口
 *
 * @param taskDescription 任务描述
 * @param context 额外上下文
 * @param config 双模型配置
 * @param onOutput 输出回调
 */
export async function runDualModel(
  taskDescription: string,
  context?: {
    codeContext?: string;
    errorInfo?: string;
    relatedFiles?: string[];
    previousAttempts?: string;
  },
  config?: DualModelConfig,
  onOutput?: (text: string) => void
): Promise<DualModelResult> {
  const output = onOutput || ((text: string) => console.log(text));
  const startTime = Date.now();

  // === 阶段 1: Architect 分析 ===
  output(chalk.bold('\n🏗️  [Architect] 分析任务中...\n'));

  let architectResult: ArchitectResult;
  try {
    architectResult = await architectAnalyze(taskDescription, context, config?.architect);
  } catch (error) {
    throw new Error(`Architect 分析失败: ${error instanceof Error ? error.message : String(error)}`);
  }

  // 展示 Architect 结果
  output(chalk.cyan('📋 方案概述:'));
  output(architectResult.summary || '(无概述)');
  output('');

  if (architectResult.filesToModify.length > 0) {
    output(chalk.yellow('📝 需要修改的文件:'));
    architectResult.filesToModify.forEach(f => output(`  - ${f}`));
  }
  if (architectResult.filesToCreate.length > 0) {
    output(chalk.green('✨ 需要新建的文件:'));
    architectResult.filesToCreate.forEach(f => output(`  - ${f}`));
  }
  if (architectResult.risks.length > 0) {
    output(chalk.red('⚠️  风险提示:'));
    architectResult.risks.forEach(r => output(`  - ${r}`));
  }
  output(chalk.dim(`复杂度: ${'★'.repeat(architectResult.complexity)}${'☆'.repeat(5 - architectResult.complexity)} (${architectResult.complexity}/5)`));

  // === 阶段 2: 用户确认 ===
  if (!config?.skipConfirmation) {
    try {
      const inquirer = await import('inquirer');
      const { confirmed } = await inquirer.default.prompt([{
        type: 'confirm',
        name: 'confirmed',
        message: '是否让 Editor 按此方案执行修改？',
        default: true,
      }]);
      if (!confirmed) {
        output(chalk.yellow('用户取消执行'));
        return {
          architect: architectResult,
          editor: { success: false, operations: [], summary: '用户取消', issues: [] },
          durationMs: Date.now() - startTime,
        };
      }
    } catch {
      output(chalk.dim('非交互模式，跳过确认'));
    }
  }

  // === 阶段 3: Editor 执行 ===
  output(chalk.bold('\n✏️  [Editor] 执行修改中...\n'));

  let editorResult: EditorResult;
  try {
    editorResult = await editorExecute(architectResult, config?.editor);
  } catch (error) {
    throw new Error(`Editor 执行失败: ${error instanceof Error ? error.message : String(error)}`);
  }

  // 展示 Editor 结果
  if (editorResult.success) {
    output(chalk.green('✅ 修改完成'));
    editorResult.operations.forEach(op => {
      const icon = op.type === 'create' ? chalk.green('✨') : chalk.yellow('📝');
      output(`  ${icon} ${op.type}: ${op.filePath}`);
    });
  } else {
    output(chalk.yellow('⚠️  修改完成，但遇到问题:'));
    editorResult.issues.forEach(issue => output(`  - ${issue}`));
  }

  if (editorResult.summary) {
    output(chalk.dim(`\n${editorResult.summary}`));
  }

  return {
    architect: architectResult,
    editor: editorResult,
    durationMs: Date.now() - startTime,
  };
}
