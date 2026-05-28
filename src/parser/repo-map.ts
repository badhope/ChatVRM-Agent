/**
 * Repo Map Generator (简化版)
 *
 * 简化版：移除对 tree-sitter 的依赖，使用简单的文件索引
 */

import * as path from 'path';
import * as fs from 'fs';
import { parseFile } from './engine.js';
import { extractSymbols } from './symbols.js';
import { buildDependencyGraph } from './dependency-graph.js';
import { rankSymbols } from './importance-ranker.js';
import { createTokenBudget, estimateTokens, formatFileMap } from './token-budget.js';
import {
  collectSourceFiles,
  DEFAULT_EXCLUDE_PATTERNS,
} from '../utils/file-system.js';

/** Options for repo map generation */
export interface RepoMapOptions {
  /** Maximum tokens for the repo map (default: 4096) */
  maxTokens?: number;
  /** Explicit entry point file paths (auto-detected if not provided) */
  entryPoints?: string[];
  /** Glob patterns to include (default: all source files) */
  includePatterns?: string[];
  /** Glob patterns to exclude */
  excludePatterns?: string[];
}

/** Result of repo map generation */
export interface RepoMapResult {
  /** The actual repo map text */
  map: string;
  /** Number of files included in the map */
  fileCount: number;
  /** Total number of symbols included */
  symbolCount: number;
  /** Estimated token count of the map */
  tokenCount: number;
  /** Files skipped due to budget constraints */
  skippedFiles: string[];
}

/**
 * Auto-detect entry point files from a list of file paths.
 */
function detectEntryPoints(filePaths: string[]): string[] {
  const entryPatterns = new Set([
    'index.ts',
    'index.js',
    'index.mts',
    'index.cts',
    'main.ts',
    'main.js',
    'app.ts',
    'app.js',
    'cli.ts',
    'cli.js',
    'server.ts',
    'server.js',
    'index.py',
    'main.py',
    'app.py',
    '__init__.py',
    '__main__.py',
  ]);

  return filePaths.filter((fp) => {
    const basename = path.basename(fp);
    return entryPatterns.has(basename);
  });
}

/**
 * Generate a repo map for the given project directory (简化版).
 *
 * @param rootDir - Absolute path to the project root
 * @param options - Generation options
 * @returns The repo map result
 */
export async function generateRepoMap(
  rootDir: string,
  options?: RepoMapOptions
): Promise<RepoMapResult> {
  const maxTokens = options?.maxTokens ?? 4096;
  const excludePatterns = options?.excludePatterns ?? DEFAULT_EXCLUDE_PATTERNS;
  const includePatterns = options?.includePatterns;

  // Step 1: Collect all source files
  const filePaths = await collectSourceFiles(rootDir, excludePatterns, includePatterns);

  if (filePaths.length === 0) {
    return {
      map: '',
      fileCount: 0,
      symbolCount: 0,
      tokenCount: 0,
      skippedFiles: [],
    };
  }

  // Step 2: Parse all files (简化版)
  const allSymbols = new Map<string, import('./symbols.js').CodeSymbol[]>();
  const allSources = new Map<string, string>();

  /** Repo Map 只关注的符号类型 */
  const REPO_MAP_KINDS = new Set([
    'function',
    'class',
    'interface',
    'type',
    'enum',
    'method',
    'module',
    'namespace',
  ]);

  for (const filePath of filePaths) {
    try {
      const source = fs.readFileSync(filePath, 'utf-8');
      const result = await parseFile(filePath, source);
      const raw = extractSymbols(result, filePath);
      // 过滤：只保留有意义的符号类型，排除局部变量、import、export 声明
      const filtered = raw.filter((s: import('./symbols.js').CodeSymbol) => {
        if (!REPO_MAP_KINDS.has(s.kind)) return false;
        // 排除匿名函数（箭头函数没有名称时 name 为空）
        if (!s.name || s.name.startsWith('(')) return false;
        return true;
      });
      allSymbols.set(filePath, filtered);
      allSources.set(filePath, source);
    } catch {
      allSymbols.set(filePath, []);
      allSources.set(filePath, '');
    }
  }

  // Step 3: Build dependency graph
  const graph = buildDependencyGraph(filePaths);

  // Step 4: Detect entry points and rank symbols
  const entryPoints = options?.entryPoints ?? detectEntryPoints(filePaths);
  const ranked = rankSymbols(undefined, graph, entryPoints, undefined, {});

  // Step 5: Generate map within token budget
  const budget = createTokenBudget(maxTokens);
  const mapParts: string[] = [];
  const includedFiles = new Set<string>();
  const skippedFiles: string[] = [];
  let symbolCount = 0;

  // Group ranked symbols by file, preserving importance order
  const fileSymbolOrder = new Map<string, import('./symbols.js').CodeSymbol[]>();

  for (const item of ranked) {
    const fp = item.symbol.filePath;
    const symbols = fileSymbolOrder.get(fp) || [];
    symbols.push(item.symbol);
    fileSymbolOrder.set(fp, symbols);
  }

  // Add files that have no ranked symbols but exist in the project
  for (const fp of filePaths) {
    if (!fileSymbolOrder.has(fp)) {
      fileSymbolOrder.set(fp, []);
    }
  }

  // Generate file maps in order of most important symbols first
  for (const [filePath, symbols] of fileSymbolOrder) {
    if (symbols.length === 0) {
      // No symbols to include, skip
      skippedFiles.push(filePath);
      continue;
    }

    const source = allSources.get(filePath) || '';
    const fileMap = formatFileMap(filePath, symbols, source, rootDir);
    const fileTokens = estimateTokens(fileMap + '\n');

    if (!budget.canFit(fileTokens + 1)) {
      skippedFiles.push(filePath);
      continue;
    }

    budget.allocate(fileTokens + 1);
    mapParts.push(fileMap);
    includedFiles.add(filePath);
    symbolCount += symbols.length;
  }

  const map = mapParts.join('\n\n');

  return {
    map,
    fileCount: includedFiles.size,
    symbolCount,
    tokenCount: budget.usedTokens,
    skippedFiles,
  };
}
