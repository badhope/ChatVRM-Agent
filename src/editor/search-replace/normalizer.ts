/**
 * Content normalization utilities for SEARCH/REPLACE blocks
 */

import { normalizeContent } from './parser.js';

/**
 * Normalize whitespace in content by removing leading/trailing blank lines
 * and standardizing indentation.
 *
 * This helps handle cases where LLM output has different indentation
 * than the actual file content.
 */
export function normalizeWhitespace(content: string): string {
  return normalizeContent(content);
}

/**
 * Strip blank lines from the beginning and end of content.
 */
export function stripBlankLines(content: string): string {
  const lines = content.split('\n');

  let start = 0;
  while (start < lines.length && lines[start].trim() === '') {
    start++;
  }

  let end = lines.length;
  while (end > start && lines[end - 1].trim() === '') {
    end--;
  }

  return lines.slice(start, end).join('\n');
}

/**
 * Detect the common indentation level of non-empty lines.
 * Returns the minimum indentation found.
 */
export function detectIndentation(content: string): number {
  const lines = content.split('\n');
  const nonEmpty = lines.filter(l => l.trim() !== '');

  if (nonEmpty.length === 0) return 0;

  const indentSizes = nonEmpty.map(l => {
    const match = l.match(/^(\s*)/);
    return match ? match[1].length : 0;
  });

  return Math.min(...indentSizes);
}

/**
 * Remove common indentation from content.
 * Keeps internal relative indentation intact.
 */
export function removeCommonIndent(content: string): string {
  const lines = content.split('\n');

  // Remove leading and trailing blank lines first
  let start = 0;
  while (start < lines.length && lines[start].trim() === '') start++;
  let end = lines.length;
  while (end > start && lines[end - 1].trim() === '') end--;

  const trimmed = lines.slice(start, end);

  if (trimmed.length === 0) return '';

  // Detect common indentation
  const commonIndent = detectIndentation(trimmed.join('\n'));

  // Remove common indentation
  const normalized = trimmed.map(l => {
    if (l.trim() === '') return '';
    return l.substring(commonIndent);
  });

  return normalized.join('\n');
}

export { normalizeContent };
