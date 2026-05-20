/**
 * AI 输出验证模块 (使用 Zod)
 *
 * 提供结构化的输出验证机制，使用 Zod 进行运行时类型验证。
 * 支持代码、JSON、Markdown 和纯文本等多种输出类型的验证。
 *
 * @module output-validator
 * @remarks
 * 此文件作为向后兼容的入口点，所有实现已拆分到 output-validator/ 子目录：
 * - schemas.ts: Schema 定义和类型接口
 * - validator.ts: OutputValidator 类实现
 */

// Re-export everything from the modularized output-validator module
export {
  // Zod Schemas
  JsonSchema,
  CodeBlockSchema,
  MarkdownHeadingSchema,
  ToolCallSchema,
  MultipleToolCallsSchema,

  // TypeScript Interfaces
  type ValidationResult,
  type OutputSchema,

  // Helper Functions
  createObjectSchema,
  createArraySchema,
  createStringSchema,

  // Predefined Schemas
  DEFAULT_SCHEMAS,
  DEFAULT_ZOD_SCHEMAS,

  // Validator Class
  OutputValidator,
} from './output-validator/index.js';
