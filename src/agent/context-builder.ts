/**
 * Context Builder
 *
 * A unified context assembly utility that combines:
 * - Repo Map: Codebase structure overview
 * - Code Index: Searchable symbol index
 * - Knowledge Graph: Prior context from memory
 *
 * This builder is used by the agent to assemble rich context
 * for the LLM to understand the codebase before planning/executing.
 */

import { generateRepoMap } from '../parser/repo-map.js';
import { buildCodeIndex, searchIndex } from '../analysis/code-indexer.js';
import { KnowledgeGraph } from '../memory/knowledgeGraph.js';
import { memoryManager } from '../memory/manager.js';
import type { CodeIndex, IndexEntry } from '../analysis/indexer/types.js';
import type { MemoryRecord } from '../memory/memory-types.js';
import { createLogger } from '../services/logger.js';

const logger = createLogger('ContextBuilder');

/** Options for building context */
export interface BuildContextOptions {
  /** Project root directory */
  rootDir: string;
  /** Optional query to search for relevant code */
  query?: string;
  /** Maximum tokens for the context (default: 8000) */
  maxTokens?: number;
  /** Include knowledge graph entries */
  includeKnowledge?: boolean;
  /** Include repo map */
  includeRepoMap?: boolean;
  /** Include code search results */
  includeCodeSearch?: boolean;
}

/** Result of building context */
export interface BuildContextResult {
  /** The assembled context string */
  context: string;
  /** Whether repo map was included */
  repoMapIncluded: boolean;
  /** Whether code search was included */
  codeSearchIncluded: boolean;
  /** Whether knowledge graph was included */
  knowledgeIncluded: boolean;
  /** Number of code entries found */
  codeEntryCount: number;
  /** Number of knowledge entries found */
  knowledgeEntryCount: number;
}

/** Knowledge entry from memory */
export interface KnowledgeEntry {
  /** Entry ID */
  id: string;
  /** Entry type (tech, concept, skill, etc.) */
  type: string;
  /** Entry label/name */
  label: string;
  /** Relevance score */
  relevance: number;
  /** Content snippet */
  snippet?: string;
}

export class ContextBuilder {
  private codeIndex: CodeIndex | null = null;
  private repoMap: string | null = null;
  private repoMapRootDir: string | null = null;
  private knowledgeGraph: KnowledgeGraph | null = null;

  /**
   * Build a comprehensive context for the agent.
   *
   * @param options - Build options
   * @returns Assembled context result
   */
  async build(options: BuildContextOptions): Promise<BuildContextResult> {
    const maxTokens = options.maxTokens ?? 8000;
    const parts: string[] = [];
    let repoMapIncluded = false;
    let codeSearchIncluded = false;
    let knowledgeIncluded = false;
    let codeEntryCount = 0;
    let knowledgeEntryCount = 0;

    // 1. Generate repo map if needed
    if (options.includeRepoMap !== false) {
      const repoMapResult = await this.getRepoMap(options.rootDir);
      if (repoMapResult) {
        const repoMapTokens = this.estimateTokens(repoMapResult);
        // Reserve ~40% of budget for repo map
        const budgetForRepoMap = Math.floor(maxTokens * 0.4);

        if (repoMapTokens <= budgetForRepoMap) {
          parts.push(`## Codebase Structure (Repo Map)\n\`\`\`\n${repoMapResult}\n\`\`\``);
          repoMapIncluded = true;
        } else if (repoMapResult.length > 0) {
          // Truncate if too large
          parts.push(`## Codebase Structure (Repo Map)\n\`\`\`\n${repoMapResult.slice(0, budgetForRepoMap * 4)}\n\`\`\``);
          repoMapIncluded = true;
        }
      }
    }

    // 2. Search code index for relevant symbols if query provided
    if (options.query && options.includeCodeSearch !== false) {
      const codeResults = await this.searchCode(options.rootDir, options.query);
      if (codeResults.length > 0) {
        codeEntryCount = codeResults.length;
        const codeSection = this.formatCodeResults(codeResults, options.query);
        // Reserve ~30% of budget for code search
        const budgetForCode = Math.floor(maxTokens * 0.3);

        if (this.estimateTokens(codeSection) <= budgetForCode) {
          parts.push(`## Relevant Code (Search: "${options.query}")\n${codeSection}`);
          codeSearchIncluded = true;
        } else {
          // Truncate
          parts.push(`## Relevant Code (Search: "${options.query}")\n${codeSection.slice(0, budgetForCode * 4)}`);
          codeSearchIncluded = true;
        }
      }
    }

    // 3. Query knowledge graph for relevant context
    if (options.includeKnowledge !== false && options.query) {
      const knowledgeResults = await this.queryKnowledgeGraph(options.query);
      if (knowledgeResults.length > 0) {
        knowledgeEntryCount = knowledgeResults.length;
        const knowledgeSection = this.formatKnowledgeResults(knowledgeResults);
        // Reserve ~20% of budget for knowledge
        const budgetForKnowledge = Math.floor(maxTokens * 0.2);

        if (this.estimateTokens(knowledgeSection) <= budgetForKnowledge) {
          parts.push(`## Prior Context (Knowledge Graph)\n${knowledgeSection}`);
          knowledgeIncluded = true;
        } else {
          parts.push(`## Prior Context (Knowledge Graph)\n${knowledgeSection.slice(0, budgetForKnowledge * 4)}`);
          knowledgeIncluded = true;
        }
      }
    }

    // 4. Query memory for relevant past interactions
    if (options.includeKnowledge !== false && options.query) {
      const memoryResults = await this.queryMemory(options.query);
      if (memoryResults.length > 0) {
        const memorySection = this.formatMemoryResults(memoryResults);
        // Reserve ~10% of budget for memory
        const budgetForMemory = Math.floor(maxTokens * 0.1);

        if (this.estimateTokens(memorySection) <= budgetForMemory) {
          parts.push(`## Past Interactions (Memory)\n${memorySection}`);
        }
      }
    }

    return {
      context: parts.join('\n\n'),
      repoMapIncluded,
      codeSearchIncluded,
      knowledgeIncluded,
      codeEntryCount,
      knowledgeEntryCount,
    };
  }

  /**
   * Get or generate repo map for a project root.
   */
  private async getRepoMap(rootDir: string): Promise<string | null> {
    // Cache repo map per root directory
    if (this.repoMap && this.repoMapRootDir === rootDir) {
      return this.repoMap;
    }

    try {
      const result = await generateRepoMap(rootDir, {
        maxTokens: 4096,
      });

      this.repoMap = result.map;
      this.repoMapRootDir = rootDir;

      return result.map || null;
    } catch (error) {
      logger.warn({ error }, 'Failed to generate repo map');
      return null;
    }
  }

  /**
   * Search the code index for relevant symbols.
   */
  private async searchCode(rootDir: string, query: string): Promise<IndexEntry[]> {
    try {
      // Build index if not cached
      if (!this.codeIndex || this.codeIndex.rootDir !== rootDir) {
        this.codeIndex = await buildCodeIndex(rootDir);
      }

      const results = searchIndex(this.codeIndex, query, {
        maxResults: 10,
        typeFilter: ['symbol'],
      });

      return results;
    } catch (error) {
      logger.warn({ error }, 'Code search failed');
      return [];
    }
  }

  /**
   * Query the knowledge graph for relevant entries.
   */
  async queryKnowledgeGraph(query: string): Promise<KnowledgeEntry[]> {
    try {
      if (!this.knowledgeGraph) {
        this.knowledgeGraph = new KnowledgeGraph();
        await this.knowledgeGraph.init();
      }

      // Search for entities matching the query
      const entities = await this.knowledgeGraph.query();

      // Score entities by relevance to query
      const scored = entities
        .map(entity => ({
          id: entity.id,
          type: entity.type,
          label: entity.label,
          relevance: this.calculateRelevance(entity.label, query),
          snippet: entity.attributes?.description || entity.attributes?.summary,
        }))
        .filter(e => e.relevance > 0)
        .sort((a, b) => b.relevance - a.relevance)
        .slice(0, 5);

      return scored;
    } catch (error) {
      logger.warn({ error }, 'Knowledge graph query failed');
      return [];
    }
  }

  /**
   * Query memory for relevant past interactions.
   */
  async queryMemory(query: string): Promise<MemoryRecord[]> {
    try {
      return await memoryManager.recall(query, 3);
    } catch (error) {
      logger.warn({ error }, 'Memory query failed');
      return [];
    }
  }

  /**
   * Calculate relevance score between text and query.
   */
  private calculateRelevance(text: string, query: string): number {
    const lowerText = text.toLowerCase();
    const lowerQuery = query.toLowerCase();
    const queryTerms = lowerQuery.split(/\s+/);

    let score = 0;

    // Exact match
    if (lowerText === lowerQuery) {
      score += 100;
    }

    // Starts with query
    if (lowerText.startsWith(lowerQuery)) {
      score += 50;
    }

    // Contains query terms
    for (const term of queryTerms) {
      if (term.length < 2) continue;
      if (lowerText.includes(term)) {
        score += 20;
        // Bonus for multiple occurrences
        const occurrences = (lowerText.match(new RegExp(term, 'g')) || []).length;
        if (occurrences > 1) {
          score += occurrences * 5;
        }
      }
    }

    return score;
  }

  /**
   * Format code search results as markdown.
   */
  private formatCodeResults(results: IndexEntry[], query: string): string {
    const lines: string[] = [];

    for (const entry of results) {
      const relativePath = entry.filePath.split('/').pop() || entry.filePath;
      const kind = entry.kind || entry.type || 'symbol';
      const location = entry.line ? `:${entry.line}` : '';

      lines.push(`- **${entry.name}** (${kind}) - \`${relativePath}${location}\``);

      if (entry.signature) {
        lines.push(`  \`\`\`typescript\n  ${entry.signature}\n  \`\`\``);
      }
    }

    return lines.join('\n') || 'No relevant code found.';
  }

  /**
   * Format knowledge graph results as markdown.
   */
  private formatKnowledgeResults(results: KnowledgeEntry[]): string {
    const lines: string[] = [];

    for (const entry of results) {
      lines.push(`- **[${entry.type}]** ${entry.label}`);
      if (entry.snippet) {
        lines.push(`  - ${entry.snippet.slice(0, 100)}${entry.snippet.length > 100 ? '...' : ''}`);
      }
    }

    return lines.join('\n') || 'No relevant knowledge found.';
  }

  /**
   * Format memory results as markdown.
   */
  private formatMemoryResults(results: MemoryRecord[]): string {
    const lines: string[] = [];

    for (const record of results) {
      const interaction = record.interaction;
      const date = new Date(interaction.timestamp).toLocaleDateString('zh-CN');
      lines.push(`- **${date}**: ${interaction.input.slice(0, 80)}${interaction.input.length > 80 ? '...' : ''}`);
    }

    return lines.join('\n') || 'No relevant memory found.';
  }

  /**
   * Rough token estimation (4 chars per token average for code).
   */
  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  /**
   * Clear cached data.
   */
  clearCache(): void {
    this.codeIndex = null;
    this.repoMap = null;
    this.repoMapRootDir = null;
    this.knowledgeGraph = null;
  }
}

/** Global context builder instance */
export const contextBuilder = new ContextBuilder();
