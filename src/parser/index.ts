/**
 * 代码解析模块 - 统一导出（简化版）
 *
 * 简化版：移除 tree-sitter 依赖，使用 ts-morph 进行 TypeScript 解析
 */

// Language utilities
export {
  initLanguages,
  getLanguageByExtension,
  getLanguageByFilePath,
  getRegisteredLanguages,
  getLanguage,
} from './languages.js';
export type { SupportedLanguage, LanguageInfo } from './languages.js';

// Parser engine (simplified)
export { parseFile, clearCache } from './engine.js';
export type { ParseResult, SymbolInfo } from './engine.js';

// Cache
export { parseCache } from './cache.js';

// ts-morph Project singleton
export {
  getProject,
  createProject,
  resetProject,
  addSourceFiles,
  normalizeFilePath,
} from './ts-morph-project.js';

// Dependency graph (ts-morph based)
export { DependencyGraph, buildDependencyGraph } from './dependency-graph.js';
export type { FileDependency, DependencyNode, DependencyEdge } from './dependency-graph.js';

// Importance ranker (ts-morph based)
export { ImportanceRanker, rankSymbols, getRankedSymbols } from './importance-ranker.js';
export type { SymbolImportance, ImportanceRankerOptions } from './importance-ranker.js';

// Token budget
export {
  createTokenBudget,
  estimateTokens,
  formatSymbolEntry,
  formatFileMap,
} from './token-budget.js';
export type { TokenBudget } from './token-budget.js';
