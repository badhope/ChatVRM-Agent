/**
 * Token Budget Management
 *
 * Manages token budget for repo map generation.
 * Provides utilities for estimating token counts and formatting
 * symbol entries within a configurable budget.
 */

import * as path from 'path';
import type { CodeSymbol } from './symbols.js';
import { estimateTokens } from '../utils/tokens.js';

/** Default maximum token budget */
const DEFAULT_MAX_TOKENS = 4096;

/** Maximum length for a single signature line */
const MAX_SIGNATURE_LENGTH = 120;

/**
 * Token budget tracker.
 *
 * Tracks how many tokens have been used and provides methods
 * to check if new content will fit within the budget.
 */
export interface TokenBudget {
  /** Maximum tokens allowed */
  maxTokens: number;
  /** Tokens currently used */
  usedTokens: number;
  /** Remaining tokens available */
  remaining(): number;
  /** Check if estimated tokens can fit */
  canFit(estimate: number): boolean;
  /** Allocate tokens from the budget, returns actual allocated amount */
  allocate(estimate: number): number;
}

/**
 * Create a new token budget.
 *
 * @param maxTokens - Maximum tokens allowed (default: 4096)
 */
export function createTokenBudget(maxTokens: number = DEFAULT_MAX_TOKENS): TokenBudget {
  let usedTokens = 0;

  return {
    maxTokens,
    get usedTokens(): number {
      return usedTokens;
    },
    set usedTokens(value: number) {
      usedTokens = value;
    },
    remaining(): number {
      return Math.max(0, this.maxTokens - usedTokens);
    },
    canFit(estimate: number): boolean {
      return usedTokens + estimate <= this.maxTokens;
    },
    allocate(estimate: number): number {
      const available = this.remaining();
      if (estimate <= available) {
        usedTokens += estimate;
        return estimate;
      }
      // Allocate whatever is left
      usedTokens = this.maxTokens;
      return available;
    },
  };
}

/**
 * Estimate the number of tokens in a text string.
 *
 * Uses the canonical token estimation from utils/tokens.js which handles
 * Chinese (1.5 tokens/char) and English (0.25 tokens/char) separately
 * for more accurate estimation.
 *
 * @param text - The text to estimate tokens for
 * @returns Estimated token count
 */
export { estimateTokens } from '../utils/tokens.js';

/**
 * Estimate tokens for repo map content.
 *
 * Uses a simpler heuristic optimized for the structured format
 * of repo map output (4 chars/token approximation).
 * This is suitable for budgeting purposes where approximate accuracy suffices.
 *
 * @param text - The repo map text to estimate tokens for
 * @returns Estimated token count
 */
export function estimateTokensForMap(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Format a single symbol entry for the repo map.
 *
 * Output format: `  kind name: signature`
 *
 * @param symbol - The code symbol to format
 * @param source - The source code (used to extract signature if not present)
 * @returns Formatted symbol entry string
 */
export function formatSymbolEntry(symbol: CodeSymbol, source: string): string {
  const kindPrefix = formatSymbolKind(symbol.kind);
  const name = symbol.name;

  let signature = symbol.signature || '';
  if (!signature && source) {
    signature = extractSignatureFromSource(symbol, source);
  }

  // Truncate long signatures
  if (signature.length > MAX_SIGNATURE_LENGTH) {
    signature = signature.substring(0, MAX_SIGNATURE_LENGTH - 3) + '...';
  }

  if (signature) {
    return `  ${kindPrefix} ${name}: ${signature}`;
  }
  return `  ${kindPrefix} ${name}`;
}

/**
 * Format a file's symbols as a repo map section.
 *
 * Output format:
 * ```
 * filepath.ext
 *   kind name1: signature1
 *   kind name2: signature2
 * ```
 *
 * @param filePath - The file path (will use relative path if possible)
 * @param symbols - Symbols to include in the map
 * @param source - Source code for signature extraction
 * @param rootDir - Optional root directory for relative path computation
 * @returns Formatted file map section
 */
export function formatFileMap(
  filePath: string,
  symbols: CodeSymbol[],
  source: string,
  rootDir?: string
): string {
  const displayPath = rootDir
    ? path.relative(rootDir, filePath)
    : filePath;

  const lines: string[] = [displayPath];

  for (const symbol of symbols) {
    lines.push(formatSymbolEntry(symbol, source));
  }

  return lines.join('\n');
}

/**
 * Format a symbol kind as a short prefix.
 */
function formatSymbolKind(kind: string): string {
  const prefixes: Record<string, string> = {
    function: 'fn',
    class: 'class',
    interface: 'iface',
    type: 'type',
    enum: 'enum',
    variable: 'var',
    method: 'method',
    property: 'prop',
    namespace: 'ns',
  };
  return prefixes[kind] || kind;
}

/**
 * Extract a signature from source code for a symbol.
 *
 * Falls back to reading the source line at the symbol's start position.
 */
function extractSignatureFromSource(symbol: CodeSymbol, source: string): string {
  const lines = source.split('\n');
  const lineIndex = symbol.startLine;

  if (lineIndex >= 0 && lineIndex < lines.length) {
    let line = lines[lineIndex].trim();

    // For functions/methods, try to capture the full signature including parameters
    if (symbol.kind === 'function' || symbol.kind === 'method') {
      // Find the opening brace or end of signature
      const braceIndex = line.indexOf('{');
      if (braceIndex > 0) {
        line = line.substring(0, braceIndex).trim();
      }
      // Find the arrow for arrow functions
      const arrowIndex = line.indexOf('=>');
      if (arrowIndex > 0) {
        line = line.substring(0, arrowIndex).trim();
      }
      // Remove return type annotation for brevity
      const colonIndex = line.lastIndexOf(':');
      if (colonIndex > 0) {
        // Make sure it's not inside a generic
        const openAngle = line.indexOf('<');
        const closeAngle = line.lastIndexOf('>');
        if (openAngle < 0 || closeAngle < colonIndex) {
          line = line.substring(0, colonIndex).trim();
        }
      }
    }

    // Truncate if still too long
    if (line.length > MAX_SIGNATURE_LENGTH) {
      line = line.substring(0, MAX_SIGNATURE_LENGTH - 3) + '...';
    }

    return line;
  }

  return '';
}
