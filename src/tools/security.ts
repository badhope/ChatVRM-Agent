// 命令白名单
import path from 'path';

export const ALLOWED_SHELL_COMMANDS = [
  'git', 'npm', 'yarn', 'pnpm', 'node', 'npx',
  'ls', 'dir', 'cat', 'type', 'head', 'tail',
  'grep', 'find', 'wc', 'echo', 'pwd', 'cd',
  'mkdir', 'touch', 'cp', 'copy', 'mv', 'move', 'rm', 'del',
  'code', 'vim', 'nano',
  'docker', 'docker-compose', 'kubectl',
  'curl', 'wget',
  'python', 'python3', 'pip',
];

// 危险模式黑名单
export const DANGEROUS_PATTERNS = [
  /rm\s+-rf\s+\//,           // rm -rf /
  />\s*\/dev\/null/,         // 重定向到null
  /curl.*\|\s*(bash|sh)/,    // curl管道到shell
  /wget.*-O-\s*\|/,           // wget管道
  /eval\s*\(/,               // eval
  /exec\s*\(/,               // exec
  /system\s*\(/,             // system
  /\$\(.*\)/,                // 命令替换
  /`.*`/,                    // 反引号命令替换
];

// 敏感路径
export const SENSITIVE_PATHS = [
  /\/etc\/passwd/,
  /\/etc\/shadow/,
  /\/etc\/hosts/,
  /\.ssh\//,
  /\.gnupg\//,
  /\.aws\//,
  /\.env$/,
];

export interface SecurityCheckResult {
  allowed: boolean;
  reason?: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

export function checkShellCommand(command: string): SecurityCheckResult {
  if (!command || typeof command !== 'string') {
    return { allowed: false, reason: '命令为空或格式无效', severity: 'high' };
  }

  if (command.length > 10000) {
    return { allowed: false, reason: '命令过长（超过10000字符）', severity: 'medium' };
  }
  
  const trimmed = command.trim();
  if (!trimmed) {
    return { allowed: false, reason: '命令为空', severity: 'high' };
  }

  const mainCmd = trimmed.split(/\s+/)[0].toLowerCase();
  
  // 3. 检查白名单
  if (!ALLOWED_SHELL_COMMANDS.includes(mainCmd)) {
    return { 
      allowed: false, 
      reason: `命令 "${mainCmd}" 不在白名单中`, 
      severity: 'medium' 
    };
  }
  
  // 4. 检查危险模式
  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(trimmed)) {
      return { 
        allowed: false, 
        reason: `检测到危险命令模式: ${pattern.source}`, 
        severity: 'critical' 
      };
    }
  }
  
  // 5. 检查敏感路径
  for (const path of SENSITIVE_PATHS) {
    if (path.test(trimmed)) {
      return { 
        allowed: false, 
        reason: '命令涉及敏感系统路径', 
        severity: 'high' 
      };
    }
  }
  
  return { allowed: true, severity: 'low' };
}

export function sanitizeShellCommand(command: string): string {
  // 移除潜在的注入字符
  return command
    .replace(/[;&|`$]/g, '')  // 移除命令分隔符和替换符
    .trim();
}

// 路径验证函数，防止目录遍历攻击
export function validatePath(filePath: string): string {
  // 解析为绝对路径
  const resolved = path.resolve(filePath);

  // 阻止包含敏感系统路径的访问
  const sensitivePatterns = [
    /\/etc\/passwd$/,
    /\/etc\/shadow$/,
    /\/etc\/hosts$/,
    /\.ssh\//,
    /\.gnupg\//,
    /\.aws\//,
    /\.env$/,
  ];

  for (const pattern of sensitivePatterns) {
    if (pattern.test(resolved)) {
      throw new Error(`访问被拒绝: 路径涉及敏感系统文件`);
    }
  }

  return resolved;
}
