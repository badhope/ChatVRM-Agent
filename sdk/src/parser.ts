/**
 * Personal Assistant Agent SDK - Parser Module
 *
 * Self-contained code parsing and analysis.
 * Uses regex-based parsing — no dependency on tree-sitter or external modules.
 */

import type { ParseResult, Symbol, RepoMapOptions, RepoMapResult } from './types.js';
import type { KnowledgeEntry, ContextBuildResult, ContextBuilderOptions } from './types.js';
import { PersonalAssistantError, formatError } from './errors.js';

/**
 * PersonalAssistantParser - Code parsing and analysis.
 *
 * @example
 * ```typescript
 * const parser = new PersonalAssistantParser();
 * const result = await parser.parseFile('./src/app.ts');
 * console.log(result.symbols);
 * ```
 */
export class PersonalAssistantParser {

  /**
   * Parse a source file and extract its structure.
   */
  async parseFile(filePath: string): Promise<ParseResult> {
    const fs = await import('fs/promises');

    try {
      const source = await fs.readFile(filePath, 'utf8');
      const language = this.detectLanguage(filePath);
      const symbols = this.extractSymbols(source, language);
      const tokens = this.estimateTokens(source);

      return { language, symbols, tokens, filePath };
    } catch {
      return { language: 'unknown', symbols: [], tokens: 0, filePath };
    }
  }

  /**
   * Parse source code string directly.
   */
  async parseSource(source: string, language: string): Promise<ParseResult> {
    const symbols = this.extractSymbols(source, language);
    const tokens = this.estimateTokens(source);
    return { language, symbols, tokens };
  }

  /**
   * Generate a repository map for context.
   */
  async generateRepoMap(rootDir: string, options?: RepoMapOptions): Promise<RepoMapResult> {
    const fs = await import('fs/promises');
    const path = await import('path');

    const IGNORE_DIRS = new Set([
      'node_modules', '.git', 'dist', 'build', 'coverage',
      '.next', '.cache', '.venv', 'venv', '__pycache__', 'target',
    ]);
    const CODE_EXTENSIONS = new Set([
      '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.py', '.go',
      '.rs', '.java', '.kt', '.c', '.cpp', '.h', '.cs', '.rb',
      '.php', '.swift', '.vue', '.svelte', '.sh', '.sql', '.html',
      '.css', '.json', '.yaml', '.yml', '.xml', '.toml', '.md',
    ]);

    const lines: string[] = [];
    let fileCount = 0;
    let symbolCount = 0;
    const skippedFiles: string[] = [];

    const walk = async (dir: string, depth: number): Promise<void> => {
      if (depth > 4) return;
      let entries;
      try {
        entries = await fs.readdir(dir, { withFileTypes: true });
      } catch {
        return;
      }

      for (const entry of entries) {
        if (IGNORE_DIRS.has(entry.name) || (entry.name.startsWith('.') && entry.name !== '.env.example')) {
          continue;
        }

        const fullPath = path.join(dir, entry.name);
        const indent = '  '.repeat(depth);

        if (entry.isDirectory()) {
          lines.push(`${indent}${entry.name}/`);
          await walk(fullPath, depth + 1);
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase();
          if (CODE_EXTENSIONS.has(ext)) {
            lines.push(`${indent}${entry.name}`);
            fileCount++;
          } else {
            skippedFiles.push(fullPath);
          }
        }
      }
    };

    await walk(rootDir, 0);

    const map = lines.join('\n');
    const tokenCount = this.estimateTokens(map);

    return { map, fileCount, symbolCount, tokenCount, skippedFiles };
  }

  /**
   * Extract symbols from source code (regex-based).
   */
  extractSymbols(source: string, language: string): Symbol[] {
    const symbols: Symbol[] = [];
    const lines = source.split('\n');

    const patterns: Record<string, RegExp> = {
      function: /^(?:export\s+)?(?:async\s+)?function\s+(\w+)/,
      class: /^(?:export\s+)?class\s+(\w+)/,
      interface: /^(?:export\s+)?interface\s+(\w+)/,
      type: /^(?:export\s+)?type\s+(\w+)/,
      enum: /^(?:export\s+)?enum\s+(\w+)/,
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      for (const [kind, pattern] of Object.entries(patterns)) {
        const match = line.match(pattern);
        if (match) {
          symbols.push({
            name: match[1],
            kind: kind as Symbol['kind'],
            startLine: i + 1,
            endLine: i + 1,
          });
        }
      }
    }

    return symbols;
  }

  /**
   * Get the language for a file path.
   */
  async getLanguage(filePath: string): Promise<string | null> {
    return this.detectLanguage(filePath);
  }

  private detectLanguage(filePath: string): string {
    const ext = filePath.split('.').pop()?.toLowerCase() ?? '';
    const map: Record<string, string> = {
      ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
      mjs: 'javascript', cjs: 'javascript', py: 'python', go: 'go',
      rs: 'rust', java: 'java', kt: 'kotlin', c: 'c', cpp: 'cpp',
      h: 'c', hpp: 'cpp', cs: 'csharp', rb: 'ruby', php: 'php',
      swift: 'swift', vue: 'vue', svelte: 'svelte', sh: 'shell',
      sql: 'sql', html: 'html', css: 'css', json: 'json',
      yaml: 'yaml', yml: 'yaml', xml: 'xml', toml: 'toml', md: 'markdown',
    };
    return map[ext] ?? 'unknown';
  }

  private estimateTokens(source: string): number {
    return Math.ceil(source.length / 4);
  }
}

/**
 * CodeIndexer - Placeholder.
 *
 * The main package does not ship a code indexer module.
 * This class is retained for API compatibility but throws on use.
 */
export class CodeIndexer {
  static async build(_rootDir: string): Promise<never> {
    throw new PersonalAssistantError(
      'CodeIndexer.build() is not available — the main package does not ship a code indexer module',
      'NOT_IMPLEMENTED',
      501,
    );
  }

  static search(): never {
    throw new PersonalAssistantError(
      'CodeIndexer.search() is not available — the main package does not ship a code indexer module',
      'NOT_IMPLEMENTED',
      501,
    );
  }
}

/**
 * Build a code index — not available.
 */
export async function buildCodeIndex(_rootDir: string): Promise<never> {
  throw new PersonalAssistantError(
    'buildCodeIndex() is not available — the main package does not ship a code indexer module',
    'NOT_IMPLEMENTED',
    501,
  );
}

/**
 * Search a code index — not available.
 */
export function searchIndex(): never {
  throw new PersonalAssistantError(
    'searchIndex() is not available — the main package does not ship a code indexer module',
    'NOT_IMPLEMENTED',
    501,
  );
}

/**
 * ContextBuilder — use @personal-assistant/sdk/agent's ContextBuilderWrapper instead.
 *
 * Retained for API compatibility but delegates to the agent module.
 */
export class ContextBuilder {
  async build(options: ContextBuilderOptions): Promise<ContextBuildResult> {
    const { ContextBuilderWrapper } = await import('./agent.js');
    const wrapper = new ContextBuilderWrapper();
    return wrapper.build(options);
  }

  async queryKnowledgeGraph(query: string): Promise<KnowledgeEntry[]> {
    const { ContextBuilderWrapper } = await import('./agent.js');
    const wrapper = new ContextBuilderWrapper();
    return wrapper.queryKnowledge(query);
  }

  clearCache(): void {
    // No-op
  }
}

/**
 * Convenience function to parse a file.
 */
export async function parseFile(filePath: string): Promise<ParseResult> {
  const parser = new PersonalAssistantParser();
  return parser.parseFile(filePath);
}

/**
 * Convenience function to generate a repo map.
 */
export async function generateRepoMap(rootDir: string): Promise<string> {
  const parser = new PersonalAssistantParser();
  const result = await parser.generateRepoMap(rootDir);
  return result.map;
}
