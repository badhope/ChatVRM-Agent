/**
 * RAG-as-a-Tool integration tests.
 *
 * Verifies that a HybridRetriever can be wrapped as an IToolsPort
 * tool and that the resulting tool returns a Markdown block the LLM
 * can actually consume.
 */

import { describe, it, expect } from 'vitest';
import { RagTool, RagQuerySchema, formatHits } from '../../integration/rag-tool.js';
import { HybridRetriever, type HybridDoc } from '../../adapters/hybrid-retriever.js';
import { HashingEmbedder } from '../../adapters/embedder.hashing.js';
import { InMemoryVectorStore } from '../../adapters/vector-store.memory.js';
import { ToolsRegistry } from '../../adapters/tools.registry.js';

function makeRetriever(): HybridRetriever {
  const embedder = new HashingEmbedder({ dim: 64 });
  const store = new InMemoryVectorStore(64);
  const retriever = new HybridRetriever({ embedder, vectorStore: store });
  const docs: HybridDoc[] = [
    { id: 'd1', text: 'Apples are red, sweet, and grow on trees.', metadata: { source: 'fruit.md' } },
    { id: 'd2', text: 'Bananas are yellow and rich in potassium.', metadata: { source: 'fruit.md' } },
    { id: 'd3', text: 'Quantum entanglement is a phenomenon in physics.', metadata: { source: 'science.md' } },
  ];
  // Sync embed - it returns a Promise but we can flush
  return Object.assign(retriever, { __pendingAdd: retriever.add(docs) }) as HybridRetriever;
}

async function makeReadyRetriever(): Promise<HybridRetriever> {
  const embedder = new HashingEmbedder({ dim: 64 });
  const store = new InMemoryVectorStore(64);
  const retriever = new HybridRetriever({ embedder, vectorStore: store });
  const docs: HybridDoc[] = [
    { id: 'd1', text: 'Apples are red, sweet, and grow on trees.', metadata: { source: 'fruit.md' } },
    { id: 'd2', text: 'Bananas are yellow and rich in potassium.', metadata: { source: 'fruit.md' } },
    { id: 'd3', text: 'Quantum entanglement is a phenomenon in physics.', metadata: { source: 'science.md' } },
  ];
  await retriever.add(docs);
  return retriever;
}

describe('RagTool', () => {
  it('wraps a HybridRetriever and produces a ToolDefinition', () => {
    const r = makeRetriever();
    const tool = new RagTool({ retriever: r, topK: 3 });
    const def = tool.toToolDefinition();
    expect(def.name).toBe('vector_search');
    expect(def.description).toContain('knowledge base');
    expect(def.metadata).toEqual({ kind: 'rag', topK: 3 });
    expect(def.inputSchema).toBeDefined();
  });

  it('RagQuerySchema is a zod schema and validates input', () => {
    const ok = RagQuerySchema.safeParse({ query: 'apple' });
    expect(ok.success).toBe(true);
    const bad = RagQuerySchema.safeParse({ query: '' });
    expect(bad.success).toBe(false);
  });

  it('run() returns hits + formatted text', async () => {
    const r = await makeReadyRetriever();
    const tool = new RagTool({ retriever: r, topK: 2 });
    const out = await tool.run({ query: 'apple' });
    expect(out.hits.length).toBeGreaterThan(0);
    expect(out.hits.length).toBeLessThanOrEqual(2);
    expect(out.text).toContain('Found');
    expect(out.text).toContain('relevant passage');
  });

  it('filters by metadata predicate when configured', async () => {
    const r = await makeReadyRetriever();
    const tool = new RagTool({
      retriever: r,
      topK: 5,
      filter: (md) => md['source'] === 'fruit.md',
    });
    const out = await tool.run({ query: 'yellow fruit' });
    for (const h of out.hits) {
      expect(h.metadata?.['source']).toBe('fruit.md');
    }
  });

  it('handles empty results gracefully', () => {
    const empty: { retrieve: (q: string, k: number) => Promise<never[]> } = {
      async retrieve() { return []; },
    };
    const tool = new RagTool({ retriever: empty });
    const text = formatHits([]);
    expect(text).toBe('No relevant passages found in the knowledge base.');
  });

  it('integrates with a ToolsRegistry: register + execute', async () => {
    const r = await makeReadyRetriever();
    const tool = new RagTool({ retriever: r, name: 'kb', topK: 1 });
    const registry = new ToolsRegistry();
    registry.register(tool.tool);
    expect(registry.has('kb')).toBe(true);
    const result = await registry.execute('kb', { query: 'banana' });
    expect(result.success).toBe(true);
    expect(result.output).toContain('Found');
  });

  it('handles a tool whose handler returns a string (LLM calling through)', async () => {
    const r = await makeReadyRetriever();
    const tool = new RagTool({ retriever: r, name: 'search', topK: 1 });
    const handler = tool.tool.handler;
    const result = await handler({ query: 'quantum' });
    expect(result).toBeDefined();
    const out = (result as { success: boolean; output?: string }).output ?? '';
    expect(out.length).toBeGreaterThan(0);
  });
});
