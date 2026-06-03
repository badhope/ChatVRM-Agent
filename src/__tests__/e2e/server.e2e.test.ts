/**
 * Server end-to-end smoke test.
 *
 * Boots the Express app in-process, then exercises the full HTTP surface:
 * - /api/health
 * - /api/config (providers, snapshot, set-key, set-base-url, set-default)
 * - /api/memory (list, recall, consolidate, stats)
 * - /api/personality (list, set, including invalid input)
 * - /api/tools (list)
 * - /api/dashboard
 * - /api/chat (session CRUD, stream with abort)
 * - /api/agent (run with abort)
 *
 * The LLM is mocked at the network layer (global fetch) so the test does
 * not require any real API keys.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';

const realFetch = globalThis.fetch;
const testFetch = realFetch.bind(globalThis);

function makeSSEResponse(chunks: string[], status = 200): Response {
  const encoder = new TextEncoder();
  let i = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (i < chunks.length) {
        controller.enqueue(encoder.encode(chunks[i]));
        i++;
      } else {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    headers: { 'content-type': 'text/event-stream' },
  });
}

function makeJsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    headers: { 'content-type': 'application/json' },
  });
}

describe('server end-to-end smoke', () => {
  let server: Server;
  let baseUrl: string;
  let cookie: string | undefined;

  beforeAll(async () => {
    process.env.HOME = `/tmp/pa-e2e-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    process.env.PERSONAL_ASSISTANT_OPENAI = 'sk-e2e-test';

    globalThis.fetch = vi.fn(async (input: any, _init?: RequestInit) => {
      const url = typeof input === 'string' ? input : (input as URL).toString();
      if (url.includes('/chat/completions')) {
        return makeSSEResponse([
          'data: {"choices":[{"delta":{"content":"Hello "}}]}\n\n',
          'data: {"choices":[{"delta":{"content":"world!"}}]}\n\n',
          'data: [DONE]\n\n',
        ]);
      }
      if (url.endsWith('/models')) {
        return makeJsonResponse({ data: [{ id: 'gpt-4o' }, { id: 'gpt-4-turbo' }] });
      }
      return makeJsonResponse({ error: 'unexpected' }, 404);
    }) as unknown as typeof fetch;

    // server/app.ts lives outside the src rootDir but vitest resolves it fine at runtime
    // @ts-ignore -- out-of-rootDir import resolved by vitest at runtime
    const { createApp } = await import('../../../server/app.js');
    const app = createApp();
    server = app.listen(0, '127.0.0.1');
    await new Promise<void>((resolve) => server.once('listening', () => resolve()));
    const addr = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${addr.port}`;
  });

  afterAll(async () => {
    globalThis.fetch = realFetch;
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  async function get(path: string): Promise<{ status: number; body: unknown }> {
    const res = await testFetch(`${baseUrl}${path}`, {
      headers: cookie ? { cookie } : {},
    });
    const setCookie = res.headers.get('set-cookie');
    if (setCookie) cookie = setCookie.split(';')[0];
    const text = await res.text();
    let body: unknown = text;
    try {
      body = JSON.parse(text);
    } catch {
      // not json
    }
    return { status: res.status, body };
  }

  async function post(path: string, body: unknown): Promise<{ status: number; body: unknown }> {
    const res = await testFetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(cookie ? { cookie } : {}),
      },
      body: JSON.stringify(body),
    });
    const setCookie = res.headers.get('set-cookie');
    if (setCookie) cookie = setCookie.split(';')[0];
    const text = await res.text();
    let json: unknown = text;
    try {
      json = JSON.parse(text);
    } catch {
      // not json
    }
    return { status: res.status, body: json };
  }

  async function del(path: string): Promise<{ status: number; body: unknown }> {
    const res = await testFetch(`${baseUrl}${path}`, {
      method: 'DELETE',
      headers: cookie ? { cookie } : {},
    });
    const text = await res.text();
    let json: unknown = text;
    try {
      json = JSON.parse(text);
    } catch {
      // not json
    }
    return { status: res.status, body: json };
  }

  it('GET /api/health returns ok', async () => {
    const { status, body } = await get('/api/health');
    expect(status).toBe(200);
    expect(body).toMatchObject({ ok: true });
  });

  it('GET /api/config/providers returns 10 providers with hasKey', async () => {
    const { status, body } = await get('/api/config/providers');
    expect(status).toBe(200);
    const list = body as Array<{ id: string; hasKey: boolean; baseUrl: string }>;
    expect(list.length).toBe(10);
    const openai = list.find((p) => p.id === 'openai');
    expect(openai).toBeDefined();
    expect(openai?.hasKey).toBe(true);
    expect(openai?.baseUrl).toContain('api.openai.com');
  });

  it('POST /api/config/set-key persists and updates hasKey', async () => {
    const { status, body } = await post('/api/config/set-key', {
      provider: 'anthropic',
      key: '  sk-anthro-trim-test  ',
    });
    expect(status).toBe(200);
    expect(body).toMatchObject({ ok: true });

    const after = await get('/api/config/providers');
    const list = after.body as Array<{ id: string; hasKey: boolean }>;
    const anthro = list.find((p) => p.id === 'anthropic');
    expect(anthro?.hasKey).toBe(true);
  });

  it('POST /api/config/set-base-url validates URL and persists', async () => {
    const bad = await post('/api/config/set-base-url', {
      provider: 'openai',
      baseUrl: 'not-a-url',
    });
    expect(bad.status).toBe(400);

    const ok = await post('/api/config/set-base-url', {
      provider: 'openai',
      baseUrl: 'https://custom.example.com/v1',
    });
    expect(ok.status).toBe(200);

    const after = await get('/api/config/providers');
    const list = after.body as Array<{ id: string; baseUrl: string }>;
    const openai = list.find((p) => p.id === 'openai');
    expect(openai?.baseUrl).toBe('https://custom.example.com/v1');

    const reset = await post('/api/config/reset-base-url', { provider: 'openai' });
    expect(reset.status).toBe(200);

    const restored = await get('/api/config/providers');
    const restoredList = restored.body as Array<{ id: string; baseUrl: string }>;
    const restoredOpenai = restoredList.find((p) => p.id === 'openai');
    expect(restoredOpenai?.baseUrl).toContain('api.openai.com');
  });

  it('GET /api/config/snapshot returns chat config and apiKeys', async () => {
    const { status, body } = await get('/api/config/snapshot');
    expect(status).toBe(200);
    expect(body).toHaveProperty('defaultProvider');
    expect(body).toHaveProperty('apiKeys');
    expect(body).toHaveProperty('chat');
  });

  it('POST /api/config/set-default updates default provider', async () => {
    const { status, body } = await post('/api/config/set-default', { provider: 'anthropic' });
    expect(status).toBe(200);
    expect(body).toMatchObject({ ok: true });
    const snap = await get('/api/config/snapshot');
    expect((snap.body as { defaultProvider: string }).defaultProvider).toBe('anthropic');
    // restore
    await post('/api/config/set-default', { provider: 'siliconflow' });
  });

  it('GET /api/personality returns presets and current', async () => {
    const { status, body } = await get('/api/personality');
    expect(status).toBe(200);
    const data = body as { current: string; list: Array<{ id: string; systemPrompt: string }> };
    expect(data.current).toBeTruthy();
    expect(data.list.length).toBeGreaterThan(0);
    expect(data.list[0].systemPrompt.length).toBeGreaterThan(0);
  });

  it('POST /api/personality/set rejects unknown preset', async () => {
    const r1 = await post('/api/personality/set', { id: '__proto__' });
    expect(r1.status).toBe(400);

    const r2 = await post('/api/personality/set', { id: 'not_a_real_preset' });
    expect(r2.status).toBe(400);

    const r3 = await post('/api/personality/set', { id: 'tech_expert' });
    expect(r3.status).toBe(200);
    expect(r3.body).toMatchObject({ ok: true, current: 'tech_expert' });

    // restore default
    await post('/api/personality/set', { id: 'friendly_mentor' });
  });

  it('GET /api/tools lists default tools', async () => {
    const { status, body } = await get('/api/tools');
    expect(status).toBe(200);
    expect(Array.isArray(body)).toBe(true);
  });

  it('GET /api/memory?query=xxx filters records', async () => {
    const r2 = await get('/api/memory?q=xyzzy42');
    expect(r2.status).toBe(200);
    const body = r2.body as { total: number; count: number; items: Array<{ input: string }> };
    expect(body.items.length).toBe(0); // none stored yet
  });

  it('GET /api/memory/tags returns array', async () => {
    const r = await get('/api/memory/tags');
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body)).toBe(true);
  });

  it('GET /api/memory/stats returns expected fields', async () => {
    const { status, body } = await get('/api/memory/stats');
    expect(status).toBe(200);
    expect(body).toHaveProperty('totalRecords');
    expect(body).toHaveProperty('totalTokens');
    expect(body).toHaveProperty('lastConsolidation');
  });

  it('GET /api/dashboard returns aggregate stats', async () => {
    const { status, body } = await get('/api/dashboard');
    expect(status).toBe(200);
    expect(body).toHaveProperty('providersTotal');
    expect(body).toHaveProperty('providersConfigured');
  });

  it('POST /api/chat/stream aborts on client disconnect', async () => {
    const ctrl = new AbortController();
    const res = await testFetch(`${baseUrl}/api/chat/stream`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        message: 'hello',
        provider: 'openai',
        model: 'gpt-4o',
      }),
      signal: ctrl.signal,
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/event-stream');
    const reader = res.body?.getReader();
    if (reader) {
      await reader.read();
      ctrl.abort();
      try {
        await reader.cancel();
      } catch {
        // expected
      }
    }
  });

  it('POST /api/chat/sessions creates and reads a session', async () => {
    const created = await post('/api/chat/sessions', {
      title: 'e2e-test',
      provider: 'openai',
      model: 'gpt-4o',
    });
    expect(created.status).toBe(200);
    const session = created.body as { id: string; title: string };
    expect(session.id).toBeTruthy();
    expect(session.title).toBe('e2e-test');

    const list = await get('/api/chat/sessions');
    const listBody = list.body as Array<{ id: string }>;
    expect(listBody.find((s) => s.id === session.id)).toBeDefined();

    const got = await get(`/api/chat/sessions/${session.id}`);
    expect(got.status).toBe(200);

    const missing = await get('/api/chat/sessions/nonexistent_id');
    expect(missing.status).toBe(404);

    const removed = await del(`/api/chat/sessions/${session.id}`);
    expect(removed.status).toBe(200);
  });

  it('POST /api/agent/run returns an SSE pipeline-end event', async () => {
    const res = await testFetch(`${baseUrl}/api/agent/run`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ task: 'just say hi', provider: 'openai', model: 'gpt-4o' }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/event-stream');
    const text = await res.text();
    expect(text).toContain('event: pipeline-end');
  });

  it('GET /api/emotion returns current emotion', async () => {
    const { status, body } = await get('/api/emotion');
    expect(status).toBe(200);
    expect(body).toHaveProperty('name');
    expect(body).toHaveProperty('intensity');
  });
});
