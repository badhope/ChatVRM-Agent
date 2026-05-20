// ============================================================
// Token estimation - backed by js-tiktoken (cl100k_base)
// ============================================================

import { encodingForModel, type Tiktoken } from 'js-tiktoken';

/**
 * Simple tokenizer: split on whitespace/punctuation, lowercase, deduplicate.
 */
export function tokenize(text: string): string[] {
  if (!text) return [];
  return [...new Set(
    text.toLowerCase()
      .replace(/[^\w\u4e00-\u9fff]+/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 1),
  )];
}

// ------------------------------------------------------------------
// js-tiktoken singleton (lazy-initialised)
// ------------------------------------------------------------------

let tokenizerInstance: Tiktoken | null = null;

/**
 * Create the cl100k_base tokenizer synchronously.
 *
 * The tokenizer loads WASM data on first call so we defer
 * construction until the first call to estimateTokens.
 */
function initTokenizer(): Tiktoken {
  return encodingForModel('gpt-4' as Parameters<typeof encodingForModel>[0]);
}

// ------------------------------------------------------------------
// Fallback estimation (character-based heuristic)
// ------------------------------------------------------------------

/**
 * Legacy character-based token estimation.
 *
 * Chinese characters ~1.5 tokens each, ASCII ~0.25 tokens each.
 */
function fallbackEstimate(text: string): number {
  let tokens = 0;
  for (const char of text) {
    if (/[\u4e00-\u9fff]/.test(char)) {
      tokens += 1.5;
    } else {
      tokens += 0.25;
    }
  }
  return Math.ceil(tokens);
}

// ------------------------------------------------------------------
// Public API
// ------------------------------------------------------------------

/**
 * Estimate the number of tokens in text.
 *
 * Uses js-tiktoken with the cl100k_base encoding (covers GPT-4 / GPT-3.5).
 * Falls back to the legacy character-based heuristic when tiktoken fails
 * (e.g. WASM not available in the current environment).
 *
 * @param text - Input string to measure
 * @returns Estimated token count (always an integer >= 0)
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;

  // Lazy-init the tokenizer on first call
  if (!tokenizerInstance) {
    try {
      tokenizerInstance = initTokenizer();
    } catch {
      return fallbackEstimate(text);
    }
  }

  try {
    const encoded = tokenizerInstance.encode(text);
    return encoded.length;
  } catch {
    return fallbackEstimate(text);
  }
}

/**
 * Asynchronous version that always initialises the tokenizer.
 *
 * Use this when accuracy matters more than synchronous convenience.
 */
export async function estimateTokensAsync(text: string): Promise<number> {
  if (!text) return 0;

  try {
    if (!tokenizerInstance) {
      tokenizerInstance = initTokenizer();
    }
    const encoded = tokenizerInstance.encode(text);
    return encoded.length;
  } catch {
    return fallbackEstimate(text);
  }
}
