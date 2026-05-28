/**
 * Analysis Module - Unified Re-exports（简化版）
 *
 * 简化版：暂时移除依赖 tree-sitter 的复杂功能
 */

// Semantic chunker (simplified)
export { chunkFile, chunkFiles, getChunkById, findRelevantChunks } from './semantic-chunker.js';
export type { CodeChunk, ChunkOptions } from './chunker/types.js';

// Reference finder
export { findReferences, findReferencesInFile } from './reference-finder.js';
export type { ReferenceInfo, ReferenceResult, FindReferencesOptions } from './reference-finder.js';

// Code indexer (simplified)
export { buildCodeIndex, searchIndex, getDefinition, getTypeInfo } from './code-indexer.js';
export type { CodeIndex, IndexEntry, SearchOptions } from './indexer/types.js';
export { INDEXABLE_KINDS } from './indexer/types.js';
