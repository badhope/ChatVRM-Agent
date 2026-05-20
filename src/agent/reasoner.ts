/**
 * AI 推理执行器模块
 *
 * 让 Agent 的空操作步骤（如"分析错误原因"、"制定修复方案"）真正调用 LLM 进行推理。
 * 提供三种核心推理能力：通用步骤推理、代码生成、代码分析。
 */

import type { ProviderType, Message } from '../types.js';
import chalk from 'chalk';

// 从子模块导入 LLM 调用基础设施
import { SYSTEM_PROMPTS } from './prompts.js';
import {
  callLLM,
  resolveConfig,
  getSystemPrompt,
} from './llm-caller.js';
import type { ReasonerConfig } from './llm-caller.js';

// Re-export 配置接口和常量
export type { ReasonerConfig };
export { SYSTEM_PROMPTS, resolveConfig, callLLM };

// ==================== 上下文接口 ====================

/**
 * 通用推理步骤的上下文
 */
export interface ReasonContext {
  /** 用户原始任务描述 */
  taskDescription: string;
  /** 识别的意图（如 bug-hunter、fullstack） */
  intent: string;
  /** 当前步骤描述（如"分析错误原因"） */
  stepDescription: string;
  /** 之前步骤的执行结果，作为上下文传入 */
  previousResults: string[];
  /** 当前可用的工具列表 */
  availableTools: string[];
}

/**
 * 代码生成上下文
 */
export interface CodeContext {
  /** 用户原始任务描述 */
  taskDescription: string;
  /** 识别的意图 */
  intent: string;
  /** 编程语言（如 TypeScript、Python） */
  language?: string;
  /** 具体需求列表 */
  requirements: string[];
  /** 之前步骤的执行结果 */
  previousResults: string[];
}

/**
 * 代码分析上下文
 */
export interface AnalyzeContext {
  /** 要分析的代码内容 */
  code: string;
  /** 任务描述 */
  taskDescription: string;
  /** 分析关注点（如 "安全"、"性能"、"bug"、"可读性"） */
  focus?: string;
}

// ==================== 核心推理函数 ====================

/**
 * 对单个步骤进行 AI 推理
 *
 * 将当前步骤的描述、任务上下文、之前步骤的结果组合成 prompt，
 * 调用 LLM 获取推理结果。适用于 Agent 执行流程中的"思考型"步骤，
 * 如"分析错误原因"、"制定修复方案"、"识别代码坏味道"等。
 *
 * @param context - 推理上下文，包含任务描述、意图、步骤信息等
 * @param config - 可选的推理器配置（provider、model、temperature 等）
 * @returns AI 的推理文本结果
 *
 * @example
 * ```typescript
 * const result = await reasonStep({
 *   taskDescription: '修复登录页面的表单验证问题',
 *   intent: 'bug-hunter',
 *   stepDescription: '分析错误原因',
 *   previousResults: ['表单提交后没有显示错误提示', '控制台报错: Cannot read property of undefined'],
 *   availableTools: ['read_file', 'search_files', 'write_file'],
 * });
 * ```
 */
export async function reasonStep(
  context: ReasonContext,
  config?: ReasonerConfig
): Promise<string> {
  if (!context.taskDescription?.trim() || !context.stepDescription?.trim()) {
    return '（跳过）任务描述或步骤描述为空';
  }

  // 获取对应意图的 system prompt
  const systemPrompt = getSystemPrompt(context.intent);

  // 构造之前步骤结果的上下文段落
  let previousContext = '';
  if (context.previousResults.length > 0) {
    previousContext = '\n\n--- 之前步骤的执行结果 ---\n' +
      context.previousResults
        .map((result, index) => `[步骤 ${index + 1}]: ${result}`)
        .join('\n\n') +
      '\n--- 之前步骤结束 ---';
  }

  // 构造可用工具列表段落
  let toolsContext = '';
  if (context.availableTools.length > 0) {
    toolsContext = `\n\n当前可用的工具: ${context.availableTools.join(', ')}`;
  }

  // 构造 user prompt
  const userPrompt = [
    `## 任务描述`,
    context.taskDescription,
    '',
    `## 当前步骤`,
    context.stepDescription,
    previousContext,
    toolsContext,
    '',
    `## 要求`,
    `请针对当前步骤"${context.stepDescription}"进行深入分析和推理。`,
    `结合之前步骤的结果，给出具体、可操作的输出。`,
    `如果需要执行后续操作，请明确指出。`,
  ].join('\n');

  // 组装消息列表
  const messages: Message[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ];

  // 调用 LLM 进行推理
  return callLLM(messages, config);
}

/**
 * 带重试的推理步骤
 *
 * 在推理失败时自动重试，并验证输出质量。
 *
 * @param context - 推理上下文
 * @param config - 推理器配置，支持 maxRetries 和 retryDelay 选项
 * @returns AI 的推理文本结果
 */
export async function reasonStepWithRetry(
  context: ReasonContext,
  config?: ReasonerConfig & { maxRetries?: number; retryDelay?: number }
): Promise<string> {
  const maxRetries = config?.maxRetries ?? 3;
  const retryDelay = config?.retryDelay ?? 1000;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await reasonStep(context, config);

      // 验证输出
      const { OutputValidator, DEFAULT_SCHEMAS } = await import('./output-validator.js');
      const validator = new OutputValidator();
      Object.entries(DEFAULT_SCHEMAS).forEach(([intent, schema]) => {
        validator.registerSchema(intent, schema);
      });

      const validation = validator.validate(result, context.intent);
      if (!validation.valid) {
        console.warn(chalk.yellow(`输出验证失败（尝试 ${attempt}/${maxRetries}）:`));
        validation.errors.forEach(e => console.warn(chalk.yellow(`  - ${e}`)));
        if (attempt < maxRetries) {
          await new Promise(r => setTimeout(r, retryDelay * attempt)); // 指数退避
          continue;
        }
      }

      return result;
    } catch (error) {
      if (attempt === maxRetries) {
        throw error;
      }
      console.warn(chalk.yellow(`推理失败，${retryDelay * attempt}ms 后重试（${attempt}/${maxRetries}）...`));
      await new Promise(r => setTimeout(r, retryDelay * attempt));
    }
  }

  throw new Error('所有重试均失败');
}

/**
 * 生成代码
 *
 * 根据任务描述和需求列表，调用 LLM 生成代码。
 * 自动根据意图选择合适的 system prompt，并注入之前步骤的上下文。
 *
 * @param context - 代码生成上下文
 * @param config - 可选的推理器配置
 * @returns 生成的代码文本（可能包含 markdown 代码块）
 *
 * @example
 * ```typescript
 * const code = await generateCode({
 *   taskDescription: '创建一个用户认证中间件',
 *   intent: 'fullstack',
 *   language: 'TypeScript',
 *   requirements: [
 *     '支持 JWT token 验证',
 *     '支持 API Key 验证',
 *     '提供角色权限检查',
 *   ],
 *   previousResults: ['项目使用 Express 框架', '数据库使用 PostgreSQL'],
 * });
 * ```
 */
export async function generateCode(
  context: CodeContext,
  config?: ReasonerConfig
): Promise<string> {
  // 获取对应意图的 system prompt
  const systemPrompt = getSystemPrompt(context.intent);

  // 构造语言提示
  const languageHint = context.language
    ? `\n目标编程语言: ${context.language}`
    : '';

  // 构造需求列表
  const requirementsText = context.requirements
    .map((req, index) => `${index + 1}. ${req}`)
    .join('\n');

  // 构造之前步骤结果的上下文段落
  let previousContext = '';
  if (context.previousResults.length > 0) {
    previousContext = '\n\n--- 参考信息 ---\n' +
      context.previousResults.join('\n') +
      '\n--- 参考信息结束 ---';
  }

  // 构造 user prompt
  const userPrompt = [
    `## 任务描述`,
    context.taskDescription,
    languageHint,
    '',
    `## 具体需求`,
    requirementsText,
    previousContext,
    '',
    `## 要求`,
    `请根据以上需求生成完整的代码。`,
    `代码需要包含必要的注释和错误处理。`,
    `直接输出代码，使用 markdown 代码块格式。`,
  ].join('\n');

  // 组装消息列表
  const messages: Message[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ];

  // 调用 LLM 生成代码
  return callLLM(messages, config);
}

/**
 * 分析代码
 *
 * 对给定的代码进行深度分析，根据关注点（安全、性能、bug 等）
 * 提供专业的分析报告。
 *
 * @param context - 代码分析上下文
 * @param config - 可选的推理器配置
 * @returns AI 的代码分析结果
 *
 * @example
 * ```typescript
 * const analysis = await analyzeCode({
 *   code: 'function login(user, pass) { db.query(`SELECT * FROM users WHERE name=${user} AND pass=${pass}`) }',
 *   taskDescription: '审查登录功能的代码安全性',
 *   focus: '安全',
 * });
 * ```
 */
export async function analyzeCode(
  context: AnalyzeContext,
  config?: ReasonerConfig
): Promise<string> {
  // 根据关注点选择最合适的 system prompt
  let systemPrompt = SYSTEM_PROMPTS['default'];

  if (context.focus) {
    const focusLower = context.focus.toLowerCase();
    // 根据关注点映射到对应的专家 prompt
    if (/安全|security|漏洞|vulnerability/.test(focusLower)) {
      systemPrompt = SYSTEM_PROMPTS['security'];
    } else if (/性能|performance|优化|optimize/.test(focusLower)) {
      systemPrompt = SYSTEM_PROMPTS['refactor'];
    } else if (/bug|错误|error|调试|debug/.test(focusLower)) {
      systemPrompt = SYSTEM_PROMPTS['bug-hunter'];
    } else if (/测试|test|覆盖/.test(focusLower)) {
      systemPrompt = SYSTEM_PROMPTS['testing'];
    } else if (/审查|review|质量|quality/.test(focusLower)) {
      systemPrompt = SYSTEM_PROMPTS['code-review'];
    } else if (/可读性|readability|规范|style/.test(focusLower)) {
      systemPrompt = SYSTEM_PROMPTS['code-review'];
    }
  }

  // 构造关注点提示
  const focusHint = context.focus
    ? `\n分析关注点: ${context.focus}`
    : '\n分析关注点: 全面分析（包括正确性、安全性、性能、可读性）';

  // 构造 user prompt
  const userPrompt = [
    `## 任务描述`,
    context.taskDescription,
    focusHint,
    '',
    `## 待分析代码`,
    '```',
    context.code,
    '```',
    '',
    `## 要求`,
    `请对以上代码进行深入分析。`,
    `按严重程度或重要性排列你的发现。`,
    `对每个问题提供具体的改进建议和修复代码示例。`,
  ].join('\n');

  // 组装消息列表
  const messages: Message[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ];

  // 调用 LLM 分析代码
  return callLLM(messages, config);
}

/**
 * 带自校正的多轮推理
 *
 * 在首次推理后，让 LLM 自检输出质量，发现问题时自动修正。
 * 适用于关键决策步骤，确保推理结果的正确性和完整性。
 *
 * @param taskDescription - 任务描述
 * @param stepDescription - 步骤描述
 * @param previousResults - 之前步骤的执行结果
 * @param availableTools - 可用工具列表
 * @param maxCorrections - 最大修正次数，默认 2
 * @param config - 可选的推理器配置
 * @returns 推理结果和修正次数
 */
export async function reasonWithSelfCorrection(
  taskDescription: string,
  stepDescription: string,
  previousResults: string[],
  availableTools: string[],
  maxCorrections: number = 2,
  config?: ReasonerConfig
): Promise<{ content: string; corrections: number }> {
  let content = '';
  let corrections = 0;

  for (let attempt = 0; attempt <= maxCorrections; attempt++) {
    const prompt = attempt === 0
      ? `## 任务描述\n${taskDescription}\n\n## 当前步骤\n${stepDescription}\n\n请针对当前步骤进行深入分析和推理，给出具体、可操作的输出。`
      : `上一次的推理结果可能存在问题，请重新审视并修正：\n\n上一次结果：${content}\n\n请检查是否有逻辑错误、遗漏的边界条件或不完整的分析，然后给出修正后的结果。`;

    const result = await reasonStep({
      taskDescription,
      intent: 'default',
      stepDescription: prompt,
      previousResults,
      availableTools,
    }, config);
    content = result;

    // Self-check: ask LLM to verify its own output
    if (attempt < maxCorrections) {
      const checkPrompt = `请检查以下推理结果是否正确、完整、无遗漏：\n${content}\n\n如果发现问题，请简要描述。如果没有问题，请回复"OK"。`;
      const check = await reasonStep({
        taskDescription,
        intent: 'default',
        stepDescription: checkPrompt,
        previousResults,
        availableTools: [],
      }, config);
      if (check.trim() === 'OK' || check.trim().length < 20) {
        break; // No corrections needed
      }
      corrections++;
    }
  }

  return { content, corrections };
}
