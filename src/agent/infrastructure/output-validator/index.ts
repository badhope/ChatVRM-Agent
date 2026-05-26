/**
 * Output Validator Module
 *
 * 提供结构化的输出验证机制，使用 Zod 进行运行时类型验证。
 * 支持代码、JSON、Markdown 和纯文本等多种输出类型的验证。
 */

// Re-export everything from schemas
export {
  JsonSchema,
  CodeBlockSchema,
  MarkdownHeadingSchema,
  ToolCallSchema,
  MultipleToolCallsSchema,
  buildJsonObjectSchema,
  buildArraySchema,
  createObjectSchema,
  createArraySchema,
  createStringSchema,
  DEFAULT_SCHEMAS,
  DEFAULT_ZOD_SCHEMAS,
  type ValidationResult,
  type OutputSchema,
} from './schemas.js';

// Re-export validator class
export { OutputValidator } from './validator.js';
