/**
 * Editor module - Unified re-exports
 *
 * AST-aware code editing tools implementing Aider's SEARCH/REPLACE
 * block editing pattern with tree-sitter-powered targeting.
 */

// Edit target locator
export {
  locateEditTarget,
  locateMultipleTargets,
} from './edit-target.js';
export type {
  EditTarget,
  LocateOptions,
} from './edit-target.js';

// Diff generator
export {
  generateDiff,
  generateMultiDiff,
  applyEdit,
  applyMultipleEdits,
} from './diff-generator.js';
export type {
  EditOperation,
  DiffResult,
} from './diff-generator.js';

// SEARCH/REPLACE block parser and executor
export {
  parseSearchReplaceBlocks,
  executeSearchReplace,
  executeMultipleSearchReplace,
} from './search-replace.js';
export type {
  SearchReplaceBlock,
  SearchReplaceResult,
} from './search-replace.js';
