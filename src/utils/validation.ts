/**
 * 格式化错误响应
 * @param message 错误消息
 * @param error 可选的错误对象
 * @returns 包含错误信息的对象
 */
export function formatError<T = unknown>(message: string, error?: T): { success: false; error: string; details: string } {
  return {
    success: false,
    error: message,
    details: (error as { message?: string } | undefined)?.message || String(error ?? '')
  };
}

/**
 * 格式化成功响应
 * @param data 响应数据
 * @returns 包含成功状态和数据的对象
 */
export function formatSuccess<T extends Record<string, unknown>>(data: T): { success: true } & T {
  return {
    success: true,
    ...data
  };
}

/**
 * 验证模式接口
 */
export interface ValidationSchema {
  type: string;
  required?: boolean;
  default?: unknown;
  min?: number;
  max?: number;
  enum?: string[];
  pattern?: RegExp | string;
  match?: RegExp | string;
}

/**
 * 验证参数
 * @param params 待验证的参数
 * @param schema 验证模式
 * @returns 验证结果
 */
export function validateParams<T extends Record<string, unknown>>(
  params: Record<string, unknown>,
  schema: Record<string, ValidationSchema>
): { valid: boolean; errors: string[]; data: T } {
  const errors: string[] = [];
  const data: Record<string, unknown> = {};

  for (const [key, rules] of Object.entries(schema)) {
    const value = params[key];

    if (rules.required && (value === undefined || value === null || value === '')) {
      errors.push(`Missing required parameter: ${key}`);
      continue;
    }

    if (value !== undefined && value !== null && value !== '') {
      const actualType = Array.isArray(value) ? 'array' : typeof value;
      if (actualType !== rules.type) {
        errors.push(`Parameter ${key} should be ${rules.type}, got ${actualType}`);
        continue;
      }

      if (rules.type === 'number' && typeof value === 'number') {
        if (rules.min !== undefined && value < rules.min) {
          errors.push(`Parameter ${key} must be >= ${rules.min}`);
          continue;
        }
        if (rules.max !== undefined && value > rules.max) {
          errors.push(`Parameter ${key} must be <= ${rules.max}`);
          continue;
        }
      }

      if (rules.type === 'string' && rules.enum && !rules.enum.includes(value as string)) {
        errors.push(`Parameter ${key} must be one of: ${rules.enum.join(', ')}`);
        continue;
      }

      data[key] = value;
    } else if (rules.default !== undefined) {
      data[key] = rules.default;
    }
  }

  return { valid: errors.length === 0, errors, data: data as T };
}
