/**
 * Code Indexer Module
 *
 * Re-exports all public APIs from the code indexer and its submodules.
 */

// Re-export main code-indexer functions (at parent level)
export {
  buildCodeIndex,
  searchIndex,
  getDefinition,
  getTypeInfo,
} from '../code-indexer.js';

// Re-export types from indexer submodule (in same directory)
export type { CodeIndex, IndexEntry, SearchOptions, IndexData } from './types.js';
export { INDEXABLE_KINDS } from './types.js';
