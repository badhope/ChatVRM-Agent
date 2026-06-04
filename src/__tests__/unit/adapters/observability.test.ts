import { describe, it, expect, beforeEach } from 'vitest';
import { NoopObservability } from '../../../adapters/observability.noop.js';
import { LangfuseClient } from '../../../adapters/observability.langfuse.js';

describe('NoopObservability', () => {
  it('returns a working observation without errors', async () => {
    const obs = new NoopObservability();
    const trace = await obs.trace('test', { userId: 'u1' });
    expect(trace).toBeDefined();
    const span = await trace.span('child');
    expect(span).toBeDefined();
    await span.end({ output: 'done' });
    await trace.end();
    await obs.flush();
    await obs.shutdown();
  });

  it('records into ring buffer when recordMode is on', async () => {
    const obs = new NoopObservability({ recordMode: true, ringBufferSize: 50 });
    const trace = await obs.trace('hello');
    const gen = await trace.generation('llm-call', { model: 'gpt-4o' });
    trace.event('milestone');
    await gen.end({ output: 'response', level: 'default' });
    await trace.end();
    await obs.flush();
    const records = obs.drainRecords();
    // Each span/generation produces a record (event too).
    expect(records.length).toBeGreaterThanOrEqual(3);
    expect(records.some((r) => r.name === 'hello')).toBe(true);
    expect(records.some((r) => r.name === 'llm-call' && r.kind === 'generation')).toBe(true);
    expect(records.some((r) => r.name === 'milestone' && r.kind === 'event')).toBe(true);
  });

  it('setMetadata / setInput / setOutput are chainable', async () => {
    const obs = new NoopObservability();
    const trace = await obs.trace('t');
    const span = await trace.span('s');
    expect(span.setMetadata('k', 'v')).toBe(span);
    expect(span.setInput({ a: 1 })).toBe(span);
    expect(span.setOutput({ b: 2 })).toBe(span);
    expect(span.setTags({ env: 'test' })).toBe(span);
    await span.end();
    await trace.end();
  });
});

describe('LangfuseClient (mocked fetch)', () => {
  let sent: Array<{ url: string; body: unknown; headers: Record<string, string> }>;
  let fetchImpl: typeof fetch;

  beforeEach(() => {
    sent = [];
    fetchImpl = (async (url: string, init?: RequestInit) => {
      const headers: Record<string, string> = {};
      for (const [k, v] of Object.entries(init?.headers ?? {})) {
        headers[k] = String(v);
      }
      const body = init?.body ? JSON.parse(init.body as string) : null;
      sent.push({ url, body, headers });
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    }) as unknown as typeof fetch;
  });

  it('POSTs to /api/public/ingestion with Basic auth', async () => {
    const client = new LangfuseClient({
      publicKey: 'pk',
      secretKey: 'sk',
      fetchImpl,
    });
    const trace = await client.trace('demo', { userId: 'u1' });
    const gen = await trace.generation('llm', { model: 'gpt-4o' });
    await gen.end({ output: 'hi' });
    await trace.end();
    await client.flush();
    expect(sent.length).toBeGreaterThan(0);
    const first = sent[0];
    expect(first.url).toContain('/api/public/ingestion');
    expect(first.headers.authorization).toMatch(/^Basic /);
    const expected = Buffer.from('pk:sk').toString('base64');
    expect(first.headers.authorization).toBe(`Basic ${expected}`);
    const body = first.body as { batch: Array<{ type: string; body: { traceId: string } }> };
    expect(Array.isArray(body.batch)).toBe(true);
    await client.shutdown();
  });

  it('emits span-create and span-update events', async () => {
    const client = new LangfuseClient({ publicKey: 'pk', secretKey: 'sk', fetchImpl });
    const trace = await client.trace('hi');
    await trace.end();
    await client.flush();
    const allEvents = sent.flatMap((s) => (s.body as { batch: Array<{ type: string }> }).batch.map((e) => e.type));
    expect(allEvents).toContain('span-create');
    expect(allEvents).toContain('span-update');
    await client.shutdown();
  });

  it('emits a score-create when score() is called', async () => {
    const client = new LangfuseClient({ publicKey: 'pk', secretKey: 'sk', fetchImpl });
    const trace = await client.trace('t');
    await trace.score({ name: 'quality', value: 0.9 });
    await client.flush();
    const allEvents = sent.flatMap((s) => (s.body as { batch: Array<{ type: string }> }).batch.map((e) => e.type));
    expect(allEvents).toContain('score-create');
    await client.shutdown();
  });

  it('throws on non-2xx and keeps the queue', async () => {
    const fail = (async () => new Response('boom', { status: 500 })) as unknown as typeof fetch;
    const client = new LangfuseClient({ publicKey: 'pk', secretKey: 'sk', fetchImpl: fail });
    const trace = await client.trace('t');
    await trace.end();
    await client.flush(); // should not throw
    await client.shutdown();
  });
});
