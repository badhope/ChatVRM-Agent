/**
 * 任务复杂度评估
 *
 * 根据任务描述判断复杂度，决定是使用单Agent还是双Agent模式
 */

/**
 * 复杂度等级
 */
export type ComplexityLevel = 'simple' | 'medium' | 'complex';

/**
 * 复杂度评估结果
 */
export interface ComplexityAssessment {
  level: ComplexityLevel;
  score: number; // 0-100
  reason: string;
  recommendedIntent?: string;
}

/**
 * 复杂度关键词和权重
 */
const COMPLEXITY_KEYWORDS = [
  // 高复杂度关键词
  { patterns: ['重构', 'refactor', '重写', 'rewrite'], weight: 30, intent: 'refactor' },
  { patterns: ['架构', 'architecture', '设计', 'design'], weight: 25, intent: 'architect' },
  { patterns: ['集成', 'integration', '整合'], weight: 25, intent: 'fullstack' },
  { patterns: ['多文件', 'multiple files', '批量'], weight: 25, intent: 'fullstack' },
  { patterns: ['测试', 'test', 'testing'], weight: 20, intent: 'test' },
  { patterns: ['文档', 'documentation', 'doc'], weight: 20, intent: 'documentation' },

  // 中复杂度关键词
  { patterns: ['修复', 'fix', 'bug', 'debug'], weight: 15, intent: 'bug-hunter' },
  { patterns: ['实现', 'implement', 'develop'], weight: 15, intent: 'fullstack' },
  { patterns: ['优化', 'optimize', 'improve'], weight: 15, intent: 'refactor' },
  { patterns: ['审查', 'review', 'audit'], weight: 15, intent: 'review' },

  // 低复杂度关键词
  { patterns: ['解释', 'explain', 'what', 'how'], weight: 5, intent: 'general' },
  { patterns: ['搜索', 'search', 'find'], weight: 5, intent: 'search' },
  { patterns: ['读取', 'read', '查看', 'view'], weight: 5, intent: 'search' },
];

/**
 * 简单任务关键词（直接使用单Agent）
 */
const SIMPLE_TASK_PATTERNS = [
  /^hi\s*$/i,
  /^hello\s*$/i,
  /^你好\s*$/i,
  /^谢谢\s*$/i,
  /^thanks\s*$/i,
  /^再见\s*$/i,
  /^bye\s*$/i,
];

/**
 * 评估任务复杂度
 *
 * @param userInput 用户输入
 * @returns 复杂度评估结果
 */
export function assessTaskComplexity(userInput: string): ComplexityAssessment {
  // 检查是否是简单问候等
  for (const pattern of SIMPLE_TASK_PATTERNS) {
    if (pattern.test(userInput.trim())) {
      return {
        level: 'simple',
        score: 0,
        reason: '简单问候或简短对话',
        recommendedIntent: 'general',
      };
    }
  }

  let totalScore = 0;
  let bestIntent = 'general';
  let maxIntentWeight = 0;

  // 分析关键词
  for (const { patterns, weight, intent } of COMPLEXITY_KEYWORDS) {
    for (const pattern of patterns) {
      if (userInput.toLowerCase().includes(pattern.toLowerCase())) {
        totalScore += weight;

        // 找到最可能的意图
        if (weight > maxIntentWeight) {
          maxIntentWeight = weight;
          bestIntent = intent;
        }
        break;
      }
    }
  }

  // 计算复杂度等级
  let level: ComplexityLevel = 'simple';
  let reason = '简单任务';

  if (totalScore >= 40) {
    level = 'complex';
    reason = '包含复杂操作或多步骤任务，建议使用双Agent协作';
  } else if (totalScore >= 20) {
    level = 'medium';
    reason = '中等复杂度任务';
  } else {
    reason = '简单直接的任务';
  }

  return {
    level,
    score: Math.min(100, totalScore),
    reason,
    recommendedIntent: bestIntent,
  };
}

/**
 * 判断是否应该使用双Agent模式
 *
 * @param assessment 复杂度评估结果
 * @param userInput 用户输入
 * @param forceDualAgent 是否强制使用双Agent
 * @returns 是否使用双Agent
 */
export function shouldUseDualAgent(
  assessment: ComplexityAssessment,
  forceDualAgent?: boolean
): boolean {
  if (forceDualAgent) {
    return true;
  }
  return assessment.level === 'complex';
}

export default {
  assessTaskComplexity,
  shouldUseDualAgent,
};
