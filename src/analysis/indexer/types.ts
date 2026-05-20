/**
 * Type definitions for the code indexer module.
 */

import type { SymbolKind } from '../../parser/symbols.js';

/** A built code index */
export interface CodeIndex {
  /** Index ID (unique identifier) */
  id: string;
  /** Root directory that was indexed */
  rootDir: string;
  /** Timestamp when the index was built */
  builtAt: number;
  /** Number of files indexed */
  fileCount: number;
  /** Number of symbols indexed */
  symbolCount: number;
}

/** A single entry in the search index */
export interface IndexEntry {
  /** Entry type */
  type: 'symbol' | 'file' | 'chunk';
  /** Name of the symbol, file, or chunk */
  name: string;
  /** File path */
  filePath: string;
  /** Line number (1-based), if applicable */
  line?: number;
  /** Symbol kind (function, class, interface, etc.) */
  kind?: string;
  /** Function/class signature */
  signature?: string;
  /** JSDoc or doc comment */
  docstring?: string;
  /** Relevance score for ranking */
  score: number;
}

/** Options for searching the index */
export interface SearchOptions {
  /** Maximum results to return (default: 20) */
  maxResults?: number;
  /** Filter by entry type */
  typeFilter?: ('symbol' | 'file' | 'chunk')[];
  /** Filter by symbol kind (e.g. ['function', 'class']) */
  kindFilter?: string[];
  /** Glob pattern to filter file paths */
  filePathPattern?: string;
}

/** Symbol kinds to index */
export const INDEXABLE_KINDS = new Set<SymbolKind>([
  'function', 'class', 'interface', 'type', 'enum', 'method', 'module', 'namespace',
]);

/** Internal index data structure */
export interface IndexData {
  index: CodeIndex;
  entries: IndexEntry[];
  /** Inverted index: lowercase name -> list of entry indices */
  invertedIndex: Map<string, number[]>;
  /** All entries grouped by file */
  entriesByFile: Map<string, number[]>;
}
