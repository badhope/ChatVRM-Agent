/**
 * Semantic Code Chunker - Public API
 *
 * Re-exports all types, utilities, and main functions for the semantic code chunker.
 * This module provides the primary interface for chunking source files into
 * semantically meaningful pieces using tree-sitter AST analysis.
 */

// Re-export types and constants from types submodule
export {
  type CodeChunk,
  type ChunkOptions,
  type ChunkStrategy,
  DEFAULT_MAX_CHUNK_TOKENS,
  DEFAULT_MIN_CHUNK_LINES,
  DECLARATION_TYPES,
  IMPORT_TYPES,
  COMMENT_TYPES,
  nodeTypeToChunkType,
  CHUNK_TYPE_MAP,
} from './types.js';

// Re-export chunk-builder utilities from chunk-builder submodule
export {
  extractLines,
  findLeadingComment,
  extractLeadingComments,
  extractImportedNames,
  groupImportsIntoChunk,
  splitLargeClass,
  splitClassAtMethods,
  buildChunks,
  buildChunkFromSymbol,
} from './chunk-builder.js';

// Re-export main chunking functions from parent level
export {
  chunkFile,
  chunkFiles,
  getChunkById,
  findRelevantChunks,
} from '../semantic-chunker.js';
