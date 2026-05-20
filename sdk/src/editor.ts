/**
 * DevFlow Agent SDK - Editor Module
 *
 * Provides programmatic access to the code editing capabilities
 * of DevFlow Agent, implementing the SEARCH/REPLACE pattern.
 */

import type { EditOptions, EditResult, SymbolLocation, SymbolReference } from './types.js';

/**
 * DevFlowEditor - Code editing operations.
 *
 * @example
 * ```typescript
 * const editor = new DevFlowEditor();
 * await editor.edit({
 *   filePath: './src/app.ts',
 *   search: 'function oldName()',
 *   replace: 'function newName()'
 * });
 * ```
 */
export class DevFlowEditor {
  /**
   * Perform a SEARCH/REPLACE edit on a file.
   *
   * @param options - Edit options
   * @returns Edit result with diff
   */
  async edit(options: EditOptions): Promise<EditResult> {
    const fs = await import('fs/promises');

    try {
      const content = await fs.readFile(options.filePath, 'utf8');
      const lines = content.split('\n');

      // Find the search content
      const searchLines = options.search.split('\n');
      const startIndex = this.findSearchContent(lines, searchLines);

      if (startIndex === -1) {
        return {
          success: false,
          diff: `Search content not found in ${options.filePath}`,
        };
      }

      const endIndex = startIndex + searchLines.length;
      const replaceLines = options.replace.split('\n');

      // Generate diff
      const diff = this.generateDiff(
        options.filePath,
        lines,
        startIndex,
        endIndex,
        replaceLines,
        options.description
      );

      // Apply the edit
      const newLines = [
        ...lines.slice(0, startIndex),
        ...replaceLines,
        ...lines.slice(endIndex),
      ];

      await fs.writeFile(options.filePath, newLines.join('\n'), 'utf8');

      return {
        success: true,
        diff,
        additions: replaceLines.length,
        deletions: searchLines.length,
      };
    } catch (error) {
      return {
        success: false,
        diff: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Apply multiple edits to files.
   *
   * Edits are processed in order. If any edit fails,
   * subsequent edits are not applied.
   *
   * @param edits - Array of edit operations
   * @returns Results for each edit
   */
  async applyEdits(edits: EditOptions[]): Promise<{ success: boolean; diffs: string[] }> {
    const diffs: string[] = [];
    let allSuccess = true;

    for (const edit of edits) {
      const result = await this.edit(edit);
      diffs.push(result.diff);
      if (!result.success) {
        allSuccess = false;
      }
    }

    return { success: allSuccess, diffs };
  }

  /**
   * Locate a symbol in a file.
   *
   * @param filePath - File to search
   * @param symbolName - Name of the symbol
   * @returns Location or null if not found
   */
  async locateSymbol(filePath: string, symbolName: string): Promise<SymbolLocation | null> {
    const { locateEditTarget } = await import('../../dist/editor/edit-target.js');
    const fs = await import('fs/promises');

    try {
      const content = await fs.readFile(filePath, 'utf8');
      const target = await locateEditTarget(filePath, { symbolName });

      if (target) {
        return {
          line: target.startLine,
          column: 1,
        };
      }

      // Fallback: simple text search
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes(symbolName)) {
          const col = lines[i].indexOf(symbolName) + 1;
          return { line: i + 1, column: col };
        }
      }

      return null;
    } catch {
      return null;
    }
  }

  /**
   * Find all references to a symbol in a project.
   *
   * @param symbolName - Symbol to search for
   * @param rootDir - Project root directory
   * @returns Array of references
   */
  async findReferences(symbolName: string, rootDir: string): Promise<SymbolReference[]> {
    const { findReferences: coreFindReferences } = await import('../../dist/analysis/reference-finder.js');

    try {
      const refs = await coreFindReferences(symbolName, rootDir);
      return refs.references.map((r: any) => ({
        filePath: r.filePath,
        line: r.line,
      }));
    } catch {
      // Fallback: simple grep-based search
      return this.simpleFindReferences(symbolName, rootDir);
    }
  }

  /**
   * Create a new file with content.
   *
   * @param filePath - Path for the new file
   * @param content - File content
   */
  async createFile(filePath: string, content: string): Promise<void> {
    const fs = await import('fs/promises');
    const path = await import('path');

    // Ensure directory exists
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });

    await fs.writeFile(filePath, content, 'utf8');
  }

  /**
   * Read file content.
   *
   * @param filePath - Path to read
   * @returns File content
   */
  async readFile(filePath: string): Promise<string> {
    const fs = await import('fs/promises');
    return fs.readFile(filePath, 'utf8');
  }

  private findSearchContent(lines: string[], searchLines: string[]): number {
    for (let i = 0; i <= lines.length - searchLines.length; i++) {
      let match = true;
      for (let j = 0; j < searchLines.length; j++) {
        if (lines[i + j].trimEnd() !== searchLines[j].trimEnd()) {
          match = false;
          break;
        }
      }
      if (match) return i;
    }
    return -1;
  }

  private generateDiff(
    filePath: string,
    lines: string[],
    startIdx: number,
    endIdx: number,
    replaceLines: string[],
    description?: string
  ): string {
    const diffLines: string[] = [];

    diffLines.push(`--- a/${filePath}`);
    diffLines.push(`+++ b/${filePath}`);
    diffLines.push(`@@ -${startIdx + 1},${endIdx - startIdx} +${startIdx + 1},${replaceLines.length} @@`);

    if (description) {
      diffLines.push(`+ // ${description}`);
    }

    for (let i = startIdx; i < endIdx; i++) {
      diffLines.push(`-${lines[i]}`);
    }

    for (const line of replaceLines) {
      diffLines.push(`+${line}`);
    }

    return diffLines.join('\n') + '\n';
  }

  private async simpleFindReferences(symbolName: string, rootDir: string): Promise<SymbolReference[]> {
    const refs: SymbolReference[] = [];
    const fs = await import('fs/promises');
    const path = await import('path');

    const walk = async (dir: string): Promise<void> => {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory() && entry.name !== 'node_modules' && entry.name !== '.git') {
          await walk(fullPath);
        } else if (entry.isFile() && /\.(ts|tsx|js|jsx|py)$/.test(entry.name)) {
          try {
            const content = await fs.readFile(fullPath, 'utf8');
            const lines = content.split('\n');
            for (let i = 0; i < lines.length; i++) {
              if (lines[i].includes(symbolName)) {
                refs.push({ filePath: fullPath, line: i + 1 });
              }
            }
          } catch {}
        }
      }
    };

    try {
      await walk(rootDir);
    } catch {}

    return refs;
  }
}

/**
 * Convenience function to apply an edit.
 *
 * @param options - Edit options
 * @returns True if successful
 */
export async function applyEdit(options: EditOptions): Promise<boolean> {
  const editor = new DevFlowEditor();
  const result = await editor.edit(options);
  return result.success;
}
