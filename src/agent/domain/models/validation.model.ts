/**
 * 输出验证领域模型
 */

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
