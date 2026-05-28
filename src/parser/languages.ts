/**
 * 语言包管理器（简化版 - 移除 tree-sitter 依赖）
 * 使用 ts-morph 进行 TypeScript 解析，其他语言使用简单文本解析
 */

import { createLogger } from '../services/logger.js';

const logger = createLogger('Languages');

/** 支持的语言 */
export type SupportedLanguage = 'typescript' | 'tsx' | 'javascript' | 'javascript-jsx' | 'python';

/**
 * 语言信息
 */
export interface LanguageInfo {
  name: SupportedLanguage;
  displayName: string;
  extensions: string[];
}

/** 语言注册表 */
const languageMap = new Map<SupportedLanguage, LanguageInfo>();

/**
 * 初始化所有语言
 */
export async function initLanguages(): Promise<void> {
  // TypeScript
  languageMap.set('typescript', {
    name: 'typescript',
    displayName: 'TypeScript',
    extensions: ['.ts', '.mts', '.cts'],
  });
  languageMap.set('tsx', {
    name: 'tsx',
    displayName: 'TSX',
    extensions: ['.tsx'],
  });

  // JavaScript
  languageMap.set('javascript', {
    name: 'javascript',
    displayName: 'JavaScript',
    extensions: ['.js', '.mjs', '.cjs'],
  });
  languageMap.set('javascript-jsx', {
    name: 'javascript-jsx',
    displayName: 'JSX',
    extensions: ['.jsx'],
  });

  // Python
  languageMap.set('python', {
    name: 'python',
    displayName: 'Python',
    extensions: ['.py', '.pyi', '.pyw'],
  });

  logger.debug('Languages initialized');
}

/**
 * 根据文件扩展名获取语言
 */
export function getLanguageByExtension(ext: string): LanguageInfo | null {
  const normalizedExt = ext.startsWith('.') ? ext : `.${ext}`;
  for (const [, info] of languageMap) {
    if (info.extensions.includes(normalizedExt)) return info;
  }
  return null;
}

/**
 * 根据文件路径获取语言
 */
export function getLanguageByFilePath(filePath: string): LanguageInfo | null {
  const ext = filePath.substring(filePath.lastIndexOf('.'));
  return getLanguageByExtension(ext);
}

/**
 * 获取所有已注册的语言
 */
export function getRegisteredLanguages(): LanguageInfo[] {
  return Array.from(languageMap.values());
}

/**
 * 获取指定语言
 */
export function getLanguage(name: SupportedLanguage): LanguageInfo | null {
  return languageMap.get(name) || null;
}
