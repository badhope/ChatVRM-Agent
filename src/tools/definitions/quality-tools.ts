import type { ToolDefinition, ToolResult } from '../registry.js';
import { getErrorMessage } from '../../utils/error-handling.js';

interface QualityMetrics {
  linesOfCode: number;
  commentLines: number;
  blankLines: number;
  cyclomaticComplexity: number;
  maintainabilityIndex: number;
  codeSmells: Array<{ type: string; severity: 'low' | 'medium' | 'high'; line: number; message: string }>;
}

export const codeQualityTool: ToolDefinition = {
  name: 'code_quality',
  description: '分析代码质量并检测坏味道',
  parameters: [
    { name: 'path', type: 'string', description: '代码文件或目录路径', required: true },
    { name: 'language', type: 'string', description: '编程语言', required: false },
  ],
  execute: async (args): Promise<ToolResult> => {
    try {
      const { readFile } = await import('fs/promises');
      const validatedPath = args.path;
      const content = await readFile(validatedPath, 'utf-8');
      const metrics = analyzeCodeQuality(content, args.language || detectLanguage(args.path));

      const output = generateQualityReport(args.path, metrics);
      return { success: true, output };
    } catch (error) {
      return { success: false, output: '', error: `质量分析失败: ${getErrorMessage(error)}` };
    }
  },
};

function detectLanguage(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() || '';
  const languageMap: Record<string, string> = {
    ts: 'typescript',
    tsx: 'typescript',
    js: 'javascript',
    jsx: 'javascript',
    py: 'python',
    java: 'java',
    go: 'go',
    rs: 'rust',
    rb: 'ruby',
    php: 'php',
    cs: 'csharp',
  };
  return languageMap[ext] || 'unknown';
}

function analyzeCodeQuality(content: string, language: string): QualityMetrics {
  const lines = content.split('\n');
  const codeLines = lines.filter(line => line.trim().length > 0 && !isComment(line, language) && !isBlank(line));
  const commentLines = lines.filter(line => isComment(line, language)).length;
  const blankLines = lines.filter(isBlank).length;

  const metrics: QualityMetrics = {
    linesOfCode: codeLines.length,
    commentLines,
    blankLines,
    cyclomaticComplexity: calculateCyclomaticComplexity(content, language),
    maintainabilityIndex: calculateMaintainabilityIndex(codeLines.length, commentLines, lines.length),
    codeSmells: detectCodeSmells(content, language),
  };

  return metrics;
}

function isComment(line: string, language: string): boolean {
  const trimmed = line.trim();
  if (language === 'python') {
    return trimmed.startsWith('#') || trimmed.startsWith('"""') || trimmed.startsWith("'''");
  }
  return trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*');
}

function isBlank(line: string): boolean {
  return line.trim().length === 0;
}

function calculateCyclomaticComplexity(content: string, language: string): number {
  const patterns = [
    /\bif\b/g,
    /\belse\s+if\b/g,
    /\bfor\b/g,
    /\bwhile\b/g,
    /\bcase\b/g,
    /\bcatch\b/g,
    /\?\s*[^:]+\s*:/g,
  ];

  let complexity = 1;
  for (const pattern of patterns) {
    const matches = content.match(pattern);
    if (matches) {
      complexity += matches.length;
    }
  }

  return complexity;
}

function calculateMaintainabilityIndex(loc: number, comments: number, total: number): number {
  if (loc === 0) return 100;

  const commentRatio = comments / total;
  const volume = Math.log(loc) * 2.0;
  const difficulty = 1 - commentRatio;

  const index = 171 - 5.2 * Math.log(loc) - 0.23 * volume - 16.2 * Math.log(loc) * difficulty;
  return Math.max(0, Math.min(100, index));
}

function detectCodeSmells(content: string, language: string): QualityMetrics['codeSmells'] {
  const smells: QualityMetrics['codeSmells'] = [];
  const lines = content.split('\n');

  lines.forEach((line, index) => {
    const trimmed = line.trim();

    if (trimmed.length > 120) {
      smells.push({
        type: 'long_line',
        severity: 'low',
        line: index + 1,
        message: `行过长 (${trimmed.length} 字符)`,
      });
    }

    if (trimmed.match(/^(var|let)\s+\w+\s*=\s*.+/)) {
      smells.push({
        type: 'prefer_const',
        severity: 'low',
        line: index + 1,
        message: '建议使用 const 代替 let/var',
      });
    }

    if (trimmed.match(/\.\.\./g)?.length === 1 && !trimmed.includes('...')) {
      smells.push({
        type: 'console_log',
        severity: 'medium',
        line: index + 1,
        message: '检测到 console.log',
      });
    }
  });

  if (content.match(/\bTODO\b|\bFIXME\b|\bXXX\b|\bHACK\b/)) {
    smells.push({
      type: 'code_markers',
      severity: 'low',
      line: 0,
      message: '代码中包含 TODO/FIXME 等标记',
    });
  }

  return smells;
}

function generateQualityReport(filePath: string, metrics: QualityMetrics): string {
  const grade = calculateGrade(metrics);
  const smellSummary = summarizeSmells(metrics.codeSmells);

  return `
📊 代码质量分析报告: ${filePath}

🏆 总体评分: ${grade}
   - 代码行数: ${metrics.linesOfCode}
   - 注释行数: ${metrics.commentLines}
   - 空行数: ${metrics.blankLines}

📈 复杂度指标:
   - 圈复杂度: ${metrics.cyclomaticComplexity}
   - 可维护性指数: ${metrics.maintainabilityIndex.toFixed(2)}/100

🔍 代码坏味道 (${metrics.codeSmells.length} 个):
${smellSummary}

💡 建议:
${generateSuggestions(metrics)}
`;
}

function calculateGrade(metrics: QualityMetrics): string {
  const score = metrics.maintainabilityIndex;
  if (score >= 90) return '⭐⭐⭐⭐⭐ 优秀';
  if (score >= 75) return '⭐⭐⭐⭐ 良好';
  if (score >= 60) return '⭐⭐⭐ 一般';
  if (score >= 40) return '⭐⭐ 较差';
  return '⭐ 很差';
}

function summarizeSmells(smells: QualityMetrics['codeSmells']): string {
  if (smells.length === 0) return '   ✅ 未检测到明显的代码坏味道';

  const high = smells.filter(s => s.severity === 'high').length;
  const medium = smells.filter(s => s.severity === 'medium').length;
  const low = smells.filter(s => s.severity === 'low').length;

  let summary = `   高严重性: ${high}\n   中严重性: ${medium}\n   低严重性: ${low}\n`;

  const topSmells = smells.slice(0, 5);
  if (topSmells.length > 0) {
    summary += '\n   前5个问题:\n';
    topSmells.forEach(smell => {
      const location = smell.line > 0 ? ` (行 ${smell.line})` : '';
      summary += `   - ${smell.type}${location}: ${smell.message}\n`;
    });
  }

  return summary;
}

function generateSuggestions(metrics: QualityMetrics): string {
  const suggestions: string[] = [];

  if (metrics.linesOfCode > 500) {
    suggestions.push('- 考虑将大文件拆分为更小的模块');
  }

  if (metrics.cyclomaticComplexity > 15) {
    suggestions.push('- 圈复杂度过高，考虑简化条件逻辑');
  }

  if (metrics.maintainabilityIndex < 65) {
    suggestions.push('- 可维护性指数偏低，建议重构');
  }

  if (metrics.commentLines / (metrics.linesOfCode + metrics.commentLines) < 0.1) {
    suggestions.push('- 注释覆盖率偏低，建议添加更多文档注释');
  }

  const longFunctions = metrics.codeSmells.filter(s => s.type === 'long_function').length;
  if (longFunctions > 0) {
    suggestions.push('- 检测到过长的函数，建议拆分');
  }

  if (suggestions.length === 0) {
    suggestions.push('- 代码质量良好，保持当前编码风格');
  }

  return suggestions.map(s => `${s}`).join('\n');
}
