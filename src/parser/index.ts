/**
 * 代码解析模块 - 统一导出
 *
 * 基于 ts-morph 的 TypeScript 代码解析引擎，提供准确的
 * 类型分析、引用查找和依赖图构建功能。
 */

// Language utilities (still used for multi-language support)
export { initLanguages, getLanguageByExtension, getLanguageByFilePath, getRegisteredLanguages, getLanguage } from './languages.js';
export type { SupportedLanguage, LanguageInfo } from './languages.js';

// Parser engine (tree-sitter based for multi-language)
export { parseSource, updateParse, parseFile, parseFiles } from './engine.js';
export type { ParseResult } from './engine.js';

// Symbol extraction (tree-sitter based)
export { extractSymbols, getSymbolsInRange, findSymbolByName } from './symbols.js';
export type { CodeSymbol, SymbolKind } from './symbols.js';

// Cache
export { parseCache } from './cache.js';

// ts-morph Project singleton
export { getProject, createProject, resetProject, addSourceFiles, normalizeFilePath } from './ts-morph-project.js';

// Dependency graph (ts-morph based)
export { DependencyGraph, buildDependencyGraph } from './dependency-graph.js';
export type { FileDependency, DependencyNode, DependencyEdge } from './dependency-graph.js';

// Importance ranker (ts-morph based)
export { ImportanceRanker, rankSymbols, getRankedSymbols } from './importance-ranker.js';
export type { SymbolImportance, ImportanceRankerOptions } from './importance-ranker.js';

// Token budget
export { createTokenBudget, estimateTokens, formatSymbolEntry, formatFileMap } from './token-budget.js';
export type { TokenBudget } from './token-budget.js';

// Repo map generator
export { generateRepoMap } from './repo-map.js';
export type { RepoMapOptions, RepoMapResult } from './repo-map.js';
