/**
 * 文件系统和网络危险操作模式
 */

import { TrustLevel } from '../trust-types.js';
import { DetectionPattern, SeverityLevel } from './types.js';

/**
 * 文件系统危险操作模式
 */
export const FILE_SYSTEM_PATTERNS: DetectionPattern[] = [
  {
    pattern: /rm\s+-rf\s+\//,
    type: 'destructive',
    level: TrustLevel.RequireConfirmation,
    severity: 'critical' as SeverityLevel,
    description: '递归强制删除根目录',
  },
  {
    pattern: /rm\s+-rf/,
    type: 'destructive',
    level: TrustLevel.RequireConfirmation,
    severity: 'critical' as SeverityLevel,
    description: '递归强制删除',
    ignoreInTest: true,
  },
  {
    pattern: /del\s+\/[sfq]/i,
    type: 'destructive',
    level: TrustLevel.RequireConfirmation,
    severity: 'high' as SeverityLevel,
    description: 'Windows 强制删除命令',
  },
  {
    pattern: /rmdir\s+\/s/i,
    type: 'destructive',
    level: TrustLevel.RequireConfirmation,
    severity: 'high' as SeverityLevel,
    description: 'Windows 递归删除目录',
  },
  {
    pattern: /format\s+[a-z]:/i,
    type: 'destructive',
    level: TrustLevel.RequireConfirmation,
    severity: 'critical' as SeverityLevel,
    description: '格式化磁盘',
  },
  {
    pattern: /mkfs\b/,
    type: 'destructive',
    level: TrustLevel.RequireConfirmation,
    severity: 'critical' as SeverityLevel,
    description: '创建文件系统（可能覆盖数据）',
  },
  {
    pattern: /dd\s+if=/i,
    type: 'dangerous',
    level: TrustLevel.RequireConfirmation,
    severity: 'high' as SeverityLevel,
    description: 'dd 磁盘写入操作',
  },
  {
    pattern: />\s*\/dev\//,
    type: 'dangerous',
    level: TrustLevel.RequireConfirmation,
    severity: 'high' as SeverityLevel,
    description: '重定向到设备文件',
  },
];

/**
 * 网络危险操作模式
 */
export const NETWORK_PATTERNS: DetectionPattern[] = [
  {
    pattern: /curl.*\|\s*(bash|sh)/i,
    type: 'dangerous',
    level: TrustLevel.RequireConfirmation,
    severity: 'critical' as SeverityLevel,
    description: '远程脚本执行',
  },
  {
    pattern: /wget.*\|\s*(bash|sh)/i,
    type: 'dangerous',
    level: TrustLevel.RequireConfirmation,
    severity: 'critical' as SeverityLevel,
    description: '远程脚本执行（wget）',
  },
  {
    pattern: /curl\s+.*\b(?:pastebin|gist\.github|ngrok)\b/i,
    type: 'dangerous',
    level: TrustLevel.RequireConfirmation,
    severity: 'high' as SeverityLevel,
    description: '从可疑域名获取内容',
  },
  {
    pattern: /nc\s+-l/i,
    type: 'dangerous',
    level: TrustLevel.RequireConfirmation,
    severity: 'high' as SeverityLevel,
    description: '开启网络监听',
  },
  {
    pattern: /ssh\s+-R/i,
    type: 'dangerous',
    level: TrustLevel.RequireConfirmation,
    severity: 'medium' as SeverityLevel,
    description: 'SSH 反向隧道',
  },
];
