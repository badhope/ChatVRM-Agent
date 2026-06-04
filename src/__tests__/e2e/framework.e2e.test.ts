/**
 * End-to-end smoke test for the new framework capabilities.
 *
 * Wires together: hash embedder -> in-memory vector store -> hybrid
 * retriever -> text chunker -> session store -> queue. The test never
 * touches a real LLM or external service; it just verifies the pieces
 * cooperate.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { HashingEmbedder } from '../../adapters/embedder.hashing.js';
import { InMemoryVectorStore } from '../../adapters/vector-store.memory.js';
import { HybridRetriever } from '../../adapters/hybrid-retriever.js';
import { RecursiveTextChunker } from '../../adapters/text-chunker.js';
import { CsvLoader } from '../../loaders/csv.loader.js';
import { JsonFileSessionStore } from '../../adapters/session-store.json.js';
import { InProcessQueue } from '../../adapters/queue.in-process.js';
import { NoopObservability } from '../../adapters/observability.noop.js';
import { workflowToGraph } from '../../agents/workflow.js';
import type { WorkflowSpec } from '../../agents/workflow.js';

describe('e2e: RAG pipeline (chunk -> embed -> store -> retrieve)', () => {
  it('retrieves relevant context for a user query', async () => {
    const embedder = new HashingEmbedder({ dim: 256 });
    const store = new InMemoryVectorStore(256);
    const retriever = new HybridRetriever({ embedder, vectorStore: store });

    const chunker = new RecursiveTextChunker({ chunkSize: 200, chunkOverlap: 30 });

    const docs = await new CsvLoader().loadBuffer(
      Buffer.from(
        'topic,body\n' +
          'RAG,Retrieval-augmented generation grounds LLM answers in retrieved documents\n' +
          'MCP,Model Context Protocol is a JSON-RPC standard for LLM tools and data sources\n' +
          'Vectors,Dense embedding vectors enable semantic similarity search at scale\n' +
          'BM25,Classic lexical scoring that complements dense vector search via hybrid retrieval\n',
      ),
    );

    const chunks: { id: string; text: string; metadata?: Record<string, unknown> }[] = [];
    for (const d of docs) {
      const c = chunker.split(d.text);
      const cells = (d.metadata?.['cells'] as string[] | undefined) ?? [];
      for (let i = 0; i < c.length; i++) {
        chunks.push({
          id: `${d.metadata?.['row']}-${i}`,
          text: c[i].text,
          metadata: { row: d.metadata?.['row'], chunk: i, topic: cells[0] },
        });
      }
    }
    await retriever.add(chunks);

    const q = await retriever.retrieve('what is the Model Context Protocol', 3);
    expect(q.length).toBe(3);
    // The MCP doc should win on at least one of the signals.
    const mcp = q.find((r) => (r.metadata?.topic as string) === 'MCP');
    expect(mcp).toBeDefined();
  });
});

describe('e2e: session store + queue', () => {
  let tmpDir: string;
  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pa-e2e-'));
  });
  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('enqueues a "summarise session" job that writes to the store', async () => {
    const store = await JsonFileSessionStore.open(path.join(tmpDir, 's.json'));
    const queue = new InProcessQueue('summarise', { defaultConcurrency: 1 });
    queue.process<{ sessionId: string }>('summarise', async (job) => {
      const s = await store.get(job.data.sessionId);
      if (!s) throw new Error(`session ${job.data.sessionId} not found`);
      s.metadata = { ...(s.metadata ?? {}), summary: `${s.messages.length} messages` };
      await store.upsert(s);
      return { ok: true };
    });

    // Seed a session.
    await store.upsert({
      id: 's1',
      metadata: {},
      messages: [
        { id: 'm1', role: 'user', content: 'hi', createdAt: 1 },
        { id: 'm2', role: 'assistant', content: 'hello', createdAt: 2 },
      ],
      createdAt: 1,
      updatedAt: 1,
    });

    // Enqueue and wait.
    const events: Array<{ type: string; id?: string }> = [];
    queue.on('completed', (j: unknown) => {
      const job = j as { id: string };
      events.push({ type: 'completed', id: job.id });
    });
    await queue.add('summarise', { sessionId: 's1' });
    await new Promise<void>((resolve) => queue.on('completed', () => resolve()));
    expect(events.length).toBeGreaterThan(0);

    // Verify the side-effect.
    const after = await store.get('s1');
    expect(after?.metadata?.summary).toBe('2 messages');

    await queue.close();
    await store.close();
  });
});

describe('e2e: workflow + observability', () => {
  it('compiles a workflow, runs it, and traces it', async () => {
    const obs = new NoopObservability({ recordMode: true });
    const trace = await obs.trace('test-wf', { userId: 'u1' });

    const spec: WorkflowSpec = {
      name: 'doubler',
      entry: 'start',
      nodes: [
        { id: 'start', type: 'read' },
        { id: 'double', type: 'op' },
        { id: 'check', type: 'op' },
      ],
      edges: [
        { id: 'e1', source: 'start', target: 'double' },
        { id: 'e2', source: 'double', target: 'check' },
      ],
    };

    const { graph, issues } = workflowToGraph<{ n: number; doubled: number; log: string[] }>(spec, {
      handlers: {
        read: () => ({ n: 3, log: ['read'] }),
        op: async (s, n) => {
          const span = await trace.span(n.id);
          const r = n.id === 'double' ? { doubled: s.n * 2, log: [...s.log, 'double'] } : { log: [...s.log, 'check'] };
          await span.end({ output: r });
          return r;
        },
      },
    });
    expect(issues).toEqual([]);

    const result = await graph.run({ n: 0, doubled: 0, log: [] });
    expect(result.doubled).toBe(6);
    expect(result.log).toEqual(['read', 'double', 'check']);

    await trace.end();
    const records = obs.drainRecords();
    // The trace span itself + 2 op spans.
    expect(records.length).toBeGreaterThanOrEqual(3);
    const opNames = records.map((r) => r.name).sort();
    expect(opNames).toContain('double');
    expect(opNames).toContain('check');
  });
});
