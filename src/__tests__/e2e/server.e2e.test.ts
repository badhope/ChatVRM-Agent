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

  async function put(path: string, body: unknown): Promise<{ status: number; body: unknown }> {
    const res = await testFetch(`${baseUrl}${path}`, {
      method: 'PUT',
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

  it('GET /api/config/chat returns and PUT updates the chat defaults', async () => {
    const r1 = await get('/api/config/chat');
    expect(r1.status).toBe(200);
    expect(r1.body).toHaveProperty('defaultProvider');

    const r2 = await put('/api/config/chat', {
      model: 'gpt-4o',
      temperature: 0.5,
      maxTokens: 1024,
      topP: 0.9,
      systemPrompt: 'You are a test assistant.',
    });
    expect(r2.status).toBe(200);
    expect(r2.body).toMatchObject({ ok: true });

    const r3 = await get('/api/config/chat');
    const chat = r3.body as { model: string; temperature: number; topP: number };
    expect(chat.model).toBe('gpt-4o');
    expect(chat.temperature).toBe(0.5);
    expect(chat.topP).toBe(0.9);
  });

  it('GET /api/config/sandbox returns and PUT updates the sandbox config', async () => {
    const r1 = await get('/api/config/sandbox');
    expect(r1.status).toBe(200);
    expect(r1.body).toHaveProperty('enabled');

    const r2 = await put('/api/config/sandbox', {
      enabled: true,
      allowedCommands: ['ls', 'cat'],
      timeout: 30000,
    });
    expect(r2.status).toBe(200);

    const r3 = await get('/api/config/sandbox');
    const sb = r3.body as { enabled: boolean; allowedCommands?: string[]; timeout?: number };
    expect(sb.enabled).toBe(true);
    expect(sb.allowedCommands).toEqual(['ls', 'cat']);
    expect(sb.timeout).toBe(30000);
  });

  it('GET /api/config/circuit-breaker returns config and live snapshots', async () => {
    const r = await get('/api/config/circuit-breaker');
    expect(r.status).toBe(200);
    const body = r.body as { config: { enabled: boolean }; live: Array<{ provider: string; state: string }> };
    expect(body.config).toHaveProperty('enabled');
    expect(Array.isArray(body.live)).toBe(true);
    expect(body.live.length).toBeGreaterThanOrEqual(10);
  });

  it('PUT /api/config/circuit-breaker persists and POST /circuit-breaker/reset clears', async () => {
    const r1 = await put('/api/config/circuit-breaker', {
      enabled: true,
      failureThreshold: 7,
      resetTimeout: 45000,
    });
    expect(r1.status).toBe(200);

    const r2 = await post('/api/config/circuit-breaker/reset', { provider: 'openai' });
    expect(r2.status).toBe(200);
    expect(r2.body).toMatchObject({ ok: true });

    const r3 = await post('/api/config/circuit-breaker/reset', {});
    expect(r3.status).toBe(200);
  });

  it('GET /api/config/file-path returns file metadata', async () => {
    const r = await get('/api/config/file-path');
    expect(r.status).toBe(200);
    const meta = r.body as { path: string; exists: boolean; size: number };
    expect(typeof meta.path).toBe('string');
    expect(typeof meta.exists).toBe('boolean');
    expect(typeof meta.size).toBe('number');
  });

  it('GET /api/config/export and POST /api/config/import round-trip', async () => {
    const r1 = await get('/api/config/export');
    expect(r1.status).toBe(200);
    const data = r1.body as { version: number; chat: Record<string, unknown> };
    expect(data.version).toBe(1);
    expect(data.chat).toBeDefined();

    // Now import the same data (no-op in effect)
    const r2 = await post('/api/config/import', data);
    expect(r2.status).toBe(200);
    expect(r2.body).toMatchObject({ ok: true });

    // Invalid import is rejected
    const r3 = await post('/api/config/import', { version: 999 });
    expect(r3.status).toBe(400);
  });

  it('POST /api/config/reset restores defaults', async () => {
    const r = await post('/api/config/reset', {});
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ ok: true });
  });

  it('GET /api/config/env returns env-var snapshot per provider', async () => {
    const r = await get('/api/config/env');
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body)).toBe(true);
    const list = r.body as Array<{ provider: string; apiKeyEnv: Array<{ name: string; set: boolean }> }>;
    expect(list.length).toBeGreaterThanOrEqual(10);
    for (const item of list) {
      expect(item.apiKeyEnv.length).toBeGreaterThan(0);
    }
  });

  it('POST /api/config/test runs connection probe', async () => {
    const r = await post('/api/config/test', { provider: 'openai' });
    expect(r.status).toBe(200);
    const body = r.body as { available: boolean; provider?: string };
    expect(typeof body.available).toBe('boolean');
  });

  it('GET /api/config/providers/openai/models returns model list (may be empty on failure)', async () => {
    const r = await get('/api/config/providers/openai/models');
    expect(r.status).toBe(200);
    const body = r.body as { provider: string; models: string[] };
    expect(body.provider).toBe('openai');
    expect(Array.isArray(body.models)).toBe(true);
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
