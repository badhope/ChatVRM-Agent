import { getErrorMessage } from '../../utils/error-handling.js';

/**
 * Formatted API error result
 */
export interface FormattedApiError {
  message: string;
  hint: string;
}

/**
 * Format API error messages with user-friendly hints
 *
 * @param error - Unknown error value
 * @returns Formatted error with message and hint
 */
export function formatApiError(error: unknown): FormattedApiError {
  const errMsg = getErrorMessage(error);

  if (errMsg.includes('401') || errMsg.includes('Unauthorized') || errMsg.includes('invalid key') || errMsg.includes('Incorrect API key')) {
    return { message: 'API Key 无效或未配置', hint: '请运行: devflow config set-key <平台> <apiKey>' };
  }
  if (errMsg.includes('403') || errMsg.includes('Forbidden')) {
    return { message: 'API Key 没有访问权限', hint: '请检查 API Key 是否有该模型的访问权限' };
  }
  if (errMsg.includes('429') || errMsg.includes('rate') || errMsg.includes('Too Many Requests')) {
    return { message: '请求频率过高，被限流', hint: '请稍等几秒后重试，或切换到其他模型' };
  }
  if (errMsg.includes('500') || errMsg.includes('Internal Server Error')) {
    return { message: 'AI 服务端内部错误', hint: '这是平台方的问题，请稍后重试或切换模型' };
  }
  if (errMsg.includes('502') || errMsg.includes('Bad Gateway')) {
    return { message: 'AI 服务网关错误', hint: '平台服务暂时不可用，请稍后重试' };
  }
  if (errMsg.includes('503') || errMsg.includes('Service Unavailable')) {
    return { message: 'AI 服务暂不可用', hint: '平台正在维护或过载，请稍后重试' };
  }
  if (errMsg.includes('timeout') || errMsg.includes('ETIMEDOUT') || errMsg.includes('Timed out') || errMsg.includes('abort')) {
    return { message: '请求超时', hint: '请检查网络连接，或尝试切换更快的模型' };
  }
  if (errMsg.includes('ENOTFOUND') || errMsg.includes('ECONNREFUSED') || errMsg.includes('fetch failed')) {
    return { message: '网络连接失败', hint: '请检查网络连接是否正常，是否需要代理' };
  }
  if (errMsg.includes('quota') || errMsg.includes('余额') || errMsg.includes('insufficient')) {
    return { message: 'API 额度不足', hint: '请到平台充值，或切换到有额度的模型' };
  }
  if (errMsg.includes('model') && errMsg.includes('not found')) {
    return { message: '模型不存在', hint: '请用 devflow chat models 查看可用模型列表' };
  }

  return { message: errMsg, hint: '' };
}
