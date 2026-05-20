/**
 * 意图识别器
 * 从用户输入中识别任务意图，推荐合适的工具集。
 *
 * 采用混合方案：
 * - 快速正则预分类器处理明确指令（如 /help、/config、显式工具提及）
 * - 可选 LLM 分类器处理模糊输入
 * - 通过 setLLMClassifier() 注入 LLM 分类函数实现渐进式迁移
 */

import { createLogger } from '../services/logger.js';

const logger = createLogger('IntentRecognizer');

/** 意图识别结果 */
export interface IntentResult {
  /** 识别出的意图 */
  intent: string;
  /** 置信度 (0~1) */
  confidence: number;
  /** 建议使用的工具列表 */
  suggestedTools: string[];
  /** 额外元数据 */
  metadata?: Record<string, string>;
}

/** LLM 分类函数签名 */
export type LLMClassifierFn = (input: string) => Promise<IntentResult>;

/** 正则预分类规则 */
interface RegexRule {
  pattern: RegExp;
  intent: string;
  confidence: number;
  suggestedTools: string[];
}

/** 预定义的正则分类规则 */
const REGEX_RULES: RegexRule[] = [
  {
    pattern: /(?:debug|bug|error|issue|fix|修复|调试|错误|问题)/,
    intent: 'bug-hunter',
    confidence: 0.9,
    suggestedTools: ['search_files', 'read_file'],
  },
  {
    pattern: /(?:test|testing|测试|单元|运行测试|unit test|jest|vitest)/,
    intent: 'testing',
    confidence: 0.9,
    suggestedTools: ['shell', 'read_file', 'write_file'],
  },
  {
    pattern: /(?:code review|pr review|代码审查|review|评审|审查代码|审查)/,
    intent: 'code-review',
    confidence: 0.9,
    suggestedTools: ['read_file', 'search_files'],
  },
  {
    pattern: /(?:database|db|sql|mysql|postgres|mongodb|redis|数据库|查询|query)/,
    intent: 'database',
    confidence: 0.9,
    suggestedTools: ['shell', 'read_file'],
  },
  {
    pattern: /(?:security|vulnerability|安全|漏洞|审计|audit)/,
    intent: 'security',
    confidence: 0.9,
    suggestedTools: ['read_file', 'search_files', 'shell'],
  },
  {
    pattern: /(?:deploy|部署|docker|kubernetes|k8s|ci\/cd|ci-cd|cicd)/,
    intent: 'devops',
    confidence: 0.9,
    suggestedTools: ['shell'],
  },
  {
    pattern: /(?:search|find|grep|搜索|查找)/,
    intent: 'search',
    confidence: 0.9,
    suggestedTools: ['search_files', 'read_file'],
  },
  {
    pattern: /(?:refactor|重构|optimize|优化|improve|改进)/,
    intent: 'refactor',
    confidence: 0.85,
    suggestedTools: ['read_file', 'write_file', 'search_files'],
  },
  {
    pattern: /(?:document|doc|readme|文档|说明)/,
    intent: 'documentation',
    confidence: 0.85,
    suggestedTools: ['read_file', 'write_file'],
  },
  {
    pattern: /(?:implement|build|create|develop|新建|构建|创建|实现|component|组件|写|生成|添加)/,
    intent: 'fullstack',
    confidence: 0.85,
    suggestedTools: ['write_file', 'read_file', 'shell'],
  },
];

/**
 * 意图识别器类
 *
 * 支持快速正则预分类和可选的 LLM 分类。
 * 不设置 LLM 分类器时，完全使用正则规则，行为与原实现一致。
 */
export class IntentRecognizer {
  private llmClassifier: LLMClassifierFn | null = null;

  /**
   * 注入 LLM 分类函数
   *
   * 设置后，对于正则无法高置信匹配的输入，将调用 LLM 进行分类。
   *
   * @param fn - LLM 分类函数，接收用户输入，返回意图识别结果
   */
  setLLMClassifier(fn: LLMClassifierFn): void {
    this.llmClassifier = fn;
  }

  /**
   * 识别用户输入的意图
   *
   * @param input - 用户输入文本
   * @returns 意图识别结果
   *
   * 流程：
   * 1. 先用正则规则快速匹配，置信度 >= 0.85 时直接返回
   * 2. 若正则匹配置信度较低或未匹配，且已设置 LLM 分类器，则调用 LLM
   * 3. 否则返回默认的 chat 意图
   */
  async recognize(input: string): Promise<IntentResult> {
    const regexResult = this.classifyWithRegex(input);

    // 高置信度正则匹配，直接返回
    if (regexResult.confidence >= 0.85) {
      return regexResult;
    }

    // 尝试 LLM 分类
    if (this.llmClassifier) {
      try {
        return await this.classifyWithLLM(input);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error({ error }, `LLM 分类失败，回退到正则结果: ${message}`);
      }
    }

    // 回退：正则低置信结果或默认 chat
    return regexResult.confidence > 0.5 ? regexResult : {
      intent: 'chat',
      confidence: 0.5,
      suggestedTools: [],
    };
  }

  /**
   * 使用正则规则进行快速分类
   *
   * @param input - 用户输入文本
   * @returns 正则分类结果
   */
  private classifyWithRegex(input: string): IntentResult {
    const lower = input.toLowerCase();

    // 检查技术栈关键词，提升 fullstack 意图置信度
    const techStackPattern =
      /(?:react|vue|angular|nextjs|nuxt|html|css|js|typescript|node|python|rust|go)/;
    const fileExtPattern = /(?:\.py|\.ts|\.js|\.tsx|\.jsx|\.html|\.css|\.json|\.yaml|\.yml|\.md)/;

    for (const rule of REGEX_RULES) {
      if (rule.pattern.test(lower)) {
        // fullstack 意图额外检查技术栈关键词
        if (rule.intent === 'fullstack' && !techStackPattern.test(lower) && !fileExtPattern.test(lower)) {
          continue;
        }
        return {
          intent: rule.intent,
          confidence: rule.confidence,
          suggestedTools: rule.suggestedTools,
        };
      }
    }

    return { intent: 'chat', confidence: 0.5, suggestedTools: [] };
  }

  /**
   * 使用 LLM 进行意图分类
   *
   * @param input - 用户输入文本
   * @returns LLM 分类结果
   */
  private async classifyWithLLM(input: string): Promise<IntentResult> {
    if (!this.llmClassifier) {
      return { intent: 'chat', confidence: 0.3, suggestedTools: [] };
    }

    return this.llmClassifier(input);
  }

  /**
   * 同步识别用户输入的意图（仅使用正则规则，不调用 LLM）
   *
   * @param input - 用户输入文本
   * @returns 意图识别结果
   */
  recognizeSync(input: string): IntentResult {
    return this.classifyWithRegex(input);
  }
}

/** 全局意图识别器单例 */
export const intentRecognizer = new IntentRecognizer();
