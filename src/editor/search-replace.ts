/**
 * Aider-style SEARCH/REPLACE block parser and executor
 *
 * Parses SEARCH/REPLACE blocks from LLM output and applies them to files.
 * Supports the standard Aider format with <<<<<<< SEARCH / ======= / >>>>>>> REPLACE
 * markers, as well as a simpler format for direct search/replace pairs.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { locateEditTarget } from './edit-target.js';
import type { EditTarget } from './edit-target.js';
import { applyEdit, applyMultipleEdits, generateDiff } from './diff-generator.js';
import type { EditOperation, DiffResult } from './diff-generator.js';
import {
  parseSearchReplaceBlocks,
  type SearchReplaceBlock,
} from './search-replace/parser.js';
import { normalizeContent } from './search-replace/normalizer.js';
import { getErrorMessage } from '../utils/error-handling.js';

export { SearchReplaceBlock };
export type { SearchReplaceBlock as SearchReplaceBlockType };

/** Result of executing a SEARCH/REPLACE block */
export interface SearchReplaceResult {
  /** Whether the block was valid */
  success: boolean;
  /** File path that was targeted */
  filePath: string;
  /** Whether the edit was actually applied */
  applied: boolean;
  /** Error message if unsuccessful */
  error?: string;
  /** Unified diff of the change */
  diff?: string;
  /** Original content before the edit */
  originalContent?: string;
  /** New content after the edit */
  newContent?: string;
}

export { parseSearchReplaceBlocks };

/**
 * Find the search content within the source and return an EditTarget.
 */
function findSearchTarget(
  filePath: string,
  source: string,
  search: string,
  isRegex?: boolean
): EditTarget | null {
  const lines = source.split('\n');

  if (isRegex) {
    // Regex search
    const pattern = new RegExp(search, 'm');
    const match = source.match(pattern);
    if (!match || match.index === undefined) return null;

    const prefix = source.substring(0, match.index);
    const startLine = (prefix.match(/\n/g) || []).length + 1;
    const matchedText = match[0];
    const endLine = startLine + (matchedText.match(/\n/g) || []).length;

    return {
      filePath,
      startLine,
      endLine,
      content: matchedText,
    };
  }

  // Exact match - try raw first
  const exactIndex = source.indexOf(search);
  if (exactIndex !== -1) {
    const prefix = source.substring(0, exactIndex);
    const startLine = (prefix.match(/\n/g) || []).length + 1;
    const searchLines = search.split('\n');
    const endLine = startLine + searchLines.length - 1;

    return {
      filePath,
      startLine,
      endLine,
      content: search,
    };
  }

  // Try normalized whitespace match
  const normalizedSearch = normalizeContent(search);
  if (!normalizedSearch) return null;

  const normalizedSearchLines = normalizedSearch.split('\n');

  for (let i = 0; i <= lines.length - normalizedSearchLines.length; i++) {
    const candidate = lines.slice(i, i + normalizedSearchLines.length);
    const normalizedCandidate = normalizeContent(candidate.join('\n'));

    if (normalizedCandidate === normalizedSearch) {
      return {
        filePath,
        startLine: i + 1,
        endLine: i + normalizedSearchLines.length,
        content: candidate.join('\n'),
      };
    }
  }

  return null;
}

/**
 * Execute a single SEARCH/REPLACE block against a file.
 *
 * @param block - The parsed SEARCH/REPLACE block
 * @param filePath - The file path to apply the edit to
 * @returns SearchReplaceResult with success/failure info and diff
 */
export async function executeSearchReplace(
  block: SearchReplaceBlock,
  filePath: string
): Promise<SearchReplaceResult> {
  const targetPath = block.filePath || filePath;

  let source: string;
  try {
    source = await fs.readFile(targetPath, 'utf8');
  } catch {
    return {
      success: false,
      filePath: targetPath,
      applied: false,
      error: `File not found: ${targetPath}`,
    };
  }

  // Find the search content in the file
  const target = findSearchTarget(targetPath, source, block.search, block.isRegex);
  if (!target) {
    return {
      success: false,
      filePath: targetPath,
      applied: false,
      error: `Search content not found in ${targetPath}`,
    };
  }

  // Create and apply the edit operation
  const operation: EditOperation = {
    target,
    replacement: block.replace,
    description: 'SEARCH/REPLACE edit',
  };

  try {
    const newContent = applyEdit(source, operation);
    const diffResult = generateDiff(operation);

    // Write the new content to the file
    await fs.writeFile(targetPath, newContent, 'utf8');

    return {
      success: true,
      filePath: targetPath,
      applied: true,
      diff: diffResult.unifiedDiff,
      originalContent: source,
      newContent,
    };
  } catch (err: unknown) {
    return {
      success: false,
      filePath: targetPath,
      applied: false,
      error: getErrorMessage(err),
    };
  }
}

/**
 * Execute multiple SEARCH/REPLACE blocks.
 *
 * Groups blocks by file path and applies all edits to each file
 * in a single pass (bottom-up to preserve line numbers).
 *
 * @param blocks - Array of SEARCH/REPLACE blocks to execute
 * @param baseDir - Optional base directory for resolving relative file paths
 * @returns Array of SearchReplaceResult, one per block
 */
export async function executeMultipleSearchReplace(
  blocks: SearchReplaceBlock[],
  baseDir?: string
): Promise<SearchReplaceResult[]> {
  // Group blocks by file path
  const fileGroups = new Map<string, SearchReplaceBlock[]>();
  for (const block of blocks) {
    const blockPath = block.filePath || '';
    const resolvedPath = baseDir && blockPath
      ? path.resolve(baseDir, blockPath)
      : blockPath;
    const key = resolvedPath || '__default__';

    const groupBlocks = fileGroups.get(key);
    if (groupBlocks) {
      groupBlocks.push(block);
    } else {
      fileGroups.set(key, [block]);
    }
  }

  const results: SearchReplaceResult[] = [];

  for (const [fileKey, groupBlocks] of fileGroups) {
    const filePath = fileKey === '__default__' ? '' : fileKey;

    if (!filePath) {
      // No file path available - report error for each block
      for (const block of groupBlocks) {
        results.push({
          success: false,
          filePath: block.filePath || '',
          applied: false,
          error: 'No file path specified and no default file path provided',
        });
      }
      continue;
    }

    let source: string;
    try {
      source = await fs.readFile(filePath, 'utf8');
    } catch {
      for (const block of groupBlocks) {
        results.push({
          success: false,
          filePath,
          applied: false,
          error: `File not found: ${filePath}`,
        });
      }
      continue;
    }

    // Build all edit operations for this file
    const operations: EditOperation[] = [];
    let allFound = true;
    const blockTargets: Array<{ block: SearchReplaceBlock; target: EditTarget }> = [];

    for (const block of groupBlocks) {
      const target = findSearchTarget(filePath, source, block.search, block.isRegex);
      if (!target) {
        allFound = false;
        results.push({
          success: false,
          filePath,
          applied: false,
          error: `Search content not found in ${filePath}`,
        });
        continue;
      }
      blockTargets.push({ block, target });
      operations.push({
        target,
        replacement: block.replace,
        description: 'SEARCH/REPLACE edit',
      });
    }

    if (operations.length === 0) continue;

    try {
      const newContent = applyMultipleEdits(source, operations);
      const diffs = operations.map(op => generateDiff(op));
      const combinedDiff = diffs.map(d => d.unifiedDiff).join('\n');

      // Write the new content
      await fs.writeFile(filePath, newContent, 'utf8');

      // Report success for each block that had a valid target
      for (let idx = 0; idx < blockTargets.length; idx++) {
        results.push({
          success: true,
          filePath,
          applied: true,
          diff: diffs[idx]?.unifiedDiff,
          originalContent: source,
          newContent,
        });
      }
    } catch (err: unknown) {
      for (const { block } of blockTargets) {
        results.push({
          success: false,
          filePath,
          applied: false,
          error: getErrorMessage(err),
        });
      }
    }
  }

  return results;
}
