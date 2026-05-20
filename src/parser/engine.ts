/**
 * 代码解析引擎
 *
 * 封装 tree-sitter Parser，提供增量解析和语法树缓存。
 */

import Parser from 'tree-sitter';
import { getLanguageByFilePath, type LanguageInfo } from './languages.js';
import { parseCache } from './cache.js';

/**
 * Tree-sitter 解析树节点位置
 */
export interface ParseTreePosition {
  row: number;
  column: number;
}

/**
 * Tree-sitter 解析树节点
 */
export interface ParseTreeNode {
  type: string;
  text: string;
  startPosition: ParseTreePosition;
  endPosition: ParseTreePosition;
  childCount: number;
  children: ParseTreeNode[];
  parent: ParseTreeNode | null;
  /** 前一个命名兄弟节点 */
  previousNamedSibling?: ParseTreeNode | null;
  /** 获取指定位置的子孙节点 */
  descendantForPosition(position: ParseTreePosition): ParseTreeNode;
  /** 获取子节点 */
  child(index: number): ParseTreeNode | null;
  /** 根据字段名获取子节点 */
  childForFieldName(fieldName: string): ParseTreeNode | null;
}

/**
 * Tree-sitter 解析树
 */
export interface ParseTree {
  rootNode: ParseTreeNode;
}

/** 解析结果 */
export interface ParseResult {
  /** 语法树 */
  tree: ParseTree;
  /** 语言信息 */
  language: LanguageInfo;
  /** 源代码 */
  source: string;
  /** 文件路径 */
  filePath: string;
}

/** Parser 实例缓存（每种语言一个） */
const parserInstances = new Map<string, Parser>();

/**
 * 获取或创建 Parser 实例
 * @param languageName 语言名称
 * @param language 语言对象（来自 tree-sitter 语言包）
 * @returns Parser 实例
 */
function getParser(languageName: string, language: unknown): Parser {
  let parser = parserInstances.get(languageName);
  if (!parser) {
    parser = new Parser();
    parser.setLanguage(language as Parser.Language);
    parserInstances.set(languageName, parser);
  }
  return parser;
}

/**
 * 解析源代码
 * @param source 源代码
 * @param filePath 文件路径（用于确定语言和缓存）
 * @param oldTree 旧语法树（用于增量解析）
 */
export function parseSource(
  source: string,
  filePath: string,
  oldTree?: ParseTree
): ParseResult | null {
  const language = getLanguageByFilePath(filePath);
  if (!language || !language.language) {
    return null;
  }

  const parser = getParser(language.name, language.language);
  const tree = parser.parse(source, oldTree as Parser.Tree | undefined) as ParseTree;

  return { tree, language, source, filePath };
}

/**
 * 增量解析（更新已有文件）
 */
export function updateParse(
  result: ParseResult,
  newSource: string
): ParseResult | null {
  const language = result.language;
  if (!language.language) return null;

  const oldTree = result.tree;
  const newTree = parseSource(newSource, result.filePath, oldTree as ParseTree);
  return newTree;
}

/**
 * 解析文件（带缓存）
 */
export async function parseFile(filePath: string): Promise<ParseResult | null> {
  // 检查缓存
  const cached = parseCache.get(filePath);
  if (cached) {
    return cached;
  }

  const fs = await import('fs/promises');
  let source: string;
  try {
    source = await fs.readFile(filePath, 'utf8');
  } catch {
    return null;
  }

  const result = parseSource(source, filePath);
  if (result) {
    parseCache.set(filePath, result);
  }
  return result;
}

/**
 * 批量解析文件
 */
export async function parseFiles(filePaths: string[]): Promise<Map<string, ParseResult>> {
  const results = new Map<string, ParseResult>();

  // 并行解析（限制并发数）
  const batchSize = 10;
  for (let i = 0; i < filePaths.length; i += batchSize) {
    const batch = filePaths.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map(async (fp) => {
        const result = await parseFile(fp);
        return result ? [fp, result] as const : null;
      })
    );
    for (const r of batchResults) {
      if (r) results.set(r[0], r[1]);
    }
  }

  return results;
}
