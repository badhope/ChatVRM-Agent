import fs from 'fs/promises';
import path from 'path';
import { RAGService } from '../domain/memory/rag.service.js';
import { KnowledgeGraph } from '../domain/memory/memory.service.js';
import type { IContextPort, BuildOptions, BuildResult, KnowledgeEntry } from '../ports/context.port.js';
import type { IStoragePort } from '../ports/storage.port.js';

const MAX_FILE_SIZE = 100_000;
const IGNORE_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'coverage', '.next', '.nuxt', '.cache', '.venv', 'venv', '__pycache__', 'target', '.idea', '.vscode']);
const IGNORE_FILES = new Set(['.DS_Store', 'package-lock.json', 'pnpm-lock.yaml', 'yarn.lock', 'bun.lockb']);
const CODE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.py', '.go', '.rs', '.java', '.kt', '.c', '.cpp', '.h', '.hpp', '.cs', '.rb', '.php', '.swift', '.vue', '.svelte', '.sh', '.bash', '.sql', '.html', '.css', '.scss', '.less', '.json', '.yaml', '.yml', '.xml', '.toml', '.md']);

export class ContextBuilder implements IContextPort {
  private storage: IStoragePort;
  private knowledgeGraph: KnowledgeGraph;
  private ragService: RAGService;

  constructor(storage: IStoragePort) {
    this.storage = storage;
    this.knowledgeGraph = new KnowledgeGraph();
    this.ragService = new RAGService(this.knowledgeGraph);
  }

  async build(options: BuildOptions): Promise<BuildResult> {
    const { rootDir, query, maxTokens = 8000, includeRepoMap = true, includeKnowledge = true, includeCodeSearch = true } = options;

    let context = '';
    let codeEntryCount = 0;
    let knowledgeEntryCount = 0;
    let repoMapIncluded = false;

    if (includeRepoMap) {
      const repoMap = await this.getRepoMapImpl(rootDir);
      if (repoMap) {
        context += `# Repository Structure\n\n${repoMap}\n\n`;
        repoMapIncluded = true;
      }
    }

    if (includeCodeSearch && query) {
      const codeContext = await this.searchCodeImpl(rootDir, query, Math.floor(maxTokens / 2));
      if (codeContext) {
        context += `# Code Search Results\n\n${codeContext}\n\n`;
        codeEntryCount = codeContext.split('\n').filter((l) => l.trim().startsWith('###')).length;
      }
    }

    if (includeKnowledge && query) {
      const knowledge = await this.queryKnowledge(query);
      if (knowledge.length > 0) {
        const knowledgeContext = knowledge
          .map((k) => `- [${k.type}] ${k.label} (relevance: ${k.relevance.toFixed(2)})${k.snippet ? `\n  ${k.snippet}` : ''}`)
          .join('\n');
        context += `# Knowledge Base\n\n${knowledgeContext}\n\n`;
        knowledgeEntryCount = knowledge.length;
      }
    }

    if (context.length > maxTokens * 4) {
      context = context.substring(0, maxTokens * 4) + '\n... (truncated)';
    }

    return {
      context,
      repoMapIncluded,
      codeEntryCount,
      knowledgeEntryCount,
    };
  }

  async queryKnowledge(query: string): Promise<KnowledgeEntry[]> {
    try {
      const results = await this.ragService.search({ query, topK: 10, minConfidence: 0 });
      return results.map((r) => ({
        id: r.entity.id,
        type: r.entity.type,
        label: r.entity.label,
        relevance: r.score,
        snippet: r.snippet,
      }));
    } catch {
      return [];
    }
  }

  async getRepoMap(): Promise<string> {
    return this.getRepoMapImpl(process.cwd());
  }

  private async getRepoMapImpl(rootDir: string): Promise<string> {
    const tree: string[] = [];
    try {
      await this.walkDir(rootDir, rootDir, tree, 0, 4);
      return tree.join('\n');
    } catch {
      return '';
    }
  }

  private async walkDir(baseDir: string, currentDir: string, tree: string[], depth: number, maxDepth: number): Promise<void> {
    if (depth > maxDepth) return;

    let entries;
    try {
      entries = await fs.readdir(currentDir, { withFileTypes: true });
    } catch {
      return;
    }

    entries.sort((a, b) => {
      if (a.isDirectory() && !b.isDirectory()) return -1;
      if (!a.isDirectory() && b.isDirectory()) return 1;
      return a.name.localeCompare(b.name);
    });

    for (const entry of entries) {
      if (IGNORE_DIRS.has(entry.name) || IGNORE_FILES.has(entry.name)) continue;
      if (entry.name.startsWith('.') && entry.name !== '.env.example' && entry.name !== '.gitignore') continue;

      const indent = '  '.repeat(depth);
      const prefix = entry.isDirectory() ? '📁' : '📄';
      tree.push(`${indent}${prefix} ${entry.name}`);

      if (entry.isDirectory()) {
        await this.walkDir(baseDir, path.join(currentDir, entry.name), tree, depth + 1, maxDepth);
      }
    }
  }

  private async searchCodeImpl(rootDir: string, query: string, maxTokens: number): Promise<string> {
    const queryTokens = query.toLowerCase().split(/\s+/).filter((t) => t.length >= 2);
    if (queryTokens.length === 0) return '';

    const matches: Array<{ file: string; line: number; content: string; score: number }> = [];

    try {
      const files = await this.collectCodeFiles(rootDir);
      for (const file of files) {
        if (matches.length >= 20) break;
        const content = await this.tryReadFile(file);
        if (!content) continue;

        const lines = content.split('\n');
        for (let i = 0; i < lines.length; i++) {
          const lower = lines[i].toLowerCase();
          let score = 0;
          for (const token of queryTokens) {
            if (lower.includes(token)) score += 1;
          }
          if (score > 0) {
            matches.push({ file: path.relative(rootDir, file), line: i + 1, content: lines[i].trim(), score });
            if (matches.length >= 20) break;
          }
        }
      }
    } catch {
      return '';
    }

    matches.sort((a, b) => b.score - a.score);
    const top = matches.slice(0, 10);

    if (top.length === 0) return '';

    const parts: string[] = [];
    let currentTokens = 0;
    for (const m of top) {
      const line = `### ${m.file}:${m.line}\n\`\`\`\n${m.content}\n\`\`\``;
      const lineTokens = Math.ceil(line.length / 4);
      if (currentTokens + lineTokens > maxTokens) break;
      parts.push(line);
      currentTokens += lineTokens;
    }
    return parts.join('\n\n');
  }

  private async collectCodeFiles(rootDir: string): Promise<string[]> {
    const files: string[] = [];
    const stack: Array<{ dir: string; depth: number }> = [{ dir: rootDir, depth: 0 }];

    while (stack.length > 0) {
      const { dir, depth } = stack.pop()!;
      if (depth > 6) continue;

      let entries;
      try {
        entries = await fs.readdir(dir, { withFileTypes: true });
      } catch {
        continue;
      }

      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (!IGNORE_DIRS.has(entry.name) && !entry.name.startsWith('.')) {
            stack.push({ dir: full, depth: depth + 1 });
          }
        } else if (entry.isFile()) {
          if (IGNORE_FILES.has(entry.name)) continue;
          const ext = path.extname(entry.name).toLowerCase();
          if (CODE_EXTENSIONS.has(ext)) {
            files.push(full);
            if (files.length >= 500) return files;
          }
        }
      }
    }
    return files;
  }

  private async tryReadFile(file: string): Promise<string | null> {
    try {
      const stat = await fs.stat(file);
      if (stat.size > MAX_FILE_SIZE) return null;
      return await fs.readFile(file, 'utf-8');
    } catch {
      return null;
    }
  }
}
