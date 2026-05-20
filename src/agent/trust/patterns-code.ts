/**
 * 代码和数据库危险操作模式
 */

import { TrustLevel } from '../trust-types.js';
import { DetectionPattern, SeverityLevel } from './types.js';

/**
 * 代码危险操作模式
 */
export const CODE_PATTERNS: DetectionPattern[] = [
  {
    pattern: /\beval\s*\(/,
    type: 'dangerous',
    level: TrustLevel.RequireConfirmation,
    severity: 'high' as SeverityLevel,
    description: '使用 eval() 动态执行代码',
    ignoreInTest: true,
  },
  {
    pattern: /new\s+Function\s*\(/,
    type: 'dangerous',
    level: TrustLevel.RequireConfirmation,
    severity: 'high' as SeverityLevel,
    description: '使用 Function 构造函数',
    ignoreInTest: true,
  },
  {
    pattern: /vm\.runInNewContext\s*\(/,
    type: 'dangerous',
    level: TrustLevel.RequireConfirmation,
    severity: 'high' as SeverityLevel,
    description: '在 VM 中执行代码',
    ignoreInTest: true,
  },
  {
    pattern: /child_process.*exec\s*\(/,
    type: 'dangerous',
    level: TrustLevel.RequireConfirmation,
    severity: 'high' as SeverityLevel,
    description: '执行子进程命令',
    ignoreInTest: true,
  },
  {
    pattern: /require\s*\(\s*['"]child_process['"]\s*\)/,
    type: 'dangerous',
    level: TrustLevel.RequireConfirmation,
    severity: 'medium' as SeverityLevel,
    description: '引入子进程模块',
  },
];

/**
 * 数据库危险操作模式
 */
export const DATABASE_PATTERNS: DetectionPattern[] = [
  {
    pattern: /DROP\s+TABLE/i,
    type: 'destructive',
    level: TrustLevel.RequireConfirmation,
    severity: 'critical' as SeverityLevel,
    description: '删除数据库表',
  },
  {
    pattern: /DROP\s+DATABASE/i,
    type: 'destructive',
    level: TrustLevel.RequireConfirmation,
    severity: 'critical' as SeverityLevel,
    description: '删除数据库',
  },
  {
    pattern: /TRUNCATE\s+TABLE/i,
    type: 'destructive',
    level: TrustLevel.RequireConfirmation,
    severity: 'critical' as SeverityLevel,
    description: '清空数据库表',
  },
  {
    pattern: /DELETE\s+FROM\s+\w+\s*$/i,
    type: 'destructive',
    level: TrustLevel.RequireConfirmation,
    severity: 'critical' as SeverityLevel,
    description: '无 WHERE 条件的删除（可能删除全表）',
  },
  {
    pattern: /DELETE\s+FROM\s+\w+\s*;/i,
    type: 'destructive',
    level: TrustLevel.RequireConfirmation,
    severity: 'critical' as SeverityLevel,
    description: '无 WHERE 条件的删除语句',
  },
  {
    pattern: /ALTER\s+TABLE.*DROP\s+COLUMN/i,
    type: 'destructive',
    level: TrustLevel.RequireConfirmation,
    severity: 'high' as SeverityLevel,
    description: '删除数据库列',
  },
  {
    pattern: /GRANT\s+ALL/i,
    type: 'dangerous',
    level: TrustLevel.RequireConfirmation,
    severity: 'high' as SeverityLevel,
    description: '授予所有权限',
  },
];
