/**
 * QueuedTool integration tests.
 *
 * Validates the long-running-tool pattern: a tool whose handler
 * enqueues a job in an IQueue, and exposes runAndWait() to the
 * agent for blocking-on-the-result semantics.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { QueuedTool } from '../../integration/queued-tool.js';
import { InProcessQueue } from '../../adapters/queue.in-process.js';
import { ToolsRegistry } from '../../adapters/tools.registry.js';

describe('QueuedTool', () => {
  let q: InProcessQueue;
  beforeEach(() => {
    q = new InProcessQueue('test', { defaultConcurrency: 2 });
  });
  afterEach(async () => {
    await q.close();
  });

  it('run() returns a ticket id immediately (fire-and-forget)', async () => {
    const tool = new QueuedTool({
      name: 'double',
      description: 'double a number',
      queue: q,
      enqueue: async (args: { n: number }, jobName) => {
        const j = await q.add(jobName, args);
        return { jobId: j.id, data: args };
      },
      processor: async (job) => {
        const data = job.data as { n: number };
        return data.n * 2;
      },
    });

    const r = await tool.run({ n: 21 });
    expect(r.success).toBe(true);
    expect(r.output).toContain('ticketId');
    expect(r.output).toContain('queued');
  });

  it('runAndWait() resolves with the processor result', async () => {
    const tool = new QueuedTool<{ n: number }, number>({
      name: 'square',
      description: 'square a number',
      queue: q,
      enqueue: async (args, jobName) => {
        const j = await q.add(jobName, args);
        return { jobId: j.id, data: args };
      },
      processor: async (job) => Math.pow((job.data as { n: number }).n, 2),
    });

    const r = await tool.runAndWait({ n: 7 });
    expect(r.success).toBe(true);
    expect(r.output).toBe('49');
  });

  it('runAndWait() respects timeoutMs', async () => {
    const tool = new QueuedTool({
      name: 'slow',
      description: 'sleeps a long time',
      queue: q,
      enqueue: async (_args, jobName) => {
        const j = await q.add(jobName, {});
        return { jobId: j.id, data: {} };
      },
      processor: async () => {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        return 'ok';
      },
    });

    await expect(tool.runAndWait({}, { timeoutMs: 100 })).rejects.toThrow(/timed out/);
  });

  it('runAndWait() honours an AbortSignal', async () => {
    const tool = new QueuedTool({
      name: 'slow',
      description: 'sleeps a long time',
      queue: q,
      enqueue: async (_args, jobName) => {
        const j = await q.add(jobName, {});
        return { jobId: j.id, data: {} };
      },
      processor: async () => {
        await new Promise((resolve) => setTimeout(resolve, 500));
        return 'ok';
      },
    });

    const ctrl = new AbortController();
    setTimeout(() => ctrl.abort(), 50);
    await expect(tool.runAndWait({}, { signal: ctrl.signal })).rejects.toThrow(/aborted/);
  });

  it('returns a serialised object for non-string processor results', async () => {
    const tool = new QueuedTool<{ name: string }, { greeting: string }>({
      name: 'greet',
      description: 'greet by name',
      queue: q,
      enqueue: async (args, jobName) => {
        const j = await q.add(jobName, args);
        return { jobId: j.id, data: args };
      },
      processor: async (job) => ({ greeting: `Hello, ${(job.data as { name: string }).name}!` }),
    });
    const r = await tool.runAndWait({ name: 'world' });
    expect(r.success).toBe(true);
    expect(r.output).toContain('Hello, world!');
  });

  it('integrates with a ToolsRegistry: register + execute', async () => {
    const tool = new QueuedTool<{ n: number }, number>({
      name: 'incr',
      description: 'increment',
      queue: q,
      enqueue: async (args, jobName) => {
        const j = await q.add(jobName, args);
        return { jobId: j.id, data: args };
      },
      processor: async (job) => (job.data as { n: number }).n + 1,
    });
    const registry = new ToolsRegistry();
    registry.register(tool.tool);
    expect(registry.has('incr')).toBe(true);
    const out = await registry.execute('incr', { n: 5 });
    expect(out.success).toBe(true);
    expect(out.output).toContain('ticketId');
  });

  it('toToolDefinition carries the zod schema for native calling', () => {
    const tool = new QueuedTool({
      name: 'eco',
      description: 'echo',
      queue: q,
      enqueue: async (args, jobName) => {
        const j = await q.add(jobName, args);
        return { jobId: j.id, data: args };
      },
      processor: async () => 'done',
      inputSchema: { type: 'object', properties: { msg: { type: 'string' } }, required: ['msg'] },
    });
    const def = tool.toToolDefinition();
    expect(def.inputSchema).toBeDefined();
    expect(def.metadata?.['kind']).toBe('queued');
  });
});
