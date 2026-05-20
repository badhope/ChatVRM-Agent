/**
 * Plan 模式 - 只读规划
 *
 * 学习自 Cline 的 Plan Mode：
 * - 只能读取文件（read_file, search_files, list_dir），不能写入或执行命令
 * - 生成结构化的书面计划
 * - 用户审阅后切换到 Act 模式执行
 */

import chalk from 'chalk';
import type { Message } from '../types.js';
import { callLLM } from './llm-caller.js';
import type { ReasonerConfig } from './llm-caller.js';
import { intentRecognizer } from './intent-recognizer.js';
import { planTask } from './task-planner.js';
import { reasonStep } from './reasoner.js';
import { executeStep } from './step-executor.js';
import { ContextBuilder } from './context-builder.js';
import type { TaskStep, Task } from './types.js';

/** 只读工具集合（Plan 模式允许的工具） */
const READ_ONLY_TOOLS = new Set([
  'read_file',
  'search_files',
  'list_dir',
  'file_tree',
  'file_info',
  'sysinfo',
]);

/** 写入类工具（Plan 模式禁止的工具） */
const WRITE_TOOLS = new Set([
  'write_file',
  'delete_file',
  'shell',
  'http',
]);

/** Plan 结果 */
export interface PlanResult {
  /** 任务描述 */
  taskDescription: string;
  /** 识别的意图 */
  intent: string;
  /** 规划的步骤 */
  steps: TaskStep[];
  /** AI 生成的详细方案 */
  detailedPlan: string;
  /** 需要修改的文件 */
  filesToModify: string[];
  /** 潜在风险 */
  risks: string[];
  /** 预估步骤数 */
  estimatedSteps: number;
  /** 上下文信息（Repo Map, Knowledge Graph, Code Search） */
  context?: {
    repoMapIncluded: boolean;
    codeSearchIncluded: boolean;
    knowledgeIncluded: boolean;
    codeEntryCount: number;
    knowledgeEntryCount: number;
  };
}

/** Plan 系统提示词 */
const PLAN_SYSTEM_PROMPT = `你是一位资深开发者的规划助手。用户会给你一个任务，你需要：

1. 分析任务需求，理解目标
2. 查阅相关代码（通过工具读取文件）
3. 制定详细的执行计划

重要规则：
- 你只能**读取**代码，不能修改任何文件
- 输出必须是一份结构化的执行计划
- 计划要具体到每个步骤的操作和目标文件

## 思考要求
- 请先深入分析问题，考虑多种可能的解决方案，评估每种方案的优缺点，然后选择最优方案
- 逐步思考，每一步都要有明确的推理依据
- 在执行代码修改前，先考虑可能的影响和风险
- 如果遇到不确定的情况，主动提出疑问而非猜测

输出格式：
## 分析
（对任务的理解和深入分析）

## 方案对比
### 方案 A: [名称]
- 优点: ...
- 缺点: ...
- 风险: ...

### 方案 B: [名称]
- 优点: ...
- 缺点: ...
- 风险: ...

## 推荐方案
（选择最优方案并说明理由）

## 执行计划
### 步骤 1: [标题]
- **操作**: read_file / search_files / ...
- **目标**: ...
- **预期结果**: ...

### 步骤 2: [标题]
...

## 需要修改的文件
- file1.ts: 修改原因
- file2.ts: 修改原因

## 风险评估
- 风险1: ...

## 总结
（一句话概括整体方案）`;

/**
 * 执行 Plan 模式
 * @param taskDescription 任务描述
 * @param config LLM 配置
 * @param onOutput 输出回调
 * @param rootDir 可选的项目根目录，用于构建上下文
 */
export async function runPlanMode(
  taskDescription: string,
  config?: ReasonerConfig,
  onOutput?: (text: string) => void,
  rootDir?: string
): Promise<PlanResult> {
  const output = onOutput || ((text: string) => console.log(text));
  const contextBuilder = new ContextBuilder();
  const projectRoot = rootDir || process.cwd();

  // 1. 意图识别
  const { intent } = intentRecognizer.recognizeSync(taskDescription);
  output(chalk.cyan(`🎯 意图: ${intent}`));

  // 1.5 构建上下文（Repo Map + Knowledge Graph + Code Index）
  output(chalk.dim('📊 构建代码库上下文...'));
  let contextResult;
  try {
    contextResult = await contextBuilder.build({
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
    if (contextResult.knowledgeIncluded) {
      output(chalk.green(`  ✓ 知识图谱已查询 (${contextResult.knowledgeEntryCount} 个相关条目)`));
    }
  } catch (error) {
    output(chalk.dim(`  ⚠ 上下文构建失败: ${error instanceof Error ? error.message : String(error)}`));
    contextResult = null;
  }

  // 2. 基础规划
  const steps = await planTask(taskDescription, intent);
  output(chalk.dim(`📋 基础步骤: ${steps.length} 个`));

  // 3. 过滤出只读步骤并执行
  const readOnlySteps = steps.filter(s => !s.tool || READ_ONLY_TOOLS.has(s.tool));
  const context: Record<string, unknown> = {};
  const previousResults: string[] = [];

  for (const step of readOnlySteps) {
    if (step.tool && READ_ONLY_TOOLS.has(step.tool)) {
      output(chalk.dim(`  🔍 ${step.description}...`));
      try {
        // 为只读步骤生成参数
        if (!step.args || Object.keys(step.args).length === 0) {
          const reasoning = await reasonStep({
            taskDescription,
            intent,
            stepDescription: step.description,
            previousResults,
            availableTools: [...READ_ONLY_TOOLS],
          }, config);
          // 尝试从推理结果中提取参数
          try {
            const jsonMatch = reasoning.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              step.args = JSON.parse(jsonMatch[0]);
            }
          } catch (error) {
            // Parameter extraction failed, skip
          }
        }

        if (step.args && Object.keys(step.args).length > 0) {
          step.result = await executeStep(step, context);
          previousResults.push(step.result);
          output(chalk.green(`  ✓ ${step.description}`));
        } else {
          step.result = '(跳过 - 无法确定参数)';
          output(chalk.dim(`  ⏭ ${step.description} (跳过)`));
        }
        step.status = 'done';
      } catch (error) {
        step.status = 'error';
        step.error = error instanceof Error ? error.message : String(error);
        output(chalk.yellow(`  ⚠ ${step.description}: ${step.error}`));
      }
    } else if (!step.tool) {
      // 空操作步骤 → AI 推理
      output(chalk.dim(`  🧠 ${step.description}...`));
      try {
        const reasoning = await reasonStep({
          taskDescription,
          intent,
          stepDescription: step.description,
          previousResults,
          availableTools: [...READ_ONLY_TOOLS],
        }, config);
        step.result = reasoning;
        previousResults.push(reasoning);
        step.status = 'done';
        output(chalk.green(`  ✓ ${step.description}`));
      } catch (error) {
        step.status = 'error';
        output(chalk.yellow(`  ⚠ ${step.description}: 推理失败`));
      }
    }
  }

  // 4. 生成详细方案
  output(chalk.dim('\n🧠 生成详细方案...'));
  const planMessages: Message[] = [
    { role: 'system', content: PLAN_SYSTEM_PROMPT },
    { role: 'user', content: `## 任务\n${taskDescription}\n\n## 已收集的信息\n${previousResults.join('\n\n---\n\n')}\n\n请基于以上信息，生成完整的执行计划。` },
  ];

  const detailedPlan = await callLLM(planMessages, {
    temperature: 0.2,
    maxTokens: 4096,
    ...config,
  });

  // 5. 解析结果
  const filesToModify: string[] = [];
  const risks: string[] = [];

  const filesMatch = detailedPlan.match(/## 需要修改的文件\s*\n([\s\S]*?)(?=\n## |\n# |$)/);
  if (filesMatch) {
    filesMatch[1].split('\n')
      .filter(line => line.trim().startsWith('-'))
      .forEach(line => {
        const match = line.replace(/^-\s*/, '').match(/^([^\s:]+)/);
        if (match) filesToModify.push(match[1]);
      });
  }

  const riskMatch = detailedPlan.match(/## 风险评估\s*\n([\s\S]*?)(?=\n## |\n# |$)/);
  if (riskMatch) {
    riskMatch[1].split('\n')
      .filter(line => line.trim().startsWith('-'))
      .forEach(line => risks.push(line.replace(/^-\s*/, '').trim()));
  }

  return {
    taskDescription,
    intent,
    steps,
    detailedPlan,
    filesToModify,
    risks,
    estimatedSteps: steps.filter(s => s.tool && WRITE_TOOLS.has(s.tool)).length + steps.filter(s => !s.tool).length,
    context: contextResult ? {
      repoMapIncluded: contextResult.repoMapIncluded,
      codeSearchIncluded: contextResult.codeSearchIncluded,
      knowledgeIncluded: contextResult.knowledgeIncluded,
      codeEntryCount: contextResult.codeEntryCount,
      knowledgeEntryCount: contextResult.knowledgeEntryCount,
    } : undefined,
  };
}
