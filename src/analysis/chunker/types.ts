/**
 * Types and interfaces for the semantic code chunker
 */

import type { SymbolKind } from '../../parser/symbols.js';

/** A semantically meaningful chunk of code */
export interface CodeChunk {
  /** Unique ID (file:line-start) */
  id: string;
  /** Absolute file path */
  filePath: string;
  /** Start line (1-based) */
  startLine: number;
  /** End line (1-based) */
  endLine: number;
  /** The actual code text */
  content: string;
  /** Chunk type */
  type: 'function' | 'class' | 'interface' | 'module' | 'block' | 'import-section' | 'comment-section' | 'other';
  /** Symbol name if applicable */
  name?: string;
  /** Function/class signature */
  signature?: string;
  /** Depth in the AST */
  nestingLevel: number;
  /** Estimated token count (~4 chars/token) */
  tokens: number;
  /** IDs of chunks this depends on (import references) */
  dependencies: string[];
}

/** Options for chunking */
export interface ChunkOptions {
  /** Maximum tokens per chunk (default: 512) */
  maxChunkTokens?: number;
  /** Minimum lines per chunk (default: 3) */
  minChunkLines?: number;
  /** Don't split inside functions/classes (default: true) */
  respectBoundaries?: boolean;
}

/** Chunk strategy type */
export type ChunkStrategy = 'semantic' | 'structural' | 'mixed';

// ============================================================================
// Constants
// ============================================================================

export const DEFAULT_MAX_CHUNK_TOKENS = 512;
export const DEFAULT_MIN_CHUNK_LINES = 3;

/** Node types that represent top-level declarations */
export const DECLARATION_TYPES = new Set([
  'function_declaration',
  'function_expression',
  'generator_function_declaration',
  'class_declaration',
  'abstract_class_declaration',
  'interface_declaration',
  'type_alias_declaration',
  'enum_declaration',
  'lexical_declaration',
  'variable_declaration',
  'export_statement',
  'export_default_declaration',
  'export_named_declaration',
  // Python
  'function_definition',
  'class_definition',
]);

/** Import node types */
export const IMPORT_TYPES = new Set([
  'import_statement',
  'import_declaration',
  'import_from_statement',
]);

/** Comment node types */
export const COMMENT_TYPES = new Set([
  'comment',
  'block_comment',
  'line_comment',
]);

// ============================================================================
// Type Mapping
// ============================================================================

/**
 * Map a tree-sitter node type to a CodeChunk type.
 */
export function nodeTypeToChunkType(
  nodeType: string,
  symbolKind?: SymbolKind
): CodeChunk['type'] {
  if (IMPORT_TYPES.has(nodeType)) return 'import-section';
  if (COMMENT_TYPES.has(nodeType)) return 'comment-section';
  if (symbolKind === 'function' || symbolKind === 'method') return 'function';
  if (symbolKind === 'class') return 'class';
  if (symbolKind === 'interface') return 'interface';
  if (symbolKind === 'module' || symbolKind === 'namespace') return 'module';
  if (DECLARATION_TYPES.has(nodeType)) return 'other';
  return 'other';
}

/**
 * Map from tree-sitter node type to chunk type (lookup table).
 * Used for fast type conversion.
 */
export const CHUNK_TYPE_MAP: Record<string, CodeChunk['type']> = {
  // Import types
  'import_statement': 'import-section',
  'import_declaration': 'import-section',
  'import_from_statement': 'import-section',
  // Comment types
  'comment': 'comment-section',
  'block_comment': 'comment-section',
  'line_comment': 'comment-section',
  // Declarations - these need symbolKind for accurate mapping
  'function_declaration': 'function',
  'function_expression': 'function',
  'generator_function_declaration': 'function',
  'method_definition': 'function',
  'arrow_function': 'function',
  'class_declaration': 'class',
  'abstract_class_declaration': 'class',
  'class_definition': 'class',
  'interface_declaration': 'interface',
  'type_alias_declaration': 'other',
  'enum_declaration': 'other',
  'lexical_declaration': 'other',
  'variable_declaration': 'other',
  'export_statement': 'other',
  'export_default_declaration': 'other',
  'export_named_declaration': 'other',
};
