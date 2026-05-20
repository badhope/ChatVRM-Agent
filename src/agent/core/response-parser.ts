/**
 * Agent Response Parser
 *
 * Parses AI responses to extract tool calls, reasoning, and structured data.
 * Extracted from core.ts for better modularity.
 */

import { toolRegistry } from '../../tools/registry.js';
import type { ToolCall } from './types.js';

/**
 * 解析结果接口
 */
export interface ParseResult<T> {
  /** 是否成功解析 */
  success: boolean;
  /** 解析出的数据 */
  data?: T;
  /** 错误信息 */
  error?: string;
  /** 原始响应 */
  rawResponse?: string;
}

/**
 * 从 AI 响应中提取 JSON 代码块
 *
 * @param response AI 响应文本
 * @returns 提取的 JSON 字符串或 null
 */
export function extractJsonBlock(response: string): string | null {
  // 匹配 ```json ... ``` 或 ``` ... ``` 格式的代码块
  const jsonBlockMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonBlockMatch) {
    return jsonBlockMatch[1].trim();
  }
  return null;
}

/**
 * 从文本中提取 JSON 对象
 *
 * @param text 输入文本
 * @returns 解析出的对象或 null
 */
export function extractJsonObject(text: string): Record<string, unknown> | null {
  // 首先尝试提取代码块
  const jsonBlock = extractJsonBlock(text);
  const contentToParse = jsonBlock || text;

  // 匹配最外层的花括号
  const braceMatch = contentToParse.match(/\{[\s\S]*\}/);
  if (!braceMatch) {
    return null;
  }

  try {
    return JSON.parse(braceMatch[0]);
  } catch {
    return null;
  }
}

/**
 * 从 AI 响应中解析工具调用
 *
 * @param response AI 响应文本
 * @returns 解析结果，包含工具调用信息
 */
export function parseToolCall(response: string): ParseResult<ToolCall> {
  // 尝试提取 JSON
  const jsonData = extractJsonObject(response);

  if (!jsonData) {
    return {
      success: false,
      error: '无法从响应中提取有效的 JSON 对象',
      rawResponse: response,
    };
  }

  // 检查是否包含工具名称
  if (!jsonData.tool && !jsonData.toolName && !jsonData.name) {
    return {
      success: false,
      error: '响应中缺少工具名称字段（tool/toolName/name）',
      rawResponse: response,
    };
  }

  const toolName = String(jsonData.tool || jsonData.toolName || jsonData.name);

  // 验证工具是否存在
  if (!toolRegistry.has(toolName)) {
    return {
      success: false,
      error: `工具 "${toolName}" 不存在`,
      rawResponse: response,
    };
  }

  // 提取参数
  const args = (jsonData.args || jsonData.arguments || jsonData.params || {}) as Record<string, unknown>;

  // 提取推理（可选）
  const reasoning = jsonData.reasoning || jsonData.reason || jsonData.thought;

  return {
    success: true,
    data: {
      tool: toolName,
      args,
      reasoning: reasoning ? String(reasoning) : undefined,
    },
  };
}

/**
 * Type guard to check if a value looks like a tool call object.
 */
function isToolCallLike(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value)
  );
}

/**
 * 从 AI 响应中解析多个工具调用
 *
 * @param response AI 响应文本
 * @returns 解析结果，包含工具调用数组
 */
export function parseMultipleToolCalls(response: string): ParseResult<ToolCall[]> {
  // 首先尝试作为单个对象解析
  const singleResult = parseToolCall(response);
  if (singleResult.success && singleResult.data) {
    return {
      success: true,
      data: [singleResult.data],
    };
  }

  // 尝试提取 JSON 数组
  const jsonBlock = extractJsonBlock(response);
  const contentToParse = jsonBlock || response;

  // 匹配方括号数组
  const arrayMatch = contentToParse.match(/\[[\s\S]*\]/);
  if (!arrayMatch) {
    return {
      success: false,
      error: '无法从响应中提取工具调用数组',
      rawResponse: response,
    };
  }

  let parsedArray: unknown[];
  try {
    const parsed = JSON.parse(arrayMatch[0]);
    if (!Array.isArray(parsed)) {
      return {
        success: false,
        error: '解析结果不是数组',
        rawResponse: response,
      };
    }
    parsedArray = parsed;
  } catch (parseError) {
    return {
      success: false,
      error: `JSON 解析失败: ${parseError instanceof Error ? parseError.message : String(parseError)}`,
      rawResponse: response,
    };
  }

  const toolCalls: ToolCall[] = [];
  const errors: string[] = [];

  for (let i = 0; i < parsedArray.length; i++) {
    const item = parsedArray[i];
    if (!isToolCallLike(item)) {
      errors.push(`第 ${i + 1} 项不是有效对象`);
      continue;
    }

    const toolName = item.tool ||
                     item.toolName ||
                     item.name;

    if (!toolName) {
      errors.push(`第 ${i + 1} 项缺少工具名称`);
      continue;
    }

    if (!toolRegistry.has(String(toolName))) {
      errors.push(`第 ${i + 1} 项的工具 "${toolName}" 不存在`);
      continue;
    }

    toolCalls.push({
      tool: String(toolName),
      args: (item.args ||
             item.arguments ||
             {}) as Record<string, unknown>,
      reasoning: String(item.reasoning ||
                       item.reason ||
                       ''),
    });
  }

  if (toolCalls.length === 0) {
    return {
      success: false,
      error: `未能解析出任何有效工具调用: ${errors.join('; ')}`,
      rawResponse: response,
    };
  }

  return {
    success: true,
    data: toolCalls,
  };
}

/**
 * 从 AI 响应中提取推理内容
 *
 * @param response AI 响应文本
 * @returns 提取的推理文本
 */
export function extractReasoning(response: string): string {
  // 移除代码块
  const withoutCodeBlocks = response.replace(/```[\s\S]*?```/g, '');

  // 移除 JSON 对象
  const withoutJson = withoutCodeBlocks.replace(/\{[\s\S]*?\}/g, '');

  // 清理并返回
  return withoutJson.trim();
}

/**
 * 从 AI 响应中提取步骤列表
 *
 * @param response AI 响应文本
 * @returns 步骤描述数组
 */
export function extractSteps(response: string): string[] {
  const steps: string[] = [];

  // 尝试匹配数字编号的步骤（1. 2. 3. 或 1) 2) 3)）
  const numberedPattern = /^(?:\d+[.\)])\s*(.+)$/gm;
  let match;
  while ((match = numberedPattern.exec(response)) !== null) {
    steps.push(match[1].trim());
  }

  // 如果没有找到数字编号，尝试匹配列表项（- 或 *）
  if (steps.length === 0) {
    const listPattern = /^[-*]\s*(.+)$/gm;
    while ((match = listPattern.exec(response)) !== null) {
      steps.push(match[1].trim());
    }
  }

  return steps;
}

/**
 * 解析意图识别结果
 *
 * @param response AI 响应文本
 * @returns 解析出的意图
 */
export function parseIntent(response: string): string {
  const jsonData = extractJsonObject(response);

  if (jsonData) {
    const intent = jsonData.intent || jsonData.intention || jsonData.type;
    if (intent) {
      return String(intent).toLowerCase().replace(/\s+/g, '-');
    }
  }

  // 回退：从文本中提取第一个有效单词作为意图
  const cleanText = response.toLowerCase().replace(/[^a-z\s-]/g, '');
  const words = cleanText.split(/\s+/).filter(w => w.length > 0);

  if (words.length > 0) {
    return words[0];
  }

  return 'general';
}

/**
 * 解析置信度分数
 *
 * @param response AI 响应文本
 * @returns 置信度（0-1）
 */
export function parseConfidence(response: string): number {
  const jsonData = extractJsonObject(response);

  if (jsonData) {
    const confidence = jsonData.confidence || jsonData.score || jsonData.certainty;
    if (typeof confidence === 'number') {
      return Math.max(0, Math.min(1, confidence));
    }
    if (typeof confidence === 'string') {
      const parsed = parseFloat(confidence);
      if (!isNaN(parsed)) {
        return Math.max(0, Math.min(1, parsed));
      }
    }
  }

  // 回退：从文本中搜索百分比
  const percentMatch = response.match(/(\d+(?:\.\d+)?)%/);
  if (percentMatch) {
    return parseFloat(percentMatch[1]) / 100;
  }

  // 搜索 0-1 之间的小数
  const decimalMatch = response.match(/\b(0\.\d+|1\.0)\b/);
  if (decimalMatch) {
    return parseFloat(decimalMatch[1]);
  }

  return 0.5; // 默认置信度
}

/**
 * 安全地解析 JSON，失败时返回默认值
 *
 * @param text JSON 文本
 * @param defaultValue 默认值
 * @returns 解析结果或默认值
 */
export function safeJsonParse<T>(text: string, defaultValue: T): T {
  try {
    return JSON.parse(text) as T;
  } catch {
    return defaultValue;
  }
}

/**
 * 验证响应是否包含特定字段
 *
 * @param response AI 响应文本
 * @param requiredFields 必需字段列表
 * @returns 验证结果
 */
export function validateResponseFields(
  response: string,
  requiredFields: string[]
): { valid: boolean; missingFields: string[] } {
  const jsonData = extractJsonObject(response);

  if (!jsonData) {
    return {
      valid: false,
      missingFields: requiredFields,
    };
  }

  const missingFields = requiredFields.filter(field => !(field in jsonData));

  return {
    valid: missingFields.length === 0,
    missingFields,
  };
}

/**
 * 提取代码块（指定语言）
 *
 * @param response AI 响应文本
 * @param language 语言标识（如 'typescript', 'javascript'）
 * @returns 代码内容或 null
 */
export function extractCodeBlock(response: string, language?: string): string | null {
  const pattern = language
    ? new RegExp(`\\\`\\\`\\\`${language}\\s*([\\s\\S]*?)\\\`\\\`\\\``, 'i')
    : /```(?:\w+)?\s*([\s\S]*?)```/;

  const match = response.match(pattern);
  return match ? match[1].trim() : null;
}
