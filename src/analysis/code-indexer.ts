/**
 * Code Indexer
 *
 * 使用 MiniSearch 构建可搜索的内存代码索引。
 * 解析源文件，提取符号和代码块，通过 MiniSearch 的 BM25 算法进行全文搜索。
 *
 * 相比之前的自定义倒排索引实现：
 * - 使用 MiniSearch 内置的 BM25 排序（更优的相关性评分）
 * - 支持前缀匹配和模糊搜索
 * - 减少自定义代码量
 */

import * as path from 'path';
import MiniSearch from 'minisearch';
import { parseFiles } from '../parser/engine.js';
import { extractSymbols } from '../parser/symbols.js';
import { chunkFiles } from './semantic-chunker.js';
import { collectSourceFiles } from '../utils/file-system.js';
import { globMatch } from '../utils/glob.js';

import type { CodeIndex, IndexEntry, SearchOptions, IndexData } from './indexer/types.js';
import { INDEXABLE_KINDS } from './indexer/types.js';

// 导出缓存功能
export { CodeIndexCache, codeIndexCache, getCachedCodeIndex, invalidateCodeIndexCache } from './code-indexer-cache.js';

// ============================================================
// MiniSearch 文档类型
// ============================================================

/** MiniSearch 索引的代码条目 */
interface CodeSearchEntry {
  /** 条目索引 ID（对应 entries 数组下标） */
  idx: number;
  /** 名称（符号名、文件名、块名） */
  name: string;
  /** 文件路径 */
  filePath: string;
  /** 文档字符串 */
  docstring: string;
  /** 函数/类签名 */
  signature: string;
  /** 符号类型 */
  kind: string;
  /** 条目类型 */
  type: string;
}

// ============================================================
// 索引存储
// ============================================================

/** 内存索引存储 */
const indexStore = new Map<string, IndexData>();

/**
 * 提取 JSDoc 或文档注释
 */
function extractDocstring(node: { previousNamedSibling?: { type: string; text: string } | null; parent?: { childCount: number; child: (i: number) => { type: string; text: string } | null } | null }, source: string): string | undefined {
  const prev = node.previousNamedSibling;
  if (prev && (
    prev.type === 'comment' ||
    prev.type === 'block_comment' ||
    prev.type === 'line_comment'
  )) {
    const commentText = prev.text.trim();
    if (
      commentText.startsWith('/**') ||
      commentText.startsWith('"""') ||
      commentText.startsWith("'''") ||
      commentText.startsWith('# ')
    ) {
      return commentText;
    }
  }

  const parent = node.parent;
  if (parent) {
    let prevUnnamed: { type: string; text: string } | null = null;
    for (let i = 0; i < parent.childCount; i++) {
      const child = parent.child(i);
      if (child && (child.type === 'comment' || child.type === 'block_comment')) {
        prevUnnamed = child;
      }
    }
    if (prevUnnamed) {
      const commentText = prevUnnamed.text.trim();
      if (commentText.startsWith('/**')) {
        return commentText;
      }
    }
  }

  return undefined;
}

/**
 * 构建可搜索的代码索引
 *
 * @param rootDir - 项目根目录的绝对路径
 * @returns 构建好的代码索引
 */
export async function buildCodeIndex(rootDir: string): Promise<CodeIndex> {
  const filePaths = await collectSourceFiles(rootDir);

  if (filePaths.length === 0) {
    const emptyIndex: CodeIndex = {
      id: `idx-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
      rootDir,
      builtAt: Date.now(),
      fileCount: 0,
      symbolCount: 0,
    };
    indexStore.set(emptyIndex.id, {
      index: emptyIndex,
      entries: [],
      invertedIndex: new Map(),
      entriesByFile: new Map(),
    });
    return emptyIndex;
  }

  // 解析所有文件
  const parseResults = await parseFiles(filePaths);

  // 提取符号并构建条目
  const entries: IndexEntry[] = [];
  let symbolCount = 0;

  for (const [filePath, result] of parseResults) {
    const symbols = extractSymbols(result);
    const source = result.source;

    // 添加文件条目
    const fileName = path.basename(filePath);
    entries.push({
      type: 'file',
      name: fileName,
      filePath,
      score: 0,
    });

    // 添加符号条目
    for (const sym of symbols) {
      if (!INDEXABLE_KINDS.has(sym.kind)) continue;
      if (!sym.name || sym.name.startsWith('(')) continue;

      const docstring = extractDocstring(
        result.tree.rootNode.descendantForPosition({
          row: sym.startLine,
          column: 0,
        }),
        source,
      );

      entries.push({
        type: 'symbol',
        name: sym.name,
        filePath,
        line: sym.startLine + 1,
        kind: sym.kind,
        signature: sym.signature,
        docstring,
        score: 0,
      });
      symbolCount++;
    }
  }

  // 分块并添加块条目
  const chunks = await chunkFiles(filePaths);
  for (const [filePath, fileChunks] of chunks) {
    for (const chunk of fileChunks) {
      if (chunk.type === 'import-section' || chunk.type === 'comment-section') continue;

      entries.push({
        type: 'chunk',
        name: chunk.name ?? `chunk-${chunk.startLine}`,
        filePath,
        line: chunk.startLine,
        kind: chunk.type,
        signature: chunk.signature,
        score: 0,
      });
    }
  }

  // 构建文件索引映射
  const entriesByFile = new Map<string, number[]>();
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const indices = entriesByFile.get(entry.filePath) ?? [];
    indices.push(i);
    entriesByFile.set(entry.filePath, indices);
  }

  // 创建代码索引
  const codeIndex: CodeIndex = {
    id: `idx-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
    rootDir,
    builtAt: Date.now(),
    fileCount: filePaths.length,
    symbolCount,
  };

  // MiniSearch 倒排索引（用于向后兼容的 IndexData 接口）
  const invertedIndex = new Map<string, number[]>();
  for (let i = 0; i < entries.length; i++) {
    const key = entries[i].name.toLowerCase();
    const indices = invertedIndex.get(key) ?? [];
    indices.push(i);
    invertedIndex.set(key, indices);
  }

  indexStore.set(codeIndex.id, {
    index: codeIndex,
    entries,
    invertedIndex,
    entriesByFile,
  });

  return codeIndex;
}

/**
 * 搜索代码索引
 *
 * 使用 MiniSearch BM25 排序进行全文搜索，
 * 支持按类型、种类和文件路径过滤。
 *
 * @param index - 代码索引
 * @param query - 搜索查询字符串
 * @param options - 搜索选项
 * @returns 按相关性排序的匹配条目
 */
export function searchIndex(
  index: CodeIndex,
  query: string,
  options?: SearchOptions,
): IndexEntry[] {
  const data = indexStore.get(index.id);
  if (!data) return [];

  const maxResults = options?.maxResults ?? 20;
  const typeFilter = options?.typeFilter;
  const kindFilter = options?.kindFilter;
  const filePathPattern = options?.filePathPattern;

  // 构建 MiniSearch 搜索文档
  const searchDocs: CodeSearchEntry[] = data.entries.map((entry, idx) => ({
    idx,
    name: entry.name,
    filePath: entry.filePath,
    docstring: entry.docstring ?? '',
    signature: entry.signature ?? '',
    kind: entry.kind ?? '',
    type: entry.type,
  }));

  // 创建临时 MiniSearch 实例进行搜索
  const ms = new MiniSearch<CodeSearchEntry>({
    fields: ['name', 'docstring', 'signature', 'kind'],
    idField: 'idx',
    searchOptions: {
      boost: { name: 3, kind: 1, docstring: 1, signature: 1 },
      prefix: true,
      fuzzy: 0.2,
    },
  });

  ms.addAll(searchDocs);

  // 执行搜索
  let results: Array<{ id: number; score: number }>;
  try {
    results = ms.search(query).map(r => ({
      id: r.id as number,
      score: r.score,
    }));
  } catch {
    results = [];
  }

  // 过滤和评分
  const scored: IndexEntry[] = [];
  for (const result of results) {
    const entry = data.entries[result.id];

    // 应用类型过滤
    if (typeFilter && typeFilter.length > 0 && !typeFilter.includes(entry.type)) {
      continue;
    }

    // 应用种类过滤
    if (kindFilter && kindFilter.length > 0) {
      if (!entry.kind || !kindFilter.includes(entry.kind)) {
        continue;
      }
    }

    // 应用文件路径模式过滤
    if (filePathPattern) {
      const relative = path.relative(index.rootDir, entry.filePath).replace(/\\/g, '/');
      if (!globMatch(relative, filePathPattern)) {
        continue;
      }
    }

    // 类型加分：符号 > 块 > 文件
    let typeBonus = 0;
    if (entry.type === 'symbol') typeBonus = 10;
    else if (entry.type === 'chunk') typeBonus = 5;

    scored.push({ ...entry, score: result.score + typeBonus });
  }

  // 排序
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (a.filePath !== b.filePath) return a.filePath.localeCompare(b.filePath);
    return (a.line ?? 0) - (b.line ?? 0);
  });

  return scored.slice(0, maxResults);
}

/**
 * 获取符号的定义条目
 *
 * @param index - 代码索引
 * @param symbolName - 符号名称
 * @returns 定义条目，未找到返回 null
 */
export async function getDefinition(
  index: CodeIndex,
  symbolName: string,
): Promise<IndexEntry | null> {
  const data = indexStore.get(index.id);
  if (!data) return null;

  const lowerName = symbolName.toLowerCase();

  // 优先查找函数、类、接口等定义类型
  const definitionKinds = new Set(['function', 'class', 'interface', 'type', 'enum']);
  let best: IndexEntry | null = null;

  for (const entry of data.entries) {
    if (entry.type !== 'symbol') continue;
    if (entry.name.toLowerCase() !== lowerName) continue;

    if (entry.kind && definitionKinds.has(entry.kind)) {
      return entry;
    }

    if (!best) best = entry;
  }

  return best;
}

/**
 * 获取类型信息
 *
 * @param index - 代码索引
 * @param typeName - 类型名称
 * @returns 类型信息条目，未找到返回 null
 */
export async function getTypeInfo(
  index: CodeIndex,
  typeName: string,
): Promise<IndexEntry | null> {
  const data = indexStore.get(index.id);
  if (!data) return null;

  const lowerName = typeName.toLowerCase();
  const typeKinds = new Set(['interface', 'type', 'enum', 'class']);

  for (const entry of data.entries) {
    if (entry.type !== 'symbol') continue;
    if (entry.name.toLowerCase() !== lowerName) continue;
    if (entry.kind && typeKinds.has(entry.kind)) {
      return entry;
    }
  }

  return null;
}
