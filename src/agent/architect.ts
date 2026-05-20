/**
 * Architect 角色 - 架构师模式
 *
 * 使用强推理模型分析问题、设计解决方案、规划修改策略。
 * Architect 不直接修改任何文件，仅输出方案描述。
 *
 * 学习自 Aider 的 Architect/Editor 双模型分工模式。
 */

import type { Message } from '../types.js';
import { callLLM } from './llm-caller.js';
import type { ReasonerConfig } from './llm-caller.js';

/** Architect 输出结果 */
export interface ArchitectResult {
  /** 方案概述 */
  summary: string;
  /** 详细的修改计划 */
  plan: string;
  /** 需要修改的文件列表 */
  filesToModify: string[];
  /** 需要新建的文件列表 */
  filesToCreate: string[];
  /** 潜在风险 */
  risks: string[];
  /** 预估复杂度 (1-5) */
  complexity: number;
}

/** Architect 系统提示词 */
const ARCHITECT_SYSTEM_PROMPT = `你是一位资深软件架构师。你的职责是：
1. 深入分析用户的需求和问题
2. 设计最优的技术方案
3. 规划具体的修改步骤
4. 识别潜在风险和边界情况

重要规则：
- 你只负责分析和规划，不直接修改任何文件
- 输出必须结构化、具体、可操作
- 每个修改步骤都要说明"改什么"、"为什么改"、"怎么改"
- 识别所有可能受影响的文件和模块
- 评估方案的复杂度和风险

输出格式要求：
## 方案概述
（简要描述整体方案）

## 修改计划
### 步骤 1: [标题]
- **目标**: ...
- **修改文件**: ...
- **具体操作**: ...

## 文件清单
- 需要修改: file1.ts, file2.ts
- 需要新建: file3.ts

## 风险评估
- 风险1: ...
- 风险2: ...

## 复杂度: X/5`;

/**
 * Architect 分析
 * @param taskDescription 用户任务描述
 * @param context 额外上下文（如已有代码、错误信息等）
 * @param config 可选的 LLM 配置（建议使用强推理模型）
 */
export async function architectAnalyze(
  taskDescription: string,
  context?: {
    codeContext?: string;
    errorInfo?: string;
    relatedFiles?: string[];
    previousAttempts?: string;
  },
  config?: ReasonerConfig
): Promise<ArchitectResult> {
  // 构造上下文
  let contextSection = '';
  if (context?.codeContext) {
    contextSection += `\n\n## 相关代码\n\`\`\`\n${context.codeContext}\n\`\`\``;
  }
  if (context?.errorInfo) {
    contextSection += `\n\n## 错误信息\n${context.errorInfo}`;
  }
  if (context?.relatedFiles?.length) {
    contextSection += `\n\n## 相关文件\n${context.relatedFiles.join('\n')}`;
  }
  if (context?.previousAttempts) {
    contextSection += `\n\n## 之前的尝试（已失败）\n${context.previousAttempts}`;
  }

  const userPrompt = `## 任务描述\n${taskDescription}${contextSection}

请作为架构师，分析以上任务并给出详细的技术方案。`;

  const messages: Message[] = [
    { role: 'system', content: ARCHITECT_SYSTEM_PROMPT },
    { role: 'user', content: userPrompt },
  ];

  const response = await callLLM(messages, {
    temperature: 0.2,  // 低温度保证稳定输出
    maxTokens: 4096,   // 方案可能较长
    ...config,
  });

  return parseArchitectResponse(response);
}

/**
 * 解析 Architect 的输出为结构化结果
 */
function parseArchitectResponse(response: string): ArchitectResult {
  const result: ArchitectResult = {
    summary: '',
    plan: response,
    filesToModify: [],
    filesToCreate: [],
    risks: [],
    complexity: 3,
  };

  // 提取方案概述
  const summaryMatch = response.match(/## 方案概述\s*\n([\s\S]*?)(?=\n## |\n# )/);
  if (summaryMatch) {
    result.summary = summaryMatch[1].trim();
  }

  // 提取文件清单
  const filesSection = response.match(/## 文件清单[\s\S]*?$/);
  if (filesSection) {
    const modifyMatch = filesSection[0].match(/需要修改[:：]\s*(.+?)(?:\n|$)/);
    if (modifyMatch) {
      result.filesToModify = modifyMatch[1]
        .split(/[,，、\n]/)
        .map(f => f.trim())
        .filter(f => f.length > 0);
    }
    const createMatch = filesSection[0].match(/需要新建[:：]\s*(.+?)(?:\n|$)/);
    if (createMatch) {
      result.filesToCreate = createMatch[1]
        .split(/[,，、\n]/)
        .map(f => f.trim())
        .filter(f => f.length > 0);
    }
  }

  // 提取风险评估
  const riskSection = response.match(/## 风险评估\s*\n([\s\S]*?)(?=\n## |\n# |$)/);
  if (riskSection) {
    result.risks = riskSection[1]
      .split('\n')
      .filter(line => line.trim().startsWith('-') || line.trim().startsWith('•'))
      .map(line => line.replace(/^[-•]\s*/, '').trim())
      .filter(r => r.length > 0);
  }

  // 提取复杂度
  const complexityMatch = response.match(/复杂度[:：]\s*(\d)/);
  if (complexityMatch) {
    result.complexity = Math.min(5, Math.max(1, parseInt(complexityMatch[1], 10)));
  }

  return result;
}
