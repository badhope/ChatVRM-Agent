/**
 * RAG-as-a-Tool.
 *
 * Wraps a {@link HybridRetriever} (or any object with a `retrieve(query,
 * k)` method) as a single tool that any agent can call. The result is
 * formatted as a compact Markdown block: `> <text>` per hit plus the
 * score and source signal, so the LLM can quote and reason about them.
 *
 * This is the canonical "knowledge base" tool: register it on a
 * `ToolsRegistry` next to your other tools, and ReAct will pick it up
 * automatically when the user asks a question whose answer is in the
 * corpus.
 *
 * Usage:
 *   const rag = new RagTool({ retriever, topK: 5 });
 *   tools.register(rag.toToolDefinition());
 *
 * Or just register it directly:
 *   tools.register(rag.tool);
 */

import type { ToolDefinition } from '../ports/tools.port.js';
import type { HybridRetriever, HybridResult } from '../adapters/hybrid-retriever.js';
import { z } from 'zod';
import { zodToJsonSchema } from '../agents/zod-schema.js';

export interface RagToolOptions {
  /** The retriever to back this tool. Anything with `retrieve(q, k)` works. */
  retriever: Pick<HybridRetriever, 'retrieve'> | {
    retrieve(query: string, topK: number): Promise<HybridResult[]>;
  };
  /** Number of hits to surface per call. Default 5. */
  topK?: number;
  /** Tool name registered with the agent. Default `vector_search`. */
  name?: string;
  /** Tool description surfaced to the LLM. */
  description?: string;
  /** Optional per-call filter (metadata predicate) — currently unused,
   *  reserved for adapters that support pre-filtering. */
  filter?: (metadata: Record<string, unknown>) => boolean;
}

export const RagQuerySchema = z.object({
  query: z.string().min(1).describe('Natural-language question to search the knowledge base for.'),
  topK: z.number().int().min(1).max(50).optional()
    .describe('Optional override for the number of hits to retrieve. Defaults to the tool-configured topK.'),
});

export type RagQuery = z.infer<typeof RagQuerySchema>;

/**
 * Adapter that takes a generic retriever and exposes it as an
 * {@link IToolsPort}-compatible tool definition. The agent (ReAct,
 * Crew, Graph) calls it like any other tool; the handler returns a
 * serialised Markdown block ready for the LLM prompt.
 */
export class RagTool {
  readonly name: string;
  readonly description: string;
  readonly topK: number;
  private readonly retriever: RagToolOptions['retriever'];
  private readonly filter: RagToolOptions['filter'];

  constructor(opts: RagToolOptions) {
    this.retriever = opts.retriever;
    this.topK = opts.topK ?? 5;
    this.filter = opts.filter;
    this.name = opts.name ?? 'vector_search';
    this.description = opts.description ??
      'Search a private knowledge base for passages relevant to a natural-language query. ' +
      'Returns the top-K most relevant chunks with their sources. Use this whenever the answer ' +
      'might depend on private documents, prior research, or any corpus you have ingested.';
  }

  /**
   * Run the tool. Public so it can be called directly in tests / CLI
   * without going through the tool registry.
   */
  async run(input: RagQuery): Promise<{
    text: string;
    hits: HybridResult[];
  }> {
    const topK = input.topK ?? this.topK;
    // When a metadata filter is configured, the post-filter hit rate
    // is unknown, so over-fetch by a factor to avoid returning fewer
    // than `topK` documents. 3x is a good balance between recall and
    // cost: with a 50% filter pass-rate, 3x gives 1.5x topK results
    // before the post-filter; the post-filter then trims to topK.
    const overFetch = this.filter ? 3 : 1;
    const requestK = Math.max(topK, topK * overFetch);
    const all = await this.retriever.retrieve(input.query, requestK);
    const hits = this.filter ? all.filter((h) => this.filter!(h.metadata ?? {})) : all;
    const trimmed = hits.slice(0, topK);
    return {
      text: formatHits(trimmed),
      hits: trimmed,
    };
  }

  /** The {@link ToolDefinition} that an agent can register. */
  toToolDefinition(): ToolDefinition {
    const tool: ToolDefinition = {
      name: this.name,
      description: this.description,
      inputSchema: zodToJsonSchema(RagQuerySchema),
      metadata: { kind: 'rag', topK: this.topK },
      handler: async (args) => {
        const query = RagQuerySchema.parse(args);
        const r = await this.run(query);
        return { success: true, output: r.text };
      },
    };
    return tool;
  }

  /** Sugar for `tools.register(ragTool.toToolDefinition())`. */
  get tool(): ToolDefinition {
    return this.toToolDefinition();
  }
}

/** Format a hit list as a compact Markdown block for the LLM prompt. */
export function formatHits(hits: HybridResult[]): string {
  if (hits.length === 0) return 'No relevant passages found in the knowledge base.';
  const lines: string[] = [];
  for (let i = 0; i < hits.length; i++) {
    const h = hits[i]!;
    const src = h.sources;
    const sigs: string[] = [];
    if (typeof src.bm25 === 'number') sigs.push(`bm25=${src.bm25.toFixed(2)}`);
    if (typeof src.vector === 'number') sigs.push(`vector=${src.vector.toFixed(2)}`);
    const sigStr = sigs.length > 0 ? ` [${sigs.join(', ')}]` : '';
    const text = h.text.replace(/\n+/g, ' ').trim();
    lines.push(`> (${i + 1}) score=${h.score.toFixed(3)}${sigStr} ${text}`);
  }
  return `Found ${hits.length} relevant passage(s):\n\n${lines.join('\n\n')}`;
}
