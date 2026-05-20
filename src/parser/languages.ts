/**
 * 语言包管理器
 * 管理所有支持的编程语言的 tree-sitter 语法
 */

import { createLogger } from '../services/logger.js';

const logger = createLogger('Languages');

/** 支持的语言 */
export type SupportedLanguage =
  | 'typescript'
  | 'tsx'
  | 'javascript'
  | 'javascript-jsx'
  | 'python';

/**
 * Tree-sitter 语言对象
 */
export interface TreeSitterLanguage {
  name: string;
  [key: string]: unknown;
}

/** 语言信息 */
export interface LanguageInfo {
  name: SupportedLanguage;
  displayName: string;
  extensions: string[];
  /** 语言对象（不同包导出格式不同，使用 unknown 类型） */
  language: TreeSitterLanguage | unknown;
}

/** 语言注册表 */
const languageMap = new Map<SupportedLanguage, LanguageInfo>();

/**
 * 初始化所有语言
 */
export async function initLanguages(): Promise<void> {
  // TypeScript
  try {
    const tsModule = await import('tree-sitter-typescript');
    // ESM 下 default export 包含 typescript/tsx 属性
    const tsPkg = tsModule.default || tsModule;
    languageMap.set('typescript', {
      name: 'typescript',
      displayName: 'TypeScript',
      extensions: ['.ts', '.mts', '.cts'],
      language: tsPkg.typescript,
    });
    languageMap.set('tsx', {
      name: 'tsx',
      displayName: 'TSX',
      extensions: ['.tsx'],
      language: tsPkg.tsx,
    });
  } catch {
    logger.warn('tree-sitter-typescript 加载失败');
  }

  // JavaScript
  try {
    const jsModule = await import('tree-sitter-javascript');
    const jsLang = jsModule.language || jsModule.default || jsModule;
    languageMap.set('javascript', {
      name: 'javascript',
      displayName: 'JavaScript',
      extensions: ['.js', '.mjs', '.cjs'],
      language: jsLang,
    });
    languageMap.set('javascript-jsx', {
      name: 'javascript-jsx',
      displayName: 'JSX',
      extensions: ['.jsx'],
      language: jsLang,
    });
  } catch {
    logger.warn('tree-sitter-javascript 加载失败');
  }

  // Python
  try {
    const pyModule = await import('tree-sitter-python');
    const pyLang = pyModule.language || pyModule.default || pyModule;
    languageMap.set('python', {
      name: 'python',
      displayName: 'Python',
      extensions: ['.py', '.pyi', '.pyw'],
      language: pyLang,
    });
  } catch {
    logger.warn('tree-sitter-python 加载失败');
  }
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
