import { z } from 'zod';
import { ConfigSchema } from './schemas.js';
import { createLogger } from '../services/logger.js';

const logger = createLogger('ConfigValidation');

export interface ValidationError {
  path: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  config?: import('./schemas.js').Config;
  errors?: ValidationError[];
}

/**
 * 验证完整的配置对象
 * @param data 待验证的配置数据
 * @returns 验证结果，包含验证后的配置或错误信息
 */
export function validateConfig(data: unknown): ValidationResult {
  const result = ConfigSchema.safeParse(data);
  if (!result.success) {
    const errors = result.error.errors.map(e => ({
      path: e.path.join('.'),
      message: e.message
    }));
    return {
      valid: false,
      errors
    };
  }
  return { valid: true, config: result.data };
}

/**
 * 验证部分配置对象（用于增量更新）
 * @param data 待验证的部分配置数据
 * @returns Zod 安全解析结果
 */
export function validatePartialConfig(data: unknown) {
  return ConfigSchema.partial().safeParse(data);
}

/**
 * 验证并记录错误到控制台
 * @param data 待验证的配置数据
 * @returns 验证结果
 */
export function validateConfigWithLogging(data: unknown): ValidationResult {
  const result = validateConfig(data);
  if (!result.valid && result.errors) {
    logger.error('配置验证失败');
    result.errors.forEach(err => {
      logger.error(`  - ${err.path}: ${err.message}`);
    });
  }
  return result;
}
