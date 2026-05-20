/**
 * Analysis Module - Unified Re-exports
 *
 * Cline/OpenHands-style code understanding with semantic chunking,
 * reference finding, and code indexing.
 */

// Semantic chunker
export {
  chunkFile,
  chunkFiles,
  getChunkById,
  findRelevantChunks,
} from './semantic-chunker.js';
export type {
  CodeChunk,
  ChunkOptions,
} from './chunker/types.js';

// Reference finder
export {
  findReferences,
  findReferencesInFile,
} from './reference-finder.js';
export type {
  ReferenceInfo,
  ReferenceResult,
  FindReferencesOptions,
} from './reference-finder.js';

// Code indexer
export {
  buildCodeIndex,
  searchIndex,
  getDefinition,
  getTypeInfo,
} from './code-indexer.js';
export type { CodeIndex, IndexEntry, SearchOptions } from './indexer/types.js';
export { INDEXABLE_KINDS } from './indexer/types.js';
