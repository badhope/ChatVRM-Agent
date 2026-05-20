// ============================================================
// Glob Pattern Utilities - backed by minimatch (via glob)
// ============================================================

import { Minimatch, makeRe } from 'minimatch';

/**
 * Convert a glob pattern to a RegExp string.
 *
 * Uses minimatch's makeRe to produce a regex source string,
 * then strips anchors (^/$) to match the previous output contract.
 *
 * @param pattern - Glob pattern
 * @returns A regex source string (without anchors)
 */
export function globToRegex(pattern: string): string {
  const re = makeRe(pattern);
  // minimatch may return false for invalid patterns; fall back to escaping.
  if (!re) {
    return pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  let source = re.source;
  // Strip leading ^ and trailing $ anchors that minimatch adds
  if (source.startsWith('^')) {
    source = source.slice(1);
  }
  if (source.endsWith('$')) {
    source = source.slice(0, -1);
  }
  return source;
}

/**
 * Test whether str matches the given glob pattern.
 *
 * @param str     - The string to test
 * @param pattern - Glob pattern
 * @returns true when the string matches
 */
export function globMatch(str: string, pattern: string): boolean {
  const mm = new Minimatch(pattern);
  return mm.match(str);
}

/**
 * Check if a file path matches any of the given glob patterns.
 *
 * @param filePath - The file path to check
 * @param patterns - Array of glob patterns
 * @returns true if the file path matches any pattern
 */
export function matchesAnyGlob(filePath: string, patterns: string[]): boolean {
  const normalized = filePath.replace(/\\/g, '/');
  for (const pattern of patterns) {
    const mm = new Minimatch(pattern);
    if (mm.match(normalized)) {
      return true;
    }
  }
  return false;
}
