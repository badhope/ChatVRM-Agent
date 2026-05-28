/**
 * Code parsing engine (ts-morph based)
 *
 * Simplified engine using ts-morph for TypeScript code analysis.
 * Maintains backward compatibility while providing enhanced capabilities.
 */

import { parseFileWithTsMorph, type EnhancedParseResult } from './ts-morph-extractor.js';
import { parseCache } from './cache.js';
import type { LanguageInfo } from './languages.js';
import { getLanguageByFilePath } from './languages.js';

/**
 * Parse result interface maintaining backward compatibility
 */
export interface ParseResult {
  /** Original source code */
  source: string;
  /** Language information */
  language: LanguageInfo | null;
  /** Extracted symbols (backward compatible format) */
  symbols: SymbolInfo[];
  /** Enhanced parse result from ts-morph (when available) */
  enhanced?: EnhancedParseResult;
}

/**
 * Symbol information (simplified format)
 */
export interface SymbolInfo {
  name: string;
  type: 'function' | 'class' | 'interface' | 'variable' | 'unknown';
  line: number;
  column: number;
}

/**
 * Parse a single file
 * @param filePath Absolute file path
 * @param source Optional source code (avoids disk read)
 */
export async function parseFile(filePath: string, source?: string): Promise<ParseResult> {
  const cacheKey = filePath;

  // Check cache first
  const cached = parseCache.get(cacheKey);
  if (cached) {
    return cached as ParseResult;
  }

  try {
    // Use ts-morph for enhanced parsing
    const enhanced = await parseFileWithTsMorph(filePath, source);

    // Convert to backward compatible format
    const symbols: SymbolInfo[] = enhanced.symbols.map((sym) => ({
      name: sym.name,
      type: sym.kind as unknown as 'function' | 'class' | 'interface' | 'variable' | 'unknown',
      line: sym.startLine,
      column: sym.startColumn,
    }));

    const result: ParseResult = {
      source: enhanced.source,
      language: getLanguageByFilePath(filePath),
      symbols,
      enhanced,
    };

    // Cache the result
    parseCache.set(cacheKey, result);
    return result;
  } catch (error) {
    // Fallback: basic text-only parsing
    const fallbackSource = source || '';
    const result: ParseResult = {
      source: fallbackSource,
      language: getLanguageByFilePath(filePath),
      symbols: [],
    };

    parseCache.set(cacheKey, result);
    return result;
  }
}

/**
 * Parse multiple files (for backward compatibility)
 * @param filePaths Array of absolute file paths
 */
export async function parseFiles(filePaths: string[]): Promise<Map<string, ParseResult>> {
  const results = new Map<string, ParseResult>();

  for (const filePath of filePaths) {
    try {
      const result = await parseFile(filePath);
      results.set(filePath, result);
    } catch {
      // Skip failed files
    }
  }

  return results;
}

/**
 * Clear parse cache
 */
export function clearCache(): void {
  parseCache.clear();
}
