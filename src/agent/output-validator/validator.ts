/**
 * Output Validator Class
 *
 * 使用 Zod 进行运行时类型验证，管理多个验证模式，
 * 并根据模式验证 AI 输出内容。
 */

import { z } from 'zod';
import {
  JsonSchema,
  CodeBlockSchema,
  MarkdownHeadingSchema,
  type ValidationResult,
  type OutputSchema,
} from './schemas.js';

// ============================================================================
// SECTION: Output Validator Class
// ============================================================================

/**
 * 输出验证器类
 *
 * 使用 Zod 进行运行时类型验证，管理多个验证模式，
 * 并根据模式验证 AI 输出内容。
 */
export class OutputValidator {
  private schemas: Map<string, OutputSchema> = new Map();
  private zodSchemas: Map<string, z.ZodType> = new Map();

  // ============================================================================
  // SECTION: Schema Registration
  // ============================================================================

  /**
   * 注册验证模式
   * @param intent - 意图标识符
   * @param schema - 验证模式定义
   */
  registerSchema(intent: string, schema: OutputSchema): void {
    this.schemas.set(intent, schema);
  }

  /**
   * 注册 Zod 验证模式
   * @param intent - 意图标识符
   * @param zodSchema - Zod 验证模式
   */
  registerZodSchema<T>(intent: string, zodSchema: z.ZodType<T>): void {
    this.zodSchemas.set(intent, zodSchema);
  }

  // ============================================================================
  // SECTION: Main Validation
  // ============================================================================

  /**
   * 验证输出内容
   * @param output - 要验证的输出内容
   * @param intent - 意图标识符，用于选择对应的验证模式
   * @returns 验证结果
   */
  validate(output: string, intent: string): ValidationResult {
    const schema = this.schemas.get(intent);
    const zodSchema = this.zodSchemas.get(intent);

    // 如果没有注册任何模式，返回验证通过
    if (!schema && !zodSchema) {
      return { valid: true, errors: [] };
    }

    const errors: string[] = [];
    const suggestions: string[] = [];

    // 使用 OutputSchema 进行验证
    if (schema) {
      const schemaResult = this.validateWithSchema(output, schema);
      errors.push(...schemaResult.errors);
      suggestions.push(...(schemaResult.suggestions || []));
    }

    // 使用 Zod 模式进行验证
    if (zodSchema) {
      const zodResult = this.validateWithZod(output, zodSchema);
      errors.push(...zodResult.errors);
    }

    return {
      valid: errors.length === 0,
      errors,
      suggestions: suggestions.length > 0 ? suggestions : undefined,
    };
  }

  // ============================================================================
  // SECTION: Schema Validation Helpers
  // ============================================================================

  /**
   * 使用 OutputSchema 验证
   */
  private validateWithSchema(
    output: string,
    schema: OutputSchema
  ): ValidationResult {
    const errors: string[] = [];
    const suggestions: string[] = [];

    // 1. 长度检查
    const lengthResult = this.validateLength(output, schema);
    errors.push(...lengthResult.errors);

    // 2. 必需内容检查
    const requiredResult = this.validateRequired(output, schema);
    errors.push(...requiredResult.errors);

    // 3. 必需模式检查
    const patternsResult = this.validatePatterns(output, schema);
    errors.push(...patternsResult.errors);

    // 4. 禁止模式检查
    const forbiddenResult = this.validateForbidden(output, schema);
    errors.push(...forbiddenResult.errors);

    // 5. 类型特定验证
    const typeResult = this.validateByType(output, schema);
    errors.push(...typeResult.errors);
    suggestions.push(...(typeResult.suggestions || []));

    return {
      valid: errors.length === 0,
      errors,
      suggestions: suggestions.length > 0 ? suggestions : undefined,
    };
  }

  /**
   * 使用 Zod 模式验证
   */
  private validateWithZod(output: string, zodSchema: z.ZodType): ValidationResult {
    const errors: string[] = [];

    // 尝试解析 JSON（如果输出是 JSON 字符串）
    let data: unknown;
    try {
      data = JSON.parse(output);
    } catch {
      // 如果不是 JSON，直接使用字符串
      data = output;
    }

    const result = zodSchema.safeParse(data);
    if (!result.success) {
      // 格式化 Zod 错误信息
      const formattedErrors = result.error.issues.map((issue) => {
        const path = issue.path.length > 0 ? issue.path.join('.') : 'root';
        return `${path}: ${issue.message}`;
      });
      errors.push(...formattedErrors);
    }

    return { valid: errors.length === 0, errors };
  }

  // ============================================================================
  // SECTION: Specific Validation Methods
  // ============================================================================

  /**
   * 验证长度限制
   */
  private validateLength(
    output: string,
    schema: OutputSchema
  ): { errors: string[] } {
    const errors: string[] = [];

    if (schema.minLength !== undefined && output.length < schema.minLength) {
      errors.push(`输出过短（${output.length} < ${schema.minLength}）`);
    }

    if (schema.maxLength !== undefined && output.length > schema.maxLength) {
      errors.push(`输出过长（${output.length} > ${schema.maxLength}）`);
    }

    return { errors };
  }

  /**
   * 验证必需内容
   */
  private validateRequired(
    output: string,
    schema: OutputSchema
  ): { errors: string[] } {
    const errors: string[] = [];

    if (schema.required) {
      for (const req of schema.required) {
        if (!output.includes(req)) {
          errors.push(`缺少必需内容: "${req}"`);
        }
      }
    }

    return { errors };
  }

  /**
   * 验证必需模式
   */
  private validatePatterns(
    output: string,
    schema: OutputSchema
  ): { errors: string[] } {
    const errors: string[] = [];

    if (schema.patterns) {
      for (const pattern of schema.patterns) {
        // 重置正则 lastIndex
        const regex = new RegExp(pattern.source, pattern.flags);
        if (!regex.test(output)) {
          errors.push(`不符合必需格式: ${pattern.source}`);
        }
      }
    }

    return { errors };
  }

  /**
   * 验证禁止模式
   */
  private validateForbidden(
    output: string,
    schema: OutputSchema
  ): { errors: string[] } {
    const errors: string[] = [];

    if (schema.forbidden) {
      for (const pattern of schema.forbidden) {
        const regex = new RegExp(pattern.source, pattern.flags);
        if (regex.test(output)) {
          errors.push(`包含禁止内容: ${pattern.source}`);
        }
      }
    }

    return { errors };
  }

  /**
   * 按类型验证
   */
  private validateByType(
    output: string,
    schema: OutputSchema
  ): { errors: string[]; suggestions?: string[] } {
    switch (schema.type) {
      case 'code':
        return this.validateCode(output);
      case 'json':
        return this.validateJson(output);
      case 'markdown':
        return this.validateMarkdown(output);
      default:
        return { errors: [] };
    }
  }

  // ============================================================================
  // SECTION: Type-Specific Validation
  // ============================================================================

  /**
   * 验证 JSON 内容
   * @param json - JSON 字符串
   * @returns 验证结果
   */
  validateJson(json: string): ValidationResult {
    const errors: string[] = [];

    try {
      const parsed = JSON.parse(json);
      // 使用 Zod 进行额外的结构验证
      const result = JsonSchema.safeParse(parsed);
      if (!result.success) {
        errors.push(...result.error.issues.map((e) => e.message));
      }
    } catch (e: unknown) {
      errors.push(`JSON 解析错误: ${e instanceof Error ? e.message : String(e)}`);
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * 验证代码内容
   * @param code - 代码字符串
   * @returns 验证结果
   */
  validateCode(code: string): ValidationResult {
    const errors: string[] = [];
    const suggestions: string[] = [];

    // 使用 Zod 验证代码块结构（如果看起来像代码块）
    if (code.startsWith('```')) {
      const codeBlockResult = this.parseCodeBlock(code);
      if (codeBlockResult) {
        const result = CodeBlockSchema.safeParse(codeBlockResult);
        if (!result.success) {
          errors.push(...result.error.issues.map((e) => e.message));
        }
      }
    }

    // 检查括号匹配
    const bracketErrors = this.validateBrackets(code);
    errors.push(...bracketErrors);

    // 检查语法错误模式
    const syntaxErrors = this.validateSyntaxPatterns(code);
    errors.push(...syntaxErrors);

    // 生成建议
    const codeSuggestions = this.generateCodeSuggestions(code);
    suggestions.push(...codeSuggestions);

    return {
      valid: errors.length === 0,
      errors,
      suggestions: suggestions.length > 0 ? suggestions : undefined,
    };
  }

  /**
   * 验证 Markdown 内容
   * @param markdown - Markdown 字符串
   * @returns 验证结果
   */
  validateMarkdown(markdown: string): ValidationResult {
    const errors: string[] = [];
    const suggestions: string[] = [];

    // 检查标题格式
    const headingPattern = /^(#{1,6})\s+(.+)$/gm;
    let match;
    while ((match = headingPattern.exec(markdown)) !== null) {
      const level = match[1].length;
      const text = match[2].trim();
      const result = MarkdownHeadingSchema.safeParse({ level, text });
      if (!result.success) {
        errors.push(`无效标题: "${match[0]}"`);
      }
    }

    // 检查代码块闭合
    const codeBlockCount = (markdown.match(/```/g) || []).length;
    if (codeBlockCount % 2 !== 0) {
      errors.push('Markdown 代码块未正确闭合');
    }

    // 检查链接格式
    const linkPattern = /\[([^\]]*)\]\(([^)]*)\)/g;
    while ((match = linkPattern.exec(markdown)) !== null) {
      if (!match[1] || !match[2]) {
        errors.push(`无效链接格式: "${match[0]}"`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      suggestions: suggestions.length > 0 ? suggestions : undefined,
    };
  }

  // ============================================================================
  // SECTION: Code Validation Helpers
  // ============================================================================

  /**
   * 解析代码块
   */
  private parseCodeBlock(code: string): { language?: string; content: string } | null {
    const match = code.match(/^```(\w*)\n([\s\S]*?)\n?```$/);
    if (match) {
      return {
        language: match[1] || undefined,
        content: match[2],
      };
    }
    return null;
  }

  /**
   * 验证括号匹配
   */
  private validateBrackets(code: string): string[] {
    const errors: string[] = [];

    // 花括号
    const openBraces = (code.match(/\{/g) || []).length;
    const closeBraces = (code.match(/\}/g) || []).length;
    if (openBraces !== closeBraces) {
      errors.push(`花括号不匹配（开:${openBraces} 闭:${closeBraces}）`);
    }

    // 圆括号
    const openParens = (code.match(/\(/g) || []).length;
    const closeParens = (code.match(/\)/g) || []).length;
    if (openParens !== closeParens) {
      errors.push(`圆括号不匹配（开:${openParens} 闭:${closeParens}）`);
    }

    // 方括号
    const openBrackets = (code.match(/\[/g) || []).length;
    const closeBrackets = (code.match(/\]/g) || []).length;
    if (openBrackets !== closeBrackets) {
      errors.push(`方括号不匹配（开:${openBrackets} 闭:${closeBrackets}）`);
    }

    return errors;
  }

  /**
   * 验证语法错误模式
   */
  private validateSyntaxPatterns(code: string): string[] {
    const errors: string[] = [];

    // 函数名以数字开头
    if (/function\s+\d/.test(code)) {
      errors.push('函数名不能以数字开头');
    }

    // 变量名以数字开头
    if (/(?:let|const|var)\s+\d/.test(code)) {
      errors.push('变量名不能以数字开头');
    }

    // 未闭合的模板字符串
    const backtickCount = (code.match(/`/g) || []).length;
    if (backtickCount % 2 !== 0) {
      errors.push('模板字符串未正确闭合');
    }

    return errors;
  }

  /**
   * 生成代码改进建议
   */
  private generateCodeSuggestions(code: string): string[] {
    const suggestions: string[] = [];

    if (code.includes('console.log') && !code.includes('// TODO')) {
      suggestions.push('建议移除调试用的 console.log');
    }

    if (code.includes('debugger;')) {
      suggestions.push('建议移除 debugger 语句');
    }

    if (code.includes('var ') && !code.includes('// legacy')) {
      suggestions.push('建议使用 let/const 替代 var');
    }

    if (/==[^=]/.test(code) && !/===/.test(code)) {
      suggestions.push('建议使用严格相等运算符 ===');
    }

    return suggestions;
  }
}
