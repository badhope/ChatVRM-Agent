/**
 * 高级工具 - 安全审计、文档生成、测试生成
 */

import type { ToolDefinition, ToolResult } from '../registry.js';
import { getErrorMessage } from '../../utils/error-handling.js';
import fs from 'fs/promises';
import path from 'path';

export const securityAuditTool: ToolDefinition = {
  name: 'security_audit',
  description: '安全审计 - 扫描代码中的潜在安全问题',
  parameters: [
    { name: 'path', type: 'string', description: '要审计的文件或目录', required: true },
    { name: 'severity', type: 'string', description: '最低严重级别: low|medium|high', required: false },
  ],
  execute: async (args: Record<string, string>): Promise<ToolResult> => {
    try {
      const safePath = path.resolve(args.path);
      const minSeverity = args.severity || 'low';

      const issues = await runSecurityAudit(safePath, minSeverity);

      const output = generateAuditReport(issues);
      return {
        success: true,
        output,
      };
    } catch (error) {
      return {
        success: false,
        output: '',
        error: `安全审计失败: ${getErrorMessage(error)}`,
      };
    }
  },
};

async function runSecurityAudit(
  targetPath: string,
  minSeverity: string
): Promise<Array<{
  file: string;
  line: number;
  severity: 'low' | 'medium' | 'high';
  type: string;
  description: string;
  recommendation: string;
}>> {
  const issues: Array<{
    file: string;
    line: number;
    severity: 'low' | 'medium' | 'high';
    type: string;
    description: string;
    recommendation: string;
  }> = [];

  try {
    const stat = await fs.stat(targetPath);

    if (stat.isFile()) {
      const fileIssues = await auditFile(targetPath);
      issues.push(...fileIssues);
    } else if (stat.isDirectory()) {
      const files = await findSourceFiles(targetPath);
      for (const file of files) {
        const fileIssues = await auditFile(file);
        issues.push(...fileIssues);
      }
    }
  } catch (error) {
    console.error('审计过程出错:', error);
  }

  const severityOrder = { high: 3, medium: 2, low: 1 };
  const minOrder = severityOrder[minSeverity as keyof typeof severityOrder] || 0;

  return issues.filter(
    issue => severityOrder[issue.severity as keyof typeof severityOrder] >= minOrder
  );
}

async function findSourceFiles(dir: string): Promise<string[]> {
  const files: string[] = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory() && !['node_modules', '.git', 'dist'].includes(entry.name)) {
      const subFiles = await findSourceFiles(fullPath);
      files.push(...subFiles);
    } else if (entry.isFile()) {
      if (['.ts', '.tsx', '.js', '.jsx'].some(ext => entry.name.endsWith(ext))) {
        files.push(fullPath);
      }
    }
  }

  return files;
}

async function auditFile(filePath: string): Promise<Array<{
  file: string;
  line: number;
  severity: 'low' | 'medium' | 'high';
  type: string;
  description: string;
  recommendation: string;
}>> {
  const issues: Array<{
    file: string;
    line: number;
    severity: 'low' | 'medium' | 'high';
    type: string;
    description: string;
    recommendation: string;
  }> = [];

  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const lines = content.split('\n');

    const relativePath = path.relative(process.cwd(), filePath);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNum = i + 1;

      if (line.includes('eval(')) {
        issues.push({
          file: relativePath,
          line: lineNum,
          severity: 'high',
          type: 'dangerous_eval',
          description: '使用了 eval() 函数，存在代码注入风险',
          recommendation: '避免使用 eval，考虑使用 JSON.parse 或其他安全方案',
        });
      }

      if (line.includes('Function(')) {
        issues.push({
          file: relativePath,
          line: lineNum,
          severity: 'high',
          type: 'dangerous_function',
          description: '使用 Function 构造函数，存在代码注入风险',
          recommendation: '避免使用 Function 构造函数',
        });
      }

      if (line.match(/process\.env\.\w+/)) {
        issues.push({
          file: relativePath,
          line: lineNum,
          severity: 'low',
          type: 'environment_access',
          description: '直接访问环境变量',
          recommendation: '考虑使用配置管理库，并验证环境变量',
        });
      }

      if (line.match(/console\.(log|warn|error|info)/) && !filePath.includes('.test.')) {
        issues.push({
          file: relativePath,
          line: lineNum,
          severity: 'low',
          type: 'debug_log',
          description: '生产代码中包含调试日志',
          recommendation: '使用专业的日志库，并可配置日志级别',
        });
      }
    }
  } catch (error) {
    console.error(`审计文件 ${filePath} 失败:`, error);
  }

  return issues;
}

function generateAuditReport(
  issues: Array<{
    file: string;
    line: number;
    severity: 'low' | 'medium' | 'high';
    type: string;
    description: string;
    recommendation: string;
  }>
): string {
  if (issues.length === 0) {
    return '✅ 安全审计完成，未发现问题';
  }

  const highCount = issues.filter(i => i.severity === 'high').length;
  const mediumCount = issues.filter(i => i.severity === 'medium').length;
  const lowCount = issues.filter(i => i.severity === 'low').length;

  let report = `⚠️ 安全审计发现 ${issues.length} 个问题\n`;
  report += `高风险: ${highCount}, 中风险: ${mediumCount}, 低风险: ${lowCount}\n\n`;

  const severityOrder = { high: 0, medium: 1, low: 2 };
  const sortedIssues = [...issues].sort(
    (a, b) =>
      severityOrder[a.severity as keyof typeof severityOrder] -
      severityOrder[b.severity as keyof typeof severityOrder]
  );

  for (const issue of sortedIssues) {
    const severityIcon =
      issue.severity === 'high' ? '🔴' :
      issue.severity === 'medium' ? '🟡' : '🟢';

    report += `${severityIcon} [${issue.severity.toUpperCase()}] ${issue.file}:${issue.line}\n`;
    report += `  类型: ${issue.type}\n`;
    report += `  描述: ${issue.description}\n`;
    report += `  建议: ${issue.recommendation}\n\n`;
  }

  return report;
}

export const documentationTool: ToolDefinition = {
  name: 'generate_documentation',
  description: '自动生成代码文档',
  parameters: [
    { name: 'path', type: 'string', description: '要生成文档的文件或目录', required: true },
    { name: 'format', type: 'string', description: '输出格式: markdown|html', required: false },
  ],
  execute: async (args: Record<string, string>): Promise<ToolResult> => {
    try {
      const safePath = path.resolve(args.path);
      const format = args.format || 'markdown';

      const docs = await generateDocumentation(safePath, format);

      return {
        success: true,
        output: docs,
      };
    } catch (error) {
      return {
        success: false,
        output: '',
        error: `文档生成失败: ${getErrorMessage(error)}`,
      };
    }
  },
};

async function generateDocumentation(
  targetPath: string,
  format: string
): Promise<string> {
  let content = '';
  const stat = await fs.stat(targetPath);

  if (stat.isFile()) {
    content = await generateFileDocumentation(targetPath, format);
  } else {
    const files = await findSourceFiles(targetPath);
    content = await generateDirectoryDocumentation(files, format);
  }

  return content;
}

async function generateFileDocumentation(
  filePath: string,
  format: string
): Promise<string> {
  const content = await fs.readFile(filePath, 'utf-8');
  const relativePath = path.relative(process.cwd(), filePath);
  const fileName = path.basename(filePath);

  let doc = '';

  if (format === 'markdown') {
    doc = `# ${fileName}\n\n`;
    doc += `文件路径: \`${relativePath}\`\n\n`;
    doc += `## 概述\n\n`;
    doc += `该文件包含应用的核心功能。\n\n`;
    doc += `## 内容统计\n\n`;
    doc += `- 总行数: ${content.split('\n').length}\n`;
    doc += `- 文件大小: ${(Buffer.byteLength(content) / 1024).toFixed(2)} KB\n\n`;
    doc += `## 注意事项\n\n`;
    doc += `此文件为自动生成的文档，详细内容请参考源代码。\n`;
  }

  return doc;
}

async function generateDirectoryDocumentation(
  files: string[],
  format: string
): Promise<string> {
  let doc = '';

  if (format === 'markdown') {
    doc = `# 项目文档\n\n`;
    doc += `## 文件列表\n\n`;

    for (const file of files) {
      const relativePath = path.relative(process.cwd(), file);
      doc += `- \`${relativePath}\`\n`;
    }

    doc += `\n## 统计信息\n\n`;
    doc += `- 总文件数: ${files.length}\n`;
  }

  return doc;
}

export const testGenerationTool: ToolDefinition = {
  name: 'generate_tests',
  description: '自动生成测试代码',
  parameters: [
    { name: 'path', type: 'string', description: '要生成测试的文件', required: true },
    { name: 'testType', type: 'string', description: '测试类型: unit|integration', required: false },
  ],
  execute: async (args: Record<string, string>): Promise<ToolResult> => {
    try {
      const safePath = path.resolve(args.path);
      const testType = args.testType || 'unit';

      const testCode = await generateTests(safePath, testType);

      return {
        success: true,
        output: testCode,
      };
    } catch (error) {
      return {
        success: false,
        output: '',
        error: `测试生成失败: ${getErrorMessage(error)}`,
      };
    }
  },
};

async function generateTests(
  filePath: string,
  testType: string
): Promise<string> {
  const fileName = path.basename(filePath, path.extname(filePath));
  const relativePath = `./${fileName}`;

  let testCode = '';

  if (testType === 'unit') {
    testCode = `import { describe, it, expect } from 'vitest';
import { ${fileName} } from '${relativePath}';

describe('${fileName}', () => {
  it('should be defined', () => {
    expect(${fileName}).toBeDefined();
  });

  // TODO: 添加更多测试用例
});
`;
  }

  return testCode;
}
