/**
 * AST-aware edit target locator
 *
 * Locates precise code regions for editing using tree-sitter AST analysis,
 * symbol lookup, content matching, and regex patterns.
 */

import * as fs from 'fs/promises';
import { parseFile } from '../parser/engine.js';
import { extractSymbols, findSymbolByName } from '../parser/symbols.js';
import type { CodeSymbol } from '../parser/symbols.js';

/** Represents a precise location in a file to be edited */
export interface EditTarget {
  /** File path */
  filePath: string;
  /** Start line (1-based, human-readable) */
  startLine: number;
  /** End line (1-based, human-readable) */
  endLine: number;
  /** Start column (0-based) */
  startCol?: number;
  /** End column (0-based) */
  endCol?: number;
  /** Associated symbol name */
  symbolName?: string;
  /** Symbol kind (function, class, method, etc.) */
  symbolKind?: string;
  /** The original content at the located range */
  content: string;
}

/** Options for locating an edit target */
export interface LocateOptions {
  /** Find by symbol name */
  symbolName?: string;
  /** Find by line range (1-based) */
  lineRange?: { start: number; end: number };
  /** Find by exact code content */
  content?: string;
  /** Find by regex pattern */
  pattern?: RegExp;
  /** Scope to specific symbol kind */
  symbolKind?: string;
}

/**
 * Extract lines from source text for a given 1-based line range.
 */
function extractLines(source: string, startLine: number, endLine: number): string {
  const lines = source.split('\n');
  // Convert 1-based to 0-based
  const startIdx = Math.max(0, startLine - 1);
  const endIdx = Math.min(lines.length, endLine);
  return lines.slice(startIdx, endIdx).join('\n');
}

/**
 * Find the line range of an exact content match in the source.
 * Returns 1-based line numbers.
 */
function findContentRange(source: string, content: string): { startLine: number; endLine: number } | null {
  const sourceLines = source.split('\n');
  const searchLines = content.split('\n');

  if (searchLines.length === 0) return null;

  // Try exact match first
  const exactIndex = source.indexOf(content);
  if (exactIndex !== -1) {
    // Count newlines before the match to get the start line
    const prefix = source.substring(0, exactIndex);
    const startLine = (prefix.match(/\n/g) || []).length + 1;
    const endLine = startLine + searchLines.length - 1;
    return { startLine, endLine };
  }

  // Try normalized whitespace match
  const normalizedSearch = searchLines.map(l => l.trim()).join('\n');
  for (let i = 0; i <= sourceLines.length - searchLines.length; i++) {
    const candidate = sourceLines
      .slice(i, i + searchLines.length)
      .map(l => l.trim())
      .join('\n');
    if (candidate === normalizedSearch) {
      return { startLine: i + 1, endLine: i + searchLines.length };
    }
  }

  return null;
}

/**
 * Find the line range of a regex pattern match in the source.
 * Returns 1-based line numbers.
 */
function findPatternRange(source: string, pattern: RegExp): { startLine: number; endLine: number } | null {
  const match = source.match(pattern);
  if (!match || match.index === undefined) return null;

  const prefix = source.substring(0, match.index);
  const startLine = (prefix.match(/\n/g) || []).length + 1;
  const matchedText = match[0];
  const endLine = startLine + (matchedText.match(/\n/g) || []).length;
  return { startLine, endLine };
}

/**
 * Locate an edit target in a file using the given options.
 *
 * Supports multiple strategies:
 * - symbolName: AST-based symbol lookup
 * - content: exact text matching
 * - pattern: regex matching
 * - lineRange: direct line specification
 *
 * @param filePath - Absolute path to the file
 * @param options - Location strategy options
 * @returns EditTarget if found, null otherwise
 */
export async function locateEditTarget(
  filePath: string,
  options: LocateOptions
): Promise<EditTarget | null> {
  let source: string;
  try {
    source = await fs.readFile(filePath, 'utf8');
  } catch {
    return null;
  }

  const lines = source.split('\n');
  const totalLines = lines.length;

  // Strategy 1: Find by symbol name using AST
  if (options.symbolName) {
    const parseResult = await parseFile(filePath);
    if (parseResult) {
      const symbols = extractSymbols(parseResult);
      let matches = findSymbolByName(symbols, options.symbolName);

      // Filter by symbol kind if specified
      if (options.symbolKind) {
        matches = matches.filter(s => s.kind === options.symbolKind);
      }

      if (matches.length > 0) {
        const symbol = matches[0];
        // tree-sitter uses 0-based line numbers; convert to 1-based
        const startLine = symbol.startLine + 1;
        const endLine = symbol.endLine + 1;

        return {
          filePath,
          startLine,
          endLine,
          symbolName: symbol.name,
          symbolKind: symbol.kind,
          content: extractLines(source, startLine, endLine),
        };
      }
    }

    // Fallback: try text-based search for the symbol name
    const namePattern = new RegExp(
      `(?:function|class|interface|type|enum|const|let|var|def)\\s+${escapeRegex(options.symbolName)}\\b`,
      'm'
    );
    const range = findPatternRange(source, namePattern);
    if (range) {
      return {
        filePath,
        startLine: range.startLine,
        endLine: range.endLine,
        symbolName: options.symbolName,
        content: extractLines(source, range.startLine, range.endLine),
      };
    }

    return null;
  }

  // Strategy 2: Find by exact content
  if (options.content) {
    const range = findContentRange(source, options.content);
    if (range) {
      return {
        filePath,
        startLine: range.startLine,
        endLine: range.endLine,
        content: extractLines(source, range.startLine, range.endLine),
      };
    }
    return null;
  }

  // Strategy 3: Find by regex pattern
  if (options.pattern) {
    const range = findPatternRange(source, options.pattern);
    if (range) {
      return {
        filePath,
        startLine: range.startLine,
        endLine: range.endLine,
        content: extractLines(source, range.startLine, range.endLine),
      };
    }
    return null;
  }

  // Strategy 4: Find by line range
  if (options.lineRange) {
    const { start, end } = options.lineRange;
    if (start < 1 || end < start || end > totalLines) {
      return null;
    }
    return {
      filePath,
      startLine: start,
      endLine: end,
      content: extractLines(source, start, end),
    };
  }

  return null;
}

/**
 * Locate multiple edit targets in a single file.
 *
 * @param filePath - Absolute path to the file
 * @param optionsList - List of location strategies
 * @returns Array of found edit targets
 */
export async function locateMultipleTargets(
  filePath: string,
  optionsList: LocateOptions[]
): Promise<EditTarget[]> {
  const results: EditTarget[] = [];

  for (const options of optionsList) {
    const target = await locateEditTarget(filePath, options);
    if (target) {
      results.push(target);
    }
  }

  return results;
}

/**
 * Escape special regex characters in a string.
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
