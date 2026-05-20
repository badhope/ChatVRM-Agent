/**
 * 系统限制常量
 *
 * 集中管理各种数值限制，避免魔法数字
 */

/** 关机延迟时间（毫秒） */
export const SHUTDOWN_DELAY_MS = 3000;

/** 默认上下文 token 数量 */
export const DEFAULT_CONTEXT_TOKENS = 8000;

/** 最大输出显示字符数 */
export const MAX_OUTPUT_DISPLAY_CHARS = 5000;

/** 最大洞察数量 */
export const MAX_INSIGHTS_COUNT = 100;

/** 任务超时时间（毫秒）- 10分钟 */
export const TASK_TIMEOUT_MS = 10 * 60 * 1000;
