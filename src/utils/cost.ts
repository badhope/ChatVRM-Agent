import type { TokenUsage, CostInfo, ModelInfo } from '../types.js';

/**
 * 计算 token 使用成本
 */
export function calculateCost(
  usage: TokenUsage,
  model: ModelInfo | undefined
): CostInfo {
  if (!model) {
    return { inputCost: 0, outputCost: 0, totalCost: 0, currency: 'USD' };
  }

  const inputCost = (usage.promptTokens / 1000000) * model.pricing.inputPerMillion;
  const outputCost = (usage.completionTokens / 1000000) * model.pricing.outputPerMillion;

  return {
    inputCost,
    outputCost,
    totalCost: inputCost + outputCost,
    currency: model.pricing.currency
  };
}
