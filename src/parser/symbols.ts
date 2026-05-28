/**
 * Symbol extractor (ts-morph based)
 *
 * Unified symbol extraction providing backward compatibility while using ts-morph.
 */

import type { ParseResult } from './engine.js';
export type SymbolKind =
  | 'function'
  | 'class'
  | 'interface'
  | 'type'
  | 'enum'
  | 'variable'
  | 'method'
  | 'property'
  | 'module'
  | 'namespace'
  | 'import'
  | 'export';

export interface CodeSymbol {
  name: string;
  kind: SymbolKind;
  filePath: string;
  startLine: number;
  endLine: number;
  signature?: string;
  parent?: string;
  nestingLevel?: number;
}

/**
 * Extract symbols from parse result
 * @param result Parse result from engine
 * @param filePath Optional file path for backward compatibility
 */
export function extractSymbols(result: ParseResult, filePath: string = ''): CodeSymbol[] {
  // If we have enhanced parse result, use it
  if (result.enhanced) {
    return result.enhanced.symbols.map((sym): CodeSymbol => ({
      name: sym.name,
      kind: sym.kind,
      filePath: sym.filePath,
      startLine: sym.startLine,
      endLine: sym.endLine,
      signature: sym.signature,
      parent: sym.parent,
    }));
  }

  // Fallback: convert simplified symbols
  return result.symbols.map((sym): CodeSymbol => ({
    name: sym.name,
    kind: sym.type as SymbolKind,
    filePath,
    startLine: sym.line,
    endLine: sym.line,
  }));
}

/**
 * Get symbols within a line range
 */
export function getSymbolsInRange(
  symbols: CodeSymbol[],
  startLine: number,
  endLine: number
): CodeSymbol[] {
  return symbols.filter((s) => s.startLine >= startLine && s.endLine <= endLine);
}

/**
 * Find symbols by name
 */
export function findSymbolByName(symbols: CodeSymbol[], name: string): CodeSymbol[] {
  const lower = name.toLowerCase();
  return symbols.filter((s) => s.name.toLowerCase().includes(lower));
}
