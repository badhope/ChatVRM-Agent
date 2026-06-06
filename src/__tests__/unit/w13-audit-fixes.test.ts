/**
 * W13: targeted unit tests for each W11 fix.
 *
 * Each describe block covers one of the 9 findings from the W1-W12
 * audit. The tests pin the fixed behavior so a future regression
 * breaks loudly instead of silently re-introducing the gap.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { RagTool } from '../../integration/rag-tool.js';
import { WebhookRouter } from '../../integration/webhooks.js';
import { StdioServerTransport } from '../../adapters/mcp/stdio-server-transport.js';
import { IngestionPipeline } from '../../integration/ingestion-pipeline.js';
import { TokenBudget } from '../../integration/token-budget.js';
import { scorePair } from '../../integration/reranker.js';
import { EventEmitter } from 'eventemitter3';
import { PassThrough } from 'node:stream';
import { RecursiveTextChunker } from '../../adapters/text-chunker.js';
import { HashingEmbedder } from '../../adapters/embedder.hashing.js';
import { InMemoryVectorStore } from '../../adapters/vector-store.memory.js';
import type { ILLMPort, ChatResponse } from '../../ports/llm.port.js';

/* ──────────────────────────────────────────────────────────────────
 * Fix 1 — RagTool over-fetches when a filter is configured
 * ────────────────────────────────────────────────────────────────── */

describe('RagTool.run over-fetches when a filter is configured', () => {
  it('requests more candidates than topK when a filter is set', async () => {
    let requestedK = 0;
    const fakeRetriever = {
      retrieve: async (_q: string, k: number) => {
        requestedK = k;
        return [];
      },
      add: async () => {},
    } as never;
    const tool = new RagTool({
      retriever: fakeRetriever,
      topK: 5,
      name: 't',
      description: 't',
      filter: (m) => m['k'] === 'v',
    });
    await tool.run({ query: 'x' });
    expect(requestedK).toBeGreaterThan(5);
    // Sanity: at least 3x over-fetch.
    expect(requestedK).toBeGreaterThanOrEqual(5 * 3);
  });

  it('does NOT over-fetch when no filter is configured', async () => {
    let requestedK = 0;
    const fakeRetriever = {
      retrieve: async (_q: string, k: number) => {
        requestedK = k;
        return [];
      },
      add: async () => {},
    } as never;
    const tool = new RagTool({ retriever: fakeRetriever, topK: 5, name: 't', description: 't' });
    await tool.run({ query: 'x' });
    expect(requestedK).toBe(5);
  });
});

/* ──────────────────────────────────────────────────────────────────
 * Fix 2 — WebhookRouter implements bounded concurrency (real semaphore)
 * ────────────────────────────────────────────────────────────────── */

describe('WebhookRouter bounded concurrency', () => {
  it('limits in-flight deliveries to `concurrency`', async () => {
    const bus = new EventEmitter();
    let inFlight = 0;
    let maxInFlight = 0;

    // Use a slow transport that records its own in-flight.
    const slowTransport = async () => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 30));
      inFlight -= 1;
      return { ok: true, status: 200, body: '' };
    };
    const router = new WebhookRouter({ bus, transport: slowTransport, concurrency: 2 });
    // L10 (W19): the W19 SSRF guard rejects `localhost` URLs.
    // This test uses a custom in-process transport that never
    // hits the network, so the URL is just an opaque key —
    // pass `skipSsrfCheck: true` to opt out of the guard.
    router.register({ name: 't', url: 'http://localhost/1', events: ['e'], skipSsrfCheck: true });
    router.register({ name: 't2', url: 'http://localhost/2', events: ['e'], skipSsrfCheck: true });
    router.register({ name: 't3', url: 'http://localhost/3', events: ['e'], skipSsrfCheck: true });
    router.register({ name: 't4', url: 'http://localhost/4', events: ['e'], skipSsrfCheck: true });

    bus.emit('e', {});
    await new Promise((r) => setTimeout(r, 200));
    expect(maxInFlight).toBeLessThanOrEqual(2);
    expect(router.maxConcurrency).toBe(2);
  });
});

/* ──────────────────────────────────────────────────────────────────
 * Fix 3 — McpServerBridge / StdioServerTransport reads OUR stdio
 * ────────────────────────────────────────────────────────────────── */

describe('StdioServerTransport reads from this process stdio', () => {
  it('parses JSON-RPC messages from an input stream', async () => {
    const input = new PassThrough();
    const output = new PassThrough();
    const transport = new StdioServerTransport({ input, output, quiet: true });
    const received: unknown[] = [];
    transport.on('message', (m) => received.push(m));
    await transport.start();
    input.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping' }) + '\n');
    input.write(JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'pong' }) + '\n');
    // Wait for nextTick + emit.
    await new Promise((r) => setImmediate(r));
    expect(received).toEqual([
      { jsonrpc: '2.0', id: 1, method: 'ping' },
      { jsonrpc: '2.0', id: 2, method: 'pong' },
    ]);
    await transport.close();
  });
});

/* ──────────────────────────────────────────────────────────────────
 * Fix 4 — IngestionPipeline surfaces per-document / per-batch errors
 * ────────────────────────────────────────────────────────────────── */

describe('IngestionPipeline error handling', () => {
  let store: InMemoryVectorStore;
  let embedder: HashingEmbedder;

  beforeEach(() => {
    store = new InMemoryVectorStore(16);
    embedder = new HashingEmbedder({ dim: 16 });
  });

  it('continues when the chunker throws for a single document', async () => {
    const chunker = new RecursiveTextChunker({ chunkSize: 50, chunkOverlap: 10 });
    const failingChunker = {
      split: (() => {
        let n = 0;
        return (text: string) => {
          n += 1;
          if (n === 1) throw new Error('boom');
          return chunker.split(text);
        };
      })(),
    } as never;
    const pipeline = new IngestionPipeline({
      chunker: failingChunker,
      embedder,
      vectorStore: store,
    });
    const out = await pipeline.ingestDocuments([
      { text: 'first', source: 'a' },
      { text: 'second', source: 'b' },
    ]);
    expect(out.errors).toHaveLength(1);
    expect(out.errors[0]!.error).toMatch(/chunk: boom/);
    expect(out.vectors).toBeGreaterThan(0);
  });

  it('validates embedBatch length and pushes an error instead of undefined vectors', async () => {
    const chunker = new RecursiveTextChunker({ chunkSize: 50, chunkOverlap: 10 });
    const badEmbedder = {
      embed: async (t: string) => new Float32Array(16).fill(0),
      embedBatch: async (texts: string[]) => new Array(Math.max(0, texts.length - 1)).fill(new Float32Array(16).fill(0)),
      dim: 16,
      id: 'bad',
    } as never;
    const pipeline = new IngestionPipeline({
      chunker,
      embedder: badEmbedder,
      vectorStore: store,
    });
    const out = await pipeline.ingestDocuments([{ text: 'hello world', source: 'a' }]);
    expect(out.errors.length).toBeGreaterThan(0);
    expect(out.errors.some((e) => /embedBatch length mismatch/.test(e.error))).toBe(true);
    expect(out.vectors).toBe(0);
  });
});

/* ──────────────────────────────────────────────────────────────────
 * Fix 5 — TokenBudget: warnAt fires and pre-call hard-limit guards
 * ────────────────────────────────────────────────────────────────── */

describe('TokenBudget warnAt + pre-call guard', () => {
  it('fires onWarn callback when usage crosses warnAt', async () => {
    const events: unknown[] = [];
    const budget = new TokenBudget({
      warnAt: { totalTokens: 10 },
      onWarn: (e) => events.push(e),
    });
    budget.record('s1', 'm', { promptTokens: 100, completionTokens: 0, totalTokens: 100, usd: 0 } as never);
    expect(events).toHaveLength(1);
  });

  it('rejects calls whose projected prompt would breach hardAt', async () => {
    const budget = new TokenBudget({ hardAt: { totalTokens: 100 } });
    // Pre-existing usage is 80.
    budget.record('s', 'm', { promptTokens: 80, completionTokens: 0, totalTokens: 80, usd: 0 } as never);
    // A new call with a 50-token prompt would push the session to 130 (> 100).
    const port: ILLMPort = {
      chat: async () => ({ id: 'x', content: 'y', model: 'm', usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0, usd: 0 } }) as ChatResponse,
      stream: (async function* () {}) as never,
      listModels: async () => [],
      isAvailable: async () => true,
    };
    const wrapped = budget.wrap(port, 's');
    // A 200-char prompt is ~58 tokens, plus the 80 already used → 138 > 100.
    const bigReq = {
      model: 'm',
      messages: [{ role: 'user' as const, content: 'a'.repeat(200) }],
    } as never;
    await expect(wrapped.chat(bigReq)).rejects.toThrow(/budget/i);
  });
});

/* ──────────────────────────────────────────────────────────────────
 * Fix 6 — Reranker.scorePair computes total from weights
 * ────────────────────────────────────────────────────────────────── */

describe('Reranker.scorePair returns a real total', () => {
  it('total is > 0 when features are positive', () => {
    const s = scorePair('hello world', 'hello there world', { candidateCount: 1 });
    expect(s.overlap).toBeGreaterThan(0);
    expect(s.total).toBeGreaterThan(0);
  });

  it('respects custom weights', () => {
    // Use a longer pair so neither side trips the length penalty.
    const overlapOnly = scorePair('hello world', 'hello there world', { weights: { overlapWeight: 1, positionWeight: 0, lengthWeight: 0 } });
    expect(overlapOnly.total).toBeGreaterThan(0.5);
    const lengthOnly = scorePair('hello world this is a long one', 'hello world this is a long one', {
      weights: { overlapWeight: 0, positionWeight: 0, lengthWeight: 1 },
    });
    expect(lengthOnly.total).toBeGreaterThan(0.5);
  });
});

/* ──────────────────────────────────────────────────────────────────
 * Fix 7 — QueuedTool surfaces processor errors to runAndWait
 * ────────────────────────────────────────────────────────────────── */

describe('QueuedTool error propagation', () => {
  it('resolves with a failed ToolResult when the processor throws', async () => {
    const { QueuedTool } = await import('../../integration/queued-tool.js');
    const { InProcessQueue } = await import('../../adapters/queue.in-process.js');
    const queue = new InProcessQueue('qt-err-test');
    const tool = new QueuedTool({
      name: 'flaky',
      description: 'always throws',
      inputSchema: { type: 'object', properties: {} },
      enqueue: async (args, jobName) => {
        const j = await queue.add(jobName, args);
        return { jobId: j.id, data: args };
      },
      processor: async () => {
        throw new Error('intentional');
      },
      queue,
    });
    tool.bindWorker();
    // Give the queue worker a moment to be ready.
    await new Promise((r) => setTimeout(r, 50));
    const result = await tool.runAndWait({ input: {} }, { timeoutMs: 3000 });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/intentional/);
    await queue.close();
  });
});
