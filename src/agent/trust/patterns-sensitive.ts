/**
 * 敏感信息和系统权限模式
 */

import { TrustLevel } from '../trust-types.js';
import { DetectionPattern, SeverityLevel } from './types.js';

/**
 * 敏感信息模式
 */
export const SENSITIVE_PATTERNS: DetectionPattern[] = [
  {
    pattern: /password\s*[:=]\s*['"][^'"]+['"]/i,
    type: 'sensitive',
    level: TrustLevel.RequireConfirmation,
    severity: 'high' as SeverityLevel,
    description: '密码硬编码',
  },
  {
    pattern: /密码\s*[:=]\s*['"][^'"]+['"]/,
    type: 'sensitive',
    level: TrustLevel.RequireConfirmation,
    severity: 'high' as SeverityLevel,
    description: '密码硬编码（中文）',
  },
  {
    pattern: /api[_-]?key\s*[:=]\s*['"][^'"]+['"]/i,
    type: 'sensitive',
    level: TrustLevel.RequireConfirmation,
    severity: 'high' as SeverityLevel,
    description: 'API Key 硬编码',
  },
  {
    pattern: /secret[_-]?key\s*[:=]\s*['"][^'"]+['"]/i,
    type: 'sensitive',
    level: TrustLevel.RequireConfirmation,
    severity: 'high' as SeverityLevel,
    description: 'Secret Key 硬编码',
  },
  {
    pattern: /token\s*[:=]\s*['"][^'"]+['"]/i,
    type: 'sensitive',
    level: TrustLevel.RequireConfirmation,
    severity: 'medium' as SeverityLevel,
    description: 'Token 硬编码',
  },
  {
    pattern: /private[_-]?key\s*[:=]\s*['"][^'"]+['"]/i,
    type: 'sensitive',
    level: TrustLevel.RequireConfirmation,
    severity: 'high' as SeverityLevel,
    description: '私钥硬编码',
  },
];

/**
 * 系统权限模式
 */
export const SYSTEM_PATTERNS: DetectionPattern[] = [
  {
    pattern: /sudo\s+/,
    type: 'dangerous',
    level: TrustLevel.RequireConfirmation,
    severity: 'high' as SeverityLevel,
    description: '需要管理员权限',
  },
  {
    pattern: /chmod\s+777/,
    type: 'dangerous',
    level: TrustLevel.RequireConfirmation,
    severity: 'medium' as SeverityLevel,
    description: '开放所有权限',
  },
  {
    pattern: /chown\s+.*root/,
    type: 'dangerous',
    level: TrustLevel.RequireConfirmation,
    severity: 'medium' as SeverityLevel,
    description: '更改文件所有者为 root',
  },
];
