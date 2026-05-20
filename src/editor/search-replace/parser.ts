/**
 * Parser for Aider-style SEARCH/REPLACE blocks
 *
 * Parses SEARCH/REPLACE blocks from LLM output.
 * Supports the standard Aider format with <<<<<<< SEARCH / ======= / >>>>>>> REPLACE
 * markers, as well as a simpler legacy format.
 */

/** A single SEARCH/REPLACE block */
export interface SearchReplaceBlock {
  /** Optional file path (defaults to current file context) */
  filePath?: string;
  /** The exact content to search for */
  search: string;
  /** The replacement content */
  replace: string;
  /** If true, search is treated as a regex pattern */
  isRegex?: boolean;
}

/** Markers for the Aider-style SEARCH/REPLACE format */
const SEARCH_MARKER = '<<<<<<< SEARCH';
const SPLIT_MARKER = '=======';
const REPLACE_MARKER = '>>>>>>> REPLACE';

/**
 * Parse Aider-style SEARCH/REPLACE blocks from LLM output text.
 *
 * Supports two formats:
 *
 * 1. Full Aider format with optional file path header:
 * ```
 * filePath.ts
 * <<<<<<< SEARCH
 * old content
 * =======
 * new content
 * >>>>>>> REPLACE
 * ```
 *
 * 2. Consecutive blocks without file path (uses default):
 * ```
 * <<<<<<< SEARCH
 * old content
 * =======
 * new content
 * >>>>>>> REPLACE
 * ```
 *
 * Also supports the legacy triple-angle format:
 * ```
 * <<<SEARCH>>>
 * old content
 * <<<REPLACE>>>
 * new content
 * <<<END>>>
 * ```
 *
 * @param text - The LLM output text containing SEARCH/REPLACE blocks
 * @returns Array of parsed SearchReplaceBlock objects
 */
export function parseSearchReplaceBlocks(text: string): SearchReplaceBlock[] {
  // Try Aider-style format first
  const aiderBlocks = parseAiderFormat(text);
  if (aiderBlocks.length > 0) {
    return aiderBlocks;
  }

  // Try legacy format
  const legacyBlocks = parseLegacyFormat(text);
  if (legacyBlocks.length > 0) {
    return legacyBlocks;
  }

  return [];
}

/**
 * Parse the standard Aider SEARCH/REPLACE format.
 */
export function parseAiderFormat(text: string): SearchReplaceBlock[] {
  const blocks: SearchReplaceBlock[] = [];
  const lines = text.split('\n');
  let i = 0;

  while (i < lines.length) {
    // Look for SEARCH marker
    if (lines[i].trim() === SEARCH_MARKER) {
      const searchStart = i + 1;
      let splitIdx = -1;
      let replaceIdx = -1;

      // Find SPLIT and REPLACE markers
      for (let j = searchStart; j < lines.length; j++) {
        if (lines[j].trim() === SPLIT_MARKER && splitIdx === -1) {
          splitIdx = j;
        } else if (lines[j].trim() === REPLACE_MARKER) {
          replaceIdx = j;
          break;
        }
      }

      if (splitIdx === -1 || replaceIdx === -1) {
        i++;
        continue;
      }

      const searchContent = lines.slice(searchStart, splitIdx).join('\n');
      const replaceContent = lines.slice(splitIdx + 1, replaceIdx).join('\n');

      // Check if there's a file path on the line before SEARCH marker
      let filePath: string | undefined;
      if (i > 0) {
        const prevLine = lines[i - 1].trim();
        // Heuristic: if the previous line looks like a file path
        if (prevLine && !prevLine.startsWith('#') && !prevLine.startsWith('```') &&
            (prevLine.includes('.') || prevLine.includes('/'))) {
          filePath = prevLine;
        }
      }

      blocks.push({
        filePath,
        search: searchContent,
        replace: replaceContent,
      });

      i = replaceIdx + 1;
    } else {
      i++;
    }
  }

  return blocks;
}

/**
 * Parse the legacy <<<SEARCH>>> / <<<REPLACE>>> / <<<END>>> format.
 */
export function parseLegacyFormat(text: string): SearchReplaceBlock[] {
  const blocks: SearchReplaceBlock[] = [];
  const searchRegex = /<<<SEARCH>>>\n([\s\S]*?)<<<REPLACE>>>\n([\s\S]*?)<<<END>>>/g;
  let match: RegExpExecArray | null;

  while ((match = searchRegex.exec(text)) !== null) {
    blocks.push({
      search: match[1],
      replace: match[2],
    });
  }

  return blocks;
}

/**
 * Normalize whitespace for content matching.
 *
 * Removes leading/trailing blank lines and normalizes indentation
 * to handle cases where the LLM output has different indentation
 * than the actual file content.
 */
export function normalizeContent(content: string): string {
  const lines = content.split('\n');

  // Remove leading and trailing blank lines
  let start = 0;
  while (start < lines.length && lines[start].trim() === '') start++;
  let end = lines.length;
  while (end > start && lines[end - 1].trim() === '') end--;

  const trimmed = lines.slice(start, end);

  if (trimmed.length === 0) return '';

  // Detect common indentation
  const nonEmpty = trimmed.filter(l => l.trim() !== '');
  if (nonEmpty.length === 0) return '';

  const indentSizes = nonEmpty.map(l => {
    const match = l.match(/^(\s*)/);
    return match ? match[1].length : 0;
  });
  const commonIndent = Math.min(...indentSizes);

  // Remove common indentation
  const normalized = trimmed.map(l => {
    if (l.trim() === '') return '';
    return l.substring(commonIndent);
  });

  return normalized.join('\n');
}
