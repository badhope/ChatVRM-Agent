/**
 * Editor 角色 - 编辑者模式
 *
 * 根据 Architect 的方案执行具体的代码修改。
 * 使用快速编码模型，注重执行效率。
 *
 * 学习自 Aider 的 Architect/Editor 双模型分工模式。
 */

import type { Message } from '../types.js';
import { callLLM } from './llm-caller.js';
import type { ReasonerConfig } from './llm-caller.js';
import type { ArchitectResult } from './architect.js';

/** Editor 修改操作 */
export interface EditOperation {
  /** 操作类型 */
  type: 'create' | 'modify' | 'delete';
  /** 目标文件路径 */
  filePath: string;
  /** 操作描述 */
  description: string;
  /** 完整的文件内容（create 时）或修改后的内容（modify 时） */
  content?: string;
  /** 搜索替换对（modify 时使用） */
  searchReplace?: Array<{ search: string; replace: string }>;
}

/** Editor 输出结果 */
export interface EditorResult {
  /** 是否成功 */
  success: boolean;
  /** 修改操作列表 */
  operations: EditOperation[];
  /** 执行摘要 */
  summary: string;
  /** 遇到的问题 */
  issues: string[];
}

/** Editor 系统提示词 */
const EDITOR_SYSTEM_PROMPT = `你是一位高效的代码编辑者。你的职责是：
1. 根据架构师的方案，执行具体的代码修改
2. 确保修改的正确性和完整性
3. 保持代码风格的一致性
4. 处理边界情况和错误

重要规则：
- 严格按照架构师的方案执行修改
- 每个修改都要完整、可执行
- 如果发现方案有问题，在 issues 中指出
- 输出格式必须严格遵循规范

对于每个需要修改的文件，使用以下格式：

### FILE: path/to/file.ts
\`\`\`typescript
// 完整的文件内容
\`\`\`

对于搜索替换操作：

### REPLACE: path/to/file.ts
<<<SEARCH>>>
要搜索的代码
<<<REPLACE>>>
替换后的代码
<<<END>>>

最后输出：
### ISSUES
（列出遇到的问题，如果没有则写"无"）

### SUMMARY
（简要描述完成的修改）`;

/**
 * Editor 执行修改
 * @param architectResult Architect 的分析结果
 * @param config 可选的 LLM 配置（建议使用快速编码模型）
 */
export async function editorExecute(
  architectResult: ArchitectResult,
  config?: ReasonerConfig
): Promise<EditorResult> {
  const userPrompt = `## 架构师方案

### 方案概述
${architectResult.summary}

### 修改计划
${architectResult.plan}

### 需要修改的文件
${architectResult.filesToModify.join(', ')}

### 需要新建的文件
${architectResult.filesToCreate.join(', ')}

### 风险提示
${architectResult.risks.map(r => `- ${r}`).join('\n')}

请根据以上方案，执行具体的代码修改。`;

  const messages: Message[] = [
    { role: 'system', content: EDITOR_SYSTEM_PROMPT },
    { role: 'user', content: userPrompt },
  ];

  const response = await callLLM(messages, {
    temperature: 0.1,  // 极低温度保证代码精确
    maxTokens: 8192,   // 代码输出可能很长
    ...config,
  });

  return parseEditorResponse(response);
}

/**
 * 解析 Editor 的输出为结构化结果
 */
function parseEditorResponse(response: string): EditorResult {
  const result: EditorResult = {
    success: true,
    operations: [],
    summary: '',
    issues: [],
  };

  // 提取 FILE 操作（创建/完整修改）
  const fileRegex = /### FILE:\s*(.+?)\s*\n```[\w]*\n([\s\S]*?)```/g;
  let match: RegExpExecArray | null;
  while ((match = fileRegex.exec(response)) !== null) {
    result.operations.push({
      type: 'create',
      filePath: match[1].trim(),
      description: `创建/覆写 ${match[1].trim()}`,
      content: match[2],
    });
  }

  // 提取 REPLACE 操作（搜索替换）
  const replaceRegex = /### REPLACE:\s*(.+?)\s*\n<<<SEARCH>>>\n([\s\S]*?)<<<REPLACE>>>\n([\s\S]*?)<<<END>>>/g;
  while ((match = replaceRegex.exec(response)) !== null) {
    const m = match;
    const existingOp = result.operations.find(op => op.filePath === m[1].trim());
    if (existingOp && existingOp.type === 'modify') {
      existingOp.searchReplace?.push({ search: m[2], replace: m[3] });
    } else {
      result.operations.push({
        type: 'modify',
        filePath: m[1].trim(),
        description: `修改 ${m[1].trim()}`,
        searchReplace: [{ search: m[2], replace: m[3] }],
      });
    }
  }

  // 提取 ISSUES
  const issuesMatch = response.match(/### ISSUES\s*\n([\s\S]*?)(?=\n### |\n## |$)/);
  if (issuesMatch) {
    const issueText = issuesMatch[1].trim();
    if (issueText && issueText !== '无' && issueText !== 'None') {
      result.issues = issueText.split('\n')
        .filter(line => line.trim().startsWith('-') || line.trim().startsWith('•'))
        .map(line => line.replace(/^[-•]\s*/, '').trim())
        .filter(i => i.length > 0);
    }
    if (result.issues.length > 0) {
      result.success = false;
    }
  }

  // 提取 SUMMARY
  const summaryMatch = response.match(/### SUMMARY\s*\n([\s\S]*?)(?=\n### |\n## |$)/);
  if (summaryMatch) {
    result.summary = summaryMatch[1].trim();
  }

  return result;
}
