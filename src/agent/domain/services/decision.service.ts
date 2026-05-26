/**
 * 决策领域服务
 * 纯业务逻辑，无基础设施依赖
 */

import type {
  Decision,
  ImprovementSuggestion,
  DecisionStats,
} from '../models/decision.model.js';

export interface DecisionAnalysisResult {
  successes: string[];
  failures: string[];
  improvements: ImprovementSuggestion[];
}

export class DecisionService {
  static analyzeDecisions(decisions: Decision[]): DecisionAnalysisResult {
    const successes: string[] = [];
    const failures: string[] = [];
    const improvements: ImprovementSuggestion[] = [];

    for (const decision of decisions) {
      if (decision.outcome) {
        if (decision.outcome.success) {
          successes.push(`成功: ${decision.description}`);
        } else {
          failures.push(`失败: ${decision.description} - ${decision.outcome.gapAnalysis || 'unknown'}`);
          improvements.push({
            priority: 'high',
            description: `决策 "${decision.description}" 未达到预期结果`,
            recommendation: this.generateRecommendation(decision),
          });
        }
      }
    }
    return { successes, failures, improvements };
  }

  static generateRecommendation(decision: Decision): string {
    if (!decision.outcome) return '监控决策执行结果以评估有效性';
    const issues: string[] = [];
    if (decision.confidence < 0.7) issues.push('提高决策前的信息收集质量');
    if (decision.alternatives.length < 3) issues.push('考虑更多备选方案');
    if (decision.outcome.gapAnalysis) issues.push(`解决: ${decision.outcome.gapAnalysis}`);
    return issues.length === 0 ? '决策执行良好，保持当前流程' : `建议改进: ${issues.join('; ')}`;
  }

  static inferCategory(decision: Decision): string {
    const keywords = decision.description.toLowerCase();
    if (keywords.includes('tool') || keywords.includes('工具')) return 'tool';
    if (keywords.includes('skill') || keywords.includes('技能')) return 'skill';
    if (keywords.includes('workflow') || keywords.includes('流程')) return 'workflow';
    if (keywords.includes('process') || keywords.includes('过程')) return 'process';
    return 'other';
  }

  static calculateOverallRating(
    decisions: Decision[],
    successes: string[],
    failures: string[]
  ): number {
    if (decisions.length === 0) return 0;
    const avgConfidence = decisions.reduce((sum, d) => sum + d.confidence, 0) / decisions.length;
    const successRatio = successes.length / (successes.length + failures.length || 1);
    const outcomeScore =
      decisions.reduce((sum, d) => sum + (d.outcome?.success ? 1 : 0.5), 0) / decisions.length;
    return Math.round((avgConfidence * 0.3 + successRatio * 0.4 + outcomeScore * 0.3) * 10) / 10;
  }

  static calculateStats(decisions: Decision[]): DecisionStats {
    const completed = decisions.filter((d) => d.outcome !== undefined);
    const successful = completed.filter((d) => d.outcome?.success ?? false);
    const categoryCounts: Record<string, number> = {};

    for (const decision of decisions) {
      const category = this.inferCategory(decision);
      categoryCounts[category] = (categoryCounts[category] || 0) + 1;
    }

    const topPatterns = Object.entries(categoryCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([pattern, count]) => ({ pattern, count }));

    return {
      totalDecisions: decisions.length,
      successRate: completed.length > 0 ? successful.length / completed.length : 0,
      averageConfidence:
        decisions.length > 0
          ? decisions.reduce((sum, d) => sum + d.confidence, 0) / decisions.length
          : 0,
      topPatterns,
      improvementOpportunities: decisions.filter(
        (d) => d.outcome?.success === false || d.confidence < 0.7
      ).length,
      mostCommonCategories: Object.entries(categoryCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([cat]) => cat),
    };
  }

  static generateImprovementReport(
    stats: DecisionStats,
    reflections: Array<{ improvements: ImprovementSuggestion[] }>
  ): string {
    const highPriorityImprovements: ImprovementSuggestion[] = [];
    for (const reflection of reflections) {
      highPriorityImprovements.push(
        ...reflection.improvements.filter((i) => i.priority === 'high')
      );
    }
    highPriorityImprovements.sort((a, b) => {
      const aImpact = a.estimatedImpact ?? 0.5;
      const bImpact = b.estimatedImpact ?? 0.5;
      return bImpact - aImpact;
    });

    let report = `# 决策改进报告\n\n`;
    report += `## 概览统计\n\n`;
    report += `- 总决策数: ${stats.totalDecisions}\n`;
    report += `- 平均置信度: ${stats.averageConfidence.toFixed(2)}\n`;
    report += `- 成功率: ${(stats.successRate * 100).toFixed(1)}%\n\n`;
    report += `## 高频决策类别\n\n`;
    for (const cat of stats.mostCommonCategories || []) report += `- ${cat}\n`;
    report += `\n## 高优先级改进建议\n\n`;
    for (const improvement of highPriorityImprovements.slice(0, 5)) {
      report += `### ${improvement.description}\n`;
      report += `- 建议: ${improvement.recommendation}\n\n`;
    }
    return report;
  }

  static learnFromDecisions(decisions: Decision[]): string[] {
    const lessons: string[] = [];
    for (const decision of decisions) {
      if (decision.outcome) {
        if (decision.outcome.success) {
          lessons.push(`✅ 成功经验: ${decision.rationale}`);
        } else {
          lessons.push(`❌ 改进方向: ${decision.outcome.lessonsLearned?.join('; ') || 'unknown'}`);
        }
      }
    }
    return lessons;
  }

  static createDecision(
    taskId: string,
    description: string,
    context: Record<string, unknown>,
    alternatives: Decision['alternatives'],
    chosenAlternativeId: string,
    rationale: string,
    confidence: number
  ): Decision {
    return {
      id: `decision-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      taskId,
      description,
      context,
      alternatives,
      chosenAlternative: chosenAlternativeId,
      rationale,
      confidence: Math.min(1, Math.max(0, confidence)),
      timestamp: new Date(),
    };
  }
}
