/**
 * display-utils.ts - 显示工具基础函数模块
 *
 * 提供终端显示的基础工具函数和类型定义。
 */

import wrapAnsi from 'wrap-ansi';

// ==================== 内部工具 ====================

/** ANSI 转义码正则，用于去除颜色码计算文本真实宽度 */
const ANSI_REGEX = /\x1B\[[0-9;]*m/g;

/**
 * 去除字符串中的 ANSI 颜色转义码
 * @param text 可能包含 ANSI 码的字符串
 * @returns 纯文本字符串
 */
export function stripAnsi(text: string): string {
  return text.replace(ANSI_REGEX, '');
}

// ==================== 类型定义 ====================

/** printTable 的配置选项 */
export interface TableOptions {
  /** 表格标题 */
  title?: string;
  /** 表头列名 */
  head: string[];
  /** 表格行数据 */
  rows: Array<string[]>;
  /** 自定义样式 */
  style?: {
    /** 表头颜色，如 ['cyan', 'bold'] */
    head?: string[];
    /** 边框颜色，如 ['gray'] */
    border?: string[];
  };
}

/** printBox 的配置选项 */
export interface BoxOptions {
  /** 边框颜色 */
  borderColor?: string;
  /** 内边距 */
  padding?: number;
  /** 标题 */
  title?: string;
}

/** printKeyValue 的键值对条目 */
export interface KeyValuePair {
  key: string;
  value: string;
  /** 是否高亮显示 value */
  highlight?: boolean;
}

/** printSteps 的步骤条目 */
export interface StepItem {
  /** 步骤编号 */
  step: number;
  /** 步骤标题 */
  title: string;
  /** 步骤状态 */
  status: 'pending' | 'running' | 'done' | 'error';
  /** 步骤详情 */
  detail?: string;
}

/** printProgressBar 的配置选项 */
export interface ProgressBarOptions {
  /** 进度条宽度（字符数） */
  width?: number;
  /** 进度条前缀标签 */
  label?: string;
  /** 已完成部分字符 */
  completeChar?: string;
  /** 未完成部分字符 */
  incompleteChar?: string;
}

/** printBadge 支持的颜色 */
export type BadgeColor = 'green' | 'red' | 'yellow' | 'blue' | 'cyan' | 'gray';

/** printColumns 的配置选项 */
export interface ColumnsOptions {
  /** 列数 */
  columns?: number;
  /** 列间距 */
  padding?: number;
}

// ==================== 工具函数 ====================

/**
 * 获取终端宽度
 * @returns 终端列数，默认 80
 */
export function getTerminalWidth(): number {
  return process.stdout.columns || 80;
}

/**
 * 打印空行
 * @param count 空行数量，默认 1
 */
export function printEmptyLine(count: number = 1): void {
  console.log('\n'.repeat(count));
}

/**
 * 文本截断
 * 使用 wrap-ansi 的 width 选项截断超长文本
 * @param text 原始文本
 * @param maxWidth 最大宽度
 * @param suffix 截断后缀，默认 '...'
 * @returns 截断后的文本
 */
export function truncate(text: string, maxWidth: number, suffix: string = '...'): string {
  if (maxWidth <= 0) return '';
  // 如果文本本身就不超过宽度，直接返回
  const stripped = stripAnsi(text);
  if (stripped.length <= maxWidth) return text;
  // 预留后缀的宽度
  const availableWidth = maxWidth - suffix.length;
  if (availableWidth <= 0) return suffix.slice(0, maxWidth);
  // 使用 wrap-ansi 截断到指定宽度
  const truncated = wrapAnsi(text, availableWidth, { hard: true, trim: true });
  return truncated + suffix;
}

/**
 * 文本换行
 * 使用 wrap-ansi 将文本按指定宽度换行
 * @param text 原始文本
 * @param maxWidth 最大宽度
 * @returns 换行后的文本
 */
export function wrapText(text: string, maxWidth: number): string {
  return wrapAnsi(text, maxWidth, { hard: true, trim: false });
}
