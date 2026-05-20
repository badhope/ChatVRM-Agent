import path from 'path';
import type { ReviewIssue } from './types.js';
import { createProvider } from '../providers/index.js';
import { configManager } from '../config/manager.js';
import { createLogger } from '../services/logger.js';

const logger = createLogger('ai-review');

// ============================================================
// AI驱动的深度代码审查
// ============================================================

/**
 * AI驱动的深度代码审查
 * @param content 代码内容
 * @param filePath 文件路径
 * @param categories 审查类别
 * @returns AI检测到的问题列表
 */
export async function aiReview(content: string, filePath: string, categories: string[]): Promise<ReviewIssue[]> {
  await configManager.init();

  const defaultProvider = configManager.getDefaultProvider();
  if (!defaultProvider) return [];

  const providerConfig = configManager.getProviderConfig(defaultProvider);
  if (!providerConfig.apiKey) return [];

  const provider = createProvider(defaultProvider, {
    apiKey: providerConfig.apiKey,
    baseUrl: providerConfig.baseUrl,
    timeout: 60000,
    maxRetries: 1,
  });

  const categoryPrompts: Record<string, string> = {
    quality: '代码质量：命名规范、代码结构、可读性、设计模式、SOLID原则',
    bugs: 'Bug检测：空指针、边界条件、类型错误、逻辑错误、资源泄漏',
    performance: '性能优化：算法复杂度、内存泄漏、不必要的计算、缓存策略',
    security: '安全审计：注入攻击、XSS、CSRF、敏感信息泄露、权限问题',
  };

  const selectedCategories = categories.length > 0 ? categories : ['quality', 'bugs', 'performance', 'security'];
  const reviewFocus = selectedCategories.map(c => categoryPrompts[c] || c).join('、');

  const maxCodeLength = 8000;
  const codeForReview = content.length > maxCodeLength
    ? content.slice(0, maxCodeLength) + '\n\n// ... (代码过长，已截断)'
    : content;

  const ext = path.extname(filePath).slice(1);

  const prompt = `你是一个专业的代码审查专家。请审查以下${ext}代码文件。

审查重点：${reviewFocus}

文件路径：${filePath}

请以JSON数组格式输出审查结果，每个问题包含以下字段：
- ruleId: 规则ID（如 QUAL001, BUG001, PERF001, SEC001）
- message: 问题描述
- severity: 严重程度（error/warning/info）
- category: 类别（quality/bugs/performance/security）
- line: 行号（如果知道的话）
- suggestion: 修复建议

只输出JSON数组，不要其他内容。如果没有发现问题，输出空数组 []。

代码：
\`\`\`${ext}
${codeForReview}
\`\`\``;

  const MAX_RETRIES = 3;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const response = await provider.chat({
        messages: [
          { role: 'system', content: '你是一个代码审查专家，只输出JSON格式的审查结果。' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.3,
        maxTokens: 4096,
      });

      const jsonMatch = response.content.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const issues = JSON.parse(jsonMatch[0]) as ReviewIssue[];
        return issues.map(issue => ({
          ...issue,
          severity: ['error', 'warning', 'info'].includes(issue.severity) ? issue.severity : 'info' as const,
          category: ['quality', 'bugs', 'performance', 'security'].includes(issue.category) ? issue.category : 'quality' as const,
        }));
      }
      return [];
    } catch (error) {
      if (attempt === MAX_RETRIES - 1) {
        logger.warn({ error: error instanceof Error ? error.message : String(error) }, 'AI review failed after retries');
        return [];
      }
      // 指数退避等待
      await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt)));
    }
  }

  return [];
}
