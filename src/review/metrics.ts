/**
 * 代码指标接口
 */
export interface CodeMetrics {
  /** 总行数 */
  lines: number;
  /** 代码行数 */
  codeLines: number;
  /** 注释行数 */
  commentLines: number;
  /** 空行数 */
  blankLines: number;
  /** 圈复杂度 */
  complexity: number;
  /** 可维护性指数 (0-100) */
  maintainabilityIndex: number;
  /** Halstead 指标 */
  halstead: {
    /** 操作符数量 */
    operators: number;
    /** 操作数数量 */
    operands: number;
    /** 程序长度 (N) */
    length: number;
    /** 词汇量 (n) */
    vocabulary: number;
    /** 程序体积 (V) */
    volume: number;
    /** 难度 (D) */
    difficulty: number;
    /** 工作量 (E) */
    effort: number;
    /** 预计Bug数 (B) */
    bugs: number;
    /** 预计开发时间 (秒) */
    time: number;
  };
  /** 函数/方法数量 */
  functionCount: number;
  /** 平均函数复杂度 */
  averageComplexity: number;
  /** 最大函数复杂度 */
  maxComplexity: number;
  /** 深度嵌套层级 */
  maxDepth: number;
}

/**
 * 计算代码行数统计
 */
function calculateLineStats(content: string): {
  lines: number;
  codeLines: number;
  commentLines: number;
  blankLines: number;
} {
  const lines = content.split('\n');
  let codeLines = 0;
  let commentLines = 0;
  let blankLines = 0;
  let inBlockComment = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === '') {
      blankLines++;
      continue;
    }
    if (inBlockComment) {
      commentLines++;
      if (trimmed.includes('*/')) inBlockComment = false;
      continue;
    }
    if (trimmed.startsWith('/*')) {
      commentLines++;
      if (!trimmed.includes('*/')) inBlockComment = true;
      continue;
    }
    if (trimmed.startsWith('//') || trimmed.startsWith('#') || trimmed.startsWith('--')) {
      commentLines++;
      continue;
    }
    codeLines++;
  }

  return {
    lines: lines.length,
    codeLines,
    commentLines,
    blankLines,
  };
}

/**
 * 计算深度嵌套层级
 */
function calculateMaxDepth(content: string): number {
  const lines = content.split('\n');
  let maxDepth = 0;
  let currentDepth = 0;

  for (const line of lines) {
    const openBraces = (line.match(/\{/g) || []).length;
    const closeBraces = (line.match(/\}/g) || []).length;
    const openParens = (line.match(/\(/g) || []).length;
    const closeParens = (line.match(/\)/g) || []).length;

    currentDepth += openBraces + openParens - closeBraces - closeParens;
    maxDepth = Math.max(maxDepth, currentDepth);
  }

  return Math.max(0, maxDepth);
}

/**
 * 计算 Halstead 指标（简化估算）
 */
function calculateHalsteadMetrics(content: string): CodeMetrics['halstead'] {
  // 操作符
  const operatorPattern = /[\+\-\*\/\%\=\!\<\>\&\|\^\~\?\:\,\;\.]+/g;
  const operators = content.match(operatorPattern) || [];
  const uniqueOperators = new Set(operators);

  // 操作数（标识符、字符串、数字）
  const operandPattern = /\b[a-zA-Z_]\w*\b|['"`][^'"`]*['"`]|\b\d+\b/g;
  const operands = content.match(operandPattern) || [];
  const uniqueOperands = new Set(operands);

  const n1 = uniqueOperators.size || 1;
  const n2 = uniqueOperands.size || 1;
  const N1 = operators.length || 0;
  const N2 = operands.length || 0;

  const vocabulary = n1 + n2;
  const length = N1 + N2;
  const volume = length * Math.log2(vocabulary || 1);
  const difficulty = (n1 / 2) * (N2 / (n2 || 1));
  const effort = difficulty * volume;
  const bugs = volume / 3000;
  const time = effort / 18;

  return {
    operators: N1,
    operands: N2,
    length,
    vocabulary,
    volume: Math.round(volume * 100) / 100,
    difficulty: Math.round(difficulty * 100) / 100,
    effort: Math.round(effort * 100) / 100,
    bugs: Math.round(bugs * 1000) / 1000,
    time: Math.round(time * 100) / 100,
  };
}

/**
 * 计算可维护性指数
 * MI = 171 - 5.2 * ln(Halstead Volume) - 0.23 * (Cyclomatic Complexity) - 16.2 * ln(Lines of Code)
 */
function calculateMaintainabilityIndex(
  halsteadVolume: number,
  complexity: number,
  linesOfCode: number
): number {
  if (halsteadVolume <= 0 || linesOfCode <= 0) return 100;

  const mi = 171
    - 5.2 * Math.log(halsteadVolume)
    - 0.23 * complexity
    - 16.2 * Math.log(linesOfCode);

  return Math.max(0, Math.min(100, Math.round(mi)));
}

/**
 * 分析代码指标
 * @param content 代码内容
 * @param filePath 文件路径（可选，用于 escomplex 分析）
 * @returns 代码指标统计
 */
export async function calculateMetrics(content: string, filePath?: string): Promise<CodeMetrics> {
  const lineStats = calculateLineStats(content);
  const halstead = calculateHalsteadMetrics(content);
  const maxDepth = calculateMaxDepth(content);

  let complexity = 1;
  let functionCount = 0;
  let averageComplexity = 1;
  let maxComplexity = 1;

  // 尝试使用 escomplex 进行精确分析
  if (filePath && (filePath.endsWith('.js') || filePath.endsWith('.ts') ||
                   filePath.endsWith('.jsx') || filePath.endsWith('.tsx') ||
                   filePath.endsWith('.mjs') || filePath.endsWith('.cjs'))) {
    try {
      // 动态导入 escomplex，避免缺少依赖时崩溃
      const { analyzeModule } = await import('typhonjs-escomplex');
      const report = analyzeModule(content);

      if (report && report.functions && report.functions.length > 0) {
        functionCount = report.functions.length;
        const complexities = report.functions.map((m: { cyclomatic?: number }) => m.cyclomatic || 1);
        maxComplexity = Math.max(...complexities);
        averageComplexity = Math.round(
          (complexities.reduce((a: number, b: number) => a + b, 0) / complexities.length) * 100
        ) / 100;
        complexity = report.aggregate?.cyclomatic || maxComplexity;
      }

      // 如果 escomplex 提供了 Halstead 数据，使用它
      if (report.aggregate?.halstead) {
        const h = report.aggregate.halstead;
        halstead.operators = h.operators?.total || halstead.operators;
        halstead.operands = h.operands?.total || halstead.operands;
        halstead.length = h.length || halstead.length;
        halstead.vocabulary = h.vocabulary || halstead.vocabulary;
        halstead.volume = Math.round((h.volume || halstead.volume) * 100) / 100;
        halstead.difficulty = Math.round((h.difficulty || halstead.difficulty) * 100) / 100;
        halstead.effort = Math.round((h.effort || halstead.effort) * 100) / 100;
        halstead.bugs = Math.round((h.bugs || halstead.bugs) * 1000) / 1000;
        halstead.time = Math.round((h.time || halstead.time) * 100) / 100;
      }
    } catch (error) {
      // escomplex 分析失败，使用备用估算
      // escomplex not available or failed, using fallback estimation
      const complexityKeywords = /\b(if|else|elif|for|while|case|catch|\?\?|&&|\|\||switch|break|continue|return|throw)\b/g;
      const matches = content.match(complexityKeywords);
      complexity = (matches ? matches.length : 0) + 1;

      // 估算函数数量
      const functionMatches = content.match(/\b(function|=>)\b/g);
      functionCount = functionMatches ? functionMatches.length : 1;
      averageComplexity = complexity;
      maxComplexity = complexity;
    }
  } else {
    // 非 JS/TS 文件使用简单估算
    const complexityKeywords = /\b(if|else|elif|for|while|case|catch|\?\?|&&|\|\||switch)\b/g;
    const matches = content.match(complexityKeywords);
    complexity = (matches ? matches.length : 0) + 1;
    functionCount = 1;
    averageComplexity = complexity;
    maxComplexity = complexity;
  }

  const maintainabilityIndex = calculateMaintainabilityIndex(
    halstead.volume,
    complexity,
    lineStats.codeLines
  );

  return {
    ...lineStats,
    complexity,
    maintainabilityIndex,
    halstead,
    functionCount,
    averageComplexity,
    maxComplexity,
    maxDepth,
  };
}
