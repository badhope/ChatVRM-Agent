/**
 * Output Validator Schemas
 *
 * 提供 Zod schema 定义和 TypeScript 接口。
 */

import { z } from 'zod';

// ============================================================================
// SECTION: Zod Schemas
// ============================================================================

/**
 * JSON 输出验证模式
 * 支持任意 JSON 结构
 */
export const JsonSchema = z.unknown().refine(
  (val) => val !== undefined,
  { message: 'JSON 解析结果不能为 undefined' }
);

/**
 * 代码块验证模式
 */
export const CodeBlockSchema = z.object({
  language: z.string().optional(),
  content: z.string().min(1, '代码内容不能为空'),
});

/**
 * Markdown 标题验证模式
 */
export const MarkdownHeadingSchema = z.object({
  level: z.number().int().min(1).max(6),
  text: z.string().min(1),
});

/**
 * 工具调用验证模式
 */
export const ToolCallSchema = z.object({
  name: z.string().min(1, '工具名称不能为空'),
  arguments: z.record(z.unknown()).optional(),
});

/**
 * 多工具调用验证模式
 */
export const MultipleToolCallsSchema = z.array(ToolCallSchema).min(1);

// ============================================================================
// SECTION: TypeScript Interfaces
// ============================================================================

/**
 * 验证结果接口
 */
export interface ValidationResult {
  /** 验证是否通过 */
  valid: boolean;
  /** 错误信息列表 */
  errors: string[];
  /** 改进建议列表（可选） */
  suggestions?: string[];
}

/**
 * 输出模式定义接口
 */
export interface OutputSchema {
  /** 输出内容类型 */
  type: 'code' | 'json' | 'markdown' | 'text';
  /** 必须包含的内容列表 */
  required?: string[];
  /** 必须匹配的正则表达式模式 */
  patterns?: RegExp[];
  /** 禁止匹配的正则表达式模式 */
  forbidden?: RegExp[];
  /** 最大长度限制 */
  maxLength?: number;
  /** 最小长度限制 */
  minLength?: number;
}

// ============================================================================
// SECTION: Schema Builders
// ============================================================================

/**
 * 构建 JSON 对象验证模式
 */
export function buildJsonObjectSchema<T extends z.ZodRawShape>(
  shape: T
): z.ZodObject<T> {
  return z.object(shape);
}

/**
 * 构建数组验证模式
 */
export function buildArraySchema<T extends z.ZodTypeAny>(
  elementSchema: T,
  options?: { min?: number; max?: number }
): z.ZodArray<T> {
  let schema = z.array(elementSchema);
  if (options?.min !== undefined) {
    schema = schema.min(options.min);
  }
  if (options?.max !== undefined) {
    schema = schema.max(options.max);
  }
  return schema;
}

// ============================================================================
// SECTION: Helper Functions
// ============================================================================

/**
 * 创建对象验证模式
 */
export function createObjectSchema<T extends z.ZodRawShape>(shape: T): z.ZodObject<T> {
  return buildJsonObjectSchema(shape);
}

/**
 * 创建数组验证模式
 */
export function createArraySchema<T extends z.ZodTypeAny>(
  elementSchema: T,
  options?: { min?: number; max?: number }
): z.ZodArray<T> {
  return buildArraySchema(elementSchema, options);
}

/**
 * 创建字符串验证模式
 */
export function createStringSchema(options?: {
  min?: number;
  max?: number;
  pattern?: RegExp;
}): z.ZodString {
  let schema = z.string();
  if (options?.min !== undefined) {
    schema = schema.min(options.min);
  }
  if (options?.max !== undefined) {
    schema = schema.max(options.max);
  }
  if (options?.pattern !== undefined) {
    schema = schema.regex(options.pattern);
  }
  return schema;
}

// ============================================================================
// SECTION: Predefined Schemas
// ============================================================================

/**
 * 预定义的意图验证模式
 *
 * 为常见意图提供默认的验证规则。
 */
export const DEFAULT_SCHEMAS: Record<string, OutputSchema> = {
  'bug-hunter': {
    type: 'text',
    required: ['问题', '原因', '修复'],
    maxLength: 5000,
  },
  'fullstack': {
    type: 'code',
    patterns: [/function|class|const|let|var|import|export/],
    forbidden: [/eval\s*\(/, /Function\s*\(/],
    maxLength: 10000,
  },
  'code-review': {
    type: 'markdown',
    required: ['审查', '建议'],
    maxLength: 5000,
  },
  'refactor': {
    type: 'code',
    patterns: [/function|class/],
    maxLength: 10000,
  },
  'security': {
    type: 'markdown',
    required: ['漏洞', '风险', '建议'],
    maxLength: 5000,
  },
  'testing': {
    type: 'code',
    patterns: [/describe|it\(|test\(|expect/],
    maxLength: 8000,
  },
};

/**
 * 预定义的 Zod 验证模式
 */
export const DEFAULT_ZOD_SCHEMAS: Record<string, z.ZodType> = {
  // API 响应验证模式
  'api-response': z.object({
    success: z.boolean(),
    data: z.unknown().optional(),
    error: z.string().optional(),
  }),

  // 任务结果验证模式
  'task-result': z.object({
    taskId: z.string(),
    status: z.enum(['pending', 'running', 'completed', 'failed']),
    result: z.unknown().optional(),
    error: z.string().optional(),
  }),

  // 代码分析结果验证模式
  'code-analysis': z.object({
    issues: z.array(
      z.object({
        type: z.string(),
        severity: z.enum(['error', 'warning', 'info']),
        message: z.string(),
        line: z.number().optional(),
      })
    ),
    summary: z.string().optional(),
  }),
};
