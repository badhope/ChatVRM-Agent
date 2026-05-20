import { Command } from 'commander';
import chalk from 'chalk';
import { printHeader, printSection, printSuccess, printError, printInfo, printWarning } from '../ui/logo.js';
import { printSteps, printKeyValue } from '../ui/display.js';
import { runAgentTask, intentRecognizer, type TaskStep } from '../agent/core.js';
import { runDualModel } from '../agent/dual-model.js';
import { runPlanAct } from '../agent/plan-act.js';
import { configManager } from '../config/manager.js';
import { agentTrustCommand } from './agent/agent-trust.js';
import { agentRiskCommand } from './agent/agent-risk.js';
import type { ProviderType } from '../types.js';

const agentCommand = new Command('agent')
  .description('Agent 核心循环 - 智能理解、规划、执行任务');

// devflow agent run <任务> - 执行智能任务
agentCommand
  .command('run')
  .alias('execute')
  .description('执行智能任务（理解→规划→执行→反思）')
  .argument('<task>', '要完成的任务描述')
  .option('-p, --provider <provider>', 'AI 平台', 'aliyun')
  .option('-m, --model <model>', '使用的模型')
  .option('-v, --verbose', '显示详细步骤', false)
  .option('--no-plan', '跳过规划步骤，直接执行')
  .option('--no-ai', '禁用 AI 推理（空操作步骤将跳过）', false)
  .option('--architect', '使用双模型模式（Architect 规划 + Editor 执行）', false)
  .option('--architect-model <model>', 'Architect 使用的模型（强推理模型）')
  .option('--editor-model <model>', 'Editor 使用的模型（快速编码模型）')
  .option('-y, --yes', '跳过确认直接执行', false)
  .option('--plan-first', '先规划后执行（Plan/Act 模式）', false)
  .action(async (task: string, options: {
    provider: string;
    model?: string;
    verbose: boolean;
    plan?: boolean;
    ai?: boolean;
    architect?: boolean;
    architectModel?: string;
    editorModel?: string;
    yes?: boolean;
    planFirst?: boolean;
  }) => {
    try {
      printHeader();
      printSection('>> Agent 任务执行');
      console.log(chalk.gray(`  任务: ${task}\n`));

      // 初始化配置
      await configManager.init();

      // === 双模型模式 ===
      if (options.architect) {
        console.log(chalk.cyan('  🏗️  双模型模式: Architect + Editor\n'));

        const result = await runDualModel(
          task,
          undefined,
          {
            architect: {
              provider: options.provider as ProviderType,
              model: options.architectModel,
              temperature: 0.2,
              maxTokens: 4096,
            },
            editor: {
              provider: options.provider as ProviderType,
              model: options.editorModel,
              temperature: 0.1,
              maxTokens: 8192,
            },
            skipConfirmation: options.yes,
          }
        );

        console.log();
        printKeyValue([
          { key: '耗时', value: `${result.durationMs}ms` },
          { key: 'Architect 复杂度', value: `${result.architect.complexity}/5` },
          { key: 'Editor 操作数', value: String(result.editor.operations.length) },
          { key: '状态', value: result.editor.success ? chalk.green('成功') : chalk.yellow('有问题') },
        ]);
        return;
      }

      // === Plan/Act 模式 ===
      if (options.planFirst) {
        console.log(chalk.cyan('  📋 Plan/Act 模式: 先规划后执行\n'));

        const result = await runPlanAct(task, {
          llm: {
            provider: options.provider as ProviderType,
            model: options.model,
          },
          autoApprove: options.yes,
        });

        console.log();
        printKeyValue([
          { key: '总耗时', value: `${result.totalDurationMs}ms` },
          { key: 'Plan', value: result.plan ? `${result.plan.estimatedSteps} 个步骤` : '跳过' },
          { key: 'Act', value: result.act ? (result.act.allSuccess ? chalk.green('成功') : chalk.yellow('部分失败')) : '未执行' },
        ]);
        return;
      }

      // === 标准单模型模式 ===

      // 意图识别
      const intent = intentRecognizer.recognizeSync(task);
      console.log(chalk.cyan(`  🎯 识别意图: ${chalk.bold(intent.intent)} (置信度: ${(intent.confidence * 100).toFixed(0)}%)`));
      if (intent.suggestedTools.length > 0) {
        console.log(chalk.gray(`  🛠️  建议工具: ${intent.suggestedTools.join(', ')}`));
      }
      console.log();

      const steps: TaskStep[] = [];

      // 执行任务
      const result = await runAgentTask(task,
        // 步骤变化回调（记录步骤状态）
        (step) => {
          steps[step.id - 1] = step;
        },
        // 输出回调（内部已输出，无需重复）
        undefined
      );

      // 显示结果
      console.log();
      if (result.status === 'completed') {
        printSuccess('任务执行完成');
      } else if (result.status === 'failed') {
        printError('任务执行失败');
        if (result.result) {
          console.log(chalk.red(`  原因: ${result.result}`));
        }
      } else {
        printWarning('任务执行部分完成');
      }

      // 步骤摘要
      if (!options.verbose && steps.length > 0) {
        printSection('>> 执行步骤');
        const displaySteps = steps.filter(Boolean).map(s => ({
          step: s.id,
          title: s.description,
          status: (s.status === 'done' ? 'done' : s.status === 'running' ? 'running' : s.status === 'error' ? 'error' : 'pending') as 'pending' | 'running' | 'done' | 'error',
          detail: s.result ? s.result.slice(0, 50) : s.error,
        }));
        printSteps(displaySteps);
      }
    } catch (error) {
      printError(`任务执行失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  });

// devflow agent intent <描述> - 测试意图识别
agentCommand
  .command('intent')
  .alias('recognize')
  .description('测试意图识别')
  .argument('<description>', '任务描述')
  .action((description: string) => {
    const result = intentRecognizer.recognizeSync(description);

    printHeader();
    printSection('>> 意图识别结果');
    printKeyValue([
      { key: '输入描述', value: description, highlight: true },
      { key: '识别意图', value: result.intent, highlight: true },
      { key: '置信度', value: `${(result.confidence * 100).toFixed(0)}%` },
      { key: '建议工具', value: result.suggestedTools.length > 0 ? result.suggestedTools.join(', ') : '无' },
    ]);
  });

// devflow agent plan <任务> - 只做规划，不执行
agentCommand
  .command('plan')
  .description('仅规划任务步骤（不执行）')
  .argument('<task>', '要规划的任务描述')
  .action(async (task: string) => {
    try {
      printHeader();
      printSection('>> 任务规划');

      const intent = intentRecognizer.recognizeSync(task);
      console.log(chalk.cyan(`  >> 意图: ${chalk.bold(intent.intent)}\n`));

      const { planTask } = await import('../agent/core.js');
      const steps = await planTask(task, intent.intent);

      printSection(`分解为 ${steps.length} 个步骤`);
      steps.forEach((step, i) => {
        console.log(`  ${i + 1}. ${chalk.cyan(step.description)}`);
        if (step.tool) {
          console.log(`     ${chalk.gray('→ 工具:')} ${chalk.green(step.tool)}`);
        }
      });

      console.log();
    } catch (error) {
      printError(`任务规划失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  });

// devflow agent status - 查看 Agent 状态
agentCommand
  .command('status')
  .description('查看 Agent 系统状态')
  .action(async () => {
    await configManager.init();

    printHeader();
    printSection('>> Agent 系统状态');

    // 检查工具注册
    const { toolRegistry } = await import('../tools/registry.js');
    const tools = toolRegistry.listTools();

    printKeyValue([
      { key: 'Agent 核心循环', value: '✓ 就绪', highlight: true },
      { key: '意图识别引擎', value: '✓ 就绪', highlight: true },
      { key: '任务规划器', value: '✓ 就绪', highlight: true },
      { key: '已注册工具', value: `${tools.length} 个` },
      { key: '记忆系统', value: '✓ 集成', highlight: false },
    ]);

    console.log();
    printSection('> 可用工具列表');
    const toolGroups = new Map<string, string[]>();
    for (const tool of tools) {
      const group = tool.category || 'other';
      const groupTools = toolGroups.get(group);
      if (groupTools) {
        groupTools.push(tool.name);
      } else {
        toolGroups.set(group, [tool.name]);
      }
    }
    for (const [group, names] of toolGroups) {
      console.log(`  ${chalk.yellow(group)}: ${names.join(', ')}`);
    }
    console.log();
  });

// 添加子模块命令
agentCommand.addCommand(agentTrustCommand);
agentCommand.addCommand(agentRiskCommand);

export { agentCommand };
