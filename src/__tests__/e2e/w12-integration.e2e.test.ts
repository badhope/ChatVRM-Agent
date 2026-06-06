/**
 * W12 server integration tests.
 *
 * Boots the full Express app in-process via supertest and exercises
 * every W11b route surface:
 *
 *  - /api/rag            (status, documents, search, upsert, ingest, persist, clear)
 *  - /api/webhooks       (register, list, test, unregister, drain)
 *  - /api/queue          (stats, submit, getJob, pause, resume, drain)
 *  - /api/observability  (traces, manual trace, drain)
 *  - /api/runtime/agents (manifest, graph run, react/crew with no-LLM)
 *
 * The LLM is mocked at the network layer (global fetch) so the test
 * does not require any real API keys. For the ReAct run we use a
 * fixture mode that returns a final-answer from the first iteration.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import request from 'supertest';
import type { Server } from 'node:http';

const realFetch = globalThis.fetch;

function makeJsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    headers: { 'content-type': 'application/json' },
  });
}

/**
 * Build a chat-completions response where the assistant immediately
 * returns a final answer with no tool calls.
 */
function makeFinalAnswerResponse(content: string): Response {
  return makeJsonResponse({
    id: 'cmpl-test',
    object: 'chat.completion',
    choices: [
      {
        index: 0,
        message: { role: 'assistant', content },
        finish_reason: 'stop',
      },
    ],
    usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
  });
}

describe('W12 server integration: RAG + Webhooks + Queue + Observability + Agents runtime', () => {
  let server: Server;
  let app: any;

  beforeAll(async () => {
    process.env.HOME = `/tmp/pa-w12-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    process.env.PERSONAL_ASSISTANT_OPENAI = 'sk-w12-test';

    globalThis.fetch = vi.fn(async (input: any, _init?: RequestInit) => {
      const url = typeof input === 'string' ? input : (input as URL).toString();
      if (url.includes('/chat/completions')) {
        return makeFinalAnswerResponse('Mocked final answer.');
      }
      if (url.endsWith('/models')) {
        return makeJsonResponse({ data: [{ id: 'gpt-4o' }] });
      }
      return makeJsonResponse({ error: 'unexpected' }, 404);
    }) as unknown as typeof fetch;

    // server/app.ts lives outside the src rootDir but vitest resolves it fine at runtime
    // @ts-ignore -- out-of-rootDir import resolved by vitest at runtime
    const { createApp } = await import('../../../server/app.js');
    app = createApp();
    // We don't need to call .listen() — supertest binds to the app directly.
    server = app.listen(0, '127.0.0.1') as Server;
  });

  afterAll(async () => {
    globalThis.fetch = realFetch;
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  /* -------------------------------------------------------------- */
  /* RAG                                                            */
  /* -------------------------------------------------------------- */

  describe('GET /api/rag/status', () => {
    it('returns an empty corpus on a fresh server', async () => {
      const res = await request(app).get('/api/rag/status');
      expect(res.status).toBe(200);
      expect(res.body.documents).toBe(0);
      expect(res.body.dim).toBe(256);
      expect(res.body.hydrated).toBe(false);
    });
  });

  describe('POST /api/rag/upsert', () => {
    it('inserts a single document and reports it back', async () => {
      const res = await request(app)
        .post('/api/rag/upsert')
        .send({ text: 'TypeScript makes code safer.' });
      expect(res.status).toBe(201);
      expect(res.body.id).toBeTruthy();
      expect(res.body.text).toBe('TypeScript makes code safer.');

      const status = await request(app).get('/api/rag/status');
      expect(status.body.documents).toBeGreaterThan(0);
    });

    it('rejects empty input', async () => {
      const res = await request(app).post('/api/rag/upsert').send({ text: '' });
      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/rag/documents', () => {
    it('lists the inserted documents', async () => {
      const res = await request(app).get('/api/rag/documents');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.documents)).toBe(true);
      expect(res.body.documents.length).toBeGreaterThan(0);
      expect(res.body.documents[0]).toHaveProperty('id');
      expect(res.body.documents[0]).toHaveProperty('text');
    });
  });

  describe('POST /api/rag/search', () => {
    it('returns hits for a relevant query (hybrid mode)', async () => {
      const res = await request(app)
        .post('/api/rag/search')
        .send({ query: 'TypeScript', topK: 3, source: 'hybrid' });
      expect(res.status).toBe(200);
      expect(res.body.hits.length).toBeGreaterThan(0);
      const hit = res.body.hits[0];
      expect(hit).toHaveProperty('id');
      expect(hit).toHaveProperty('score');
      expect(hit).toHaveProperty('text');
      expect(hit).toHaveProperty('sources');
    });

    it('returns 400 for missing query', async () => {
      const res = await request(app).post('/api/rag/search').send({});
      expect(res.status).toBe(400);
    });

    it('honours source=keyword', async () => {
      const res = await request(app)
        .post('/api/rag/search')
        .send({ query: 'TypeScript', topK: 3, source: 'keyword' });
      expect(res.status).toBe(200);
    });

    it('honours source=vector', async () => {
      const res = await request(app)
        .post('/api/rag/search')
        .send({ query: 'TypeScript', topK: 3, source: 'vector' });
      expect(res.status).toBe(200);
    });
  });

  describe('POST /api/rag/ingest', () => {
    it('returns 404 for a missing path', async () => {
      const res = await request(app)
        .post('/api/rag/ingest')
        .send({ path: '/no/such/file/here.txt' });
      expect(res.status).toBe(404);
    });

    it('rejects bad input', async () => {
      const res = await request(app).post('/api/rag/ingest').send({});
      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/rag/persist + DELETE /api/rag/documents', () => {
    it('persists then clears the corpus', async () => {
      const persist = await request(app).post('/api/rag/persist');
      expect(persist.status).toBe(200);
      expect(persist.body.saved).toBeGreaterThanOrEqual(0);
      expect(persist.body.path).toContain('vectors.json');

      const clear = await request(app).delete('/api/rag/documents');
      expect(clear.status).toBe(200);
      expect(clear.body.removed).toBeGreaterThanOrEqual(0);

      const after = await request(app).get('/api/rag/status');
      expect(after.body.documents).toBe(0);
    });
  });

  /* -------------------------------------------------------------- */
  /* Webhooks                                                       */
  /* -------------------------------------------------------------- */

  describe('GET /api/webhooks', () => {
    it('returns an empty list initially', async () => {
      const res = await request(app).get('/api/webhooks');
      expect(res.status).toBe(200);
      expect(res.body.webhooks).toEqual([]);
      expect(res.body.total).toBe(0);
    });
  });

  describe('POST /api/webhooks', () => {
    it('rejects invalid URLs', async () => {
      const res = await request(app)
        .post('/api/webhooks')
        .send({ name: 'bad', url: 'not-a-url', events: ['x'] });
      expect(res.status).toBe(400);
    });

    it('rejects empty events list', async () => {
      const res = await request(app)
        .post('/api/webhooks')
        .send({ name: 'x', url: 'http://example.com', events: [] });
      expect(res.status).toBe(400);
    });

    it('registers a webhook with a stub transport and surfaces it on GET', async () => {
      // Use a localhost endpoint that will never receive a request —
      // we just need the registration to succeed. L10 (W19):
      // `skipSsrfCheck: true` is required because the W19 SSRF
      // guard rejects private/loopback URLs by default, and the
      // server route (which we exercise here) doesn't expose a
      // skip flag — the test reaches into the route's internal
      // path by passing a never-resolving transport instead.
      // The webhook registration itself is what we're verifying.
      const res = await request(app)
        .post('/api/webhooks')
        .send({
          name: 'stub',
          url: 'http://127.0.0.1:1/stub',
          events: ['react:done'],
          maxAttempts: 1,
          timeoutMs: 200,
          skipSsrfCheck: true,
        });
      expect(res.status).toBe(201);
      expect(res.body.name).toBe('stub');

      const list = await request(app).get('/api/webhooks');
      expect(list.body.total).toBe(1);
      expect(list.body.webhooks[0].name).toBe('stub');
    });
  });

  describe('POST /api/webhooks/test + DELETE', () => {
    it('emits a synthetic event and unregisters', async () => {
      const emit = await request(app)
        .post('/api/webhooks/test')
        .send({ event: 'react:done', payload: { ok: true } });
      expect(emit.status).toBe(200);
      expect(emit.body.emitted).toBe('react:done');

      const del = await request(app).delete('/api/webhooks/stub');
      expect(del.status).toBe(200);
      expect(del.body.unregistered).toBe('stub');

      const list = await request(app).get('/api/webhooks');
      expect(list.body.total).toBe(0);
    });
  });

  /* -------------------------------------------------------------- */
  /* Queue                                                          */
  /* -------------------------------------------------------------- */

  describe('GET /api/queue/stats', () => {
    it('returns per-state counts', async () => {
      const res = await request(app).get('/api/queue/stats');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('waiting');
      expect(res.body).toHaveProperty('active');
      expect(res.body).toHaveProperty('completed');
      expect(res.body).toHaveProperty('failed');
      expect(res.body).toHaveProperty('delayed');
      expect(res.body).toHaveProperty('paused');
      expect(res.body.name).toBe('server-runtime');
    });
  });

  describe('POST /api/queue/jobs', () => {
    it('submits a job and returns its id', async () => {
      const res = await request(app)
        .post('/api/queue/jobs')
        .send({ name: 'no-such-processor', data: { hello: 'world' }, attempts: 1 });
      expect(res.status).toBe(201);
      expect(res.body.id).toBeTruthy();
      expect(res.body.name).toBe('no-such-processor');
    });

    it('rejects bad payloads', async () => {
      const res = await request(app).post('/api/queue/jobs').send({});
      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/queue/jobs/:id', () => {
    it('looks up a job by id', async () => {
      const submit = await request(app)
        .post('/api/queue/jobs')
        .send({ name: 'lookup-me', data: { x: 1 } });
      const id = submit.body.id as string;
      const res = await request(app).get(`/api/queue/jobs/${id}`);
      expect(res.status).toBe(200);
      expect(res.body.id).toBe(id);
    });

    it('404 for missing id', async () => {
      const res = await request(app).get('/api/queue/jobs/missing-id');
      expect(res.status).toBe(404);
    });
  });

  describe('POST /api/queue/pause + resume + drain', () => {
    // M19b (W19): earlier tests in this file submit jobs (e.g.
    // `no-such-processor`, `lookup-me`) that have no registered
    // processor, so they sit in `waiting` forever. The W19
    // drain route now returns `drained: false` when the queue
    // still has jobs — the W12 implementation was the opposite
    // (always-true best-effort). The pre-W19 test passed by
    // accident because the response was unconditional. We now
    // explicitly purge via the new `queue.clear()` API before
    // asserting, which both keeps the test isolated and
    // exercises the new operator-facing endpoint behaviour.
    beforeEach(async () => {
      const clear = await request(app).post('/api/queue/clear');
      expect(clear.status).toBe(200);
      expect(typeof clear.body.removed).toBe('number');
    });
    it('flips the paused flag', async () => {
      const pause = await request(app).post('/api/queue/pause');
      expect(pause.status).toBe(200);
      expect(pause.body.paused).toBe(true);

      const resume = await request(app).post('/api/queue/resume');
      expect(resume.status).toBe(200);
      expect(resume.body.paused).toBe(false);

      const drain = await request(app).post('/api/queue/drain');
      expect(drain.status).toBe(200);
      expect(drain.body.drained).toBe(true);
    });
  });

  /* -------------------------------------------------------------- */
  /* Observability                                                  */
  /* -------------------------------------------------------------- */

  describe('GET /api/observability/traces', () => {
    it('returns a summary of the no-op buffer', async () => {
      const res = await request(app).get('/api/observability/traces');
      expect(res.status).toBe(200);
      expect(res.body.backend).toBe('noop');
      expect(res.body).toHaveProperty('captured');
      expect(res.body).toHaveProperty('max');
    });
  });

  describe('POST /api/observability/trace + drain', () => {
    it('opens a manual trace and drains it', async () => {
      const t = await request(app)
        .post('/api/observability/trace')
        .send({ name: 'test.trace', input: { a: 1 } });
      expect(t.status).toBe(200);
      expect(t.body.trace).toBe('test.trace');
      expect(t.body.ended).toBe(true);

      const drain = await request(app).post('/api/observability/drain');
      expect(drain.status).toBe(200);
      expect(Array.isArray(drain.body.records)).toBe(true);
      // The manual trace should be in the drained buffer.
      const names = (drain.body.records as Array<{ name: string }>).map((r) => r.name);
      expect(names).toContain('test.trace');
    });
  });

  /* -------------------------------------------------------------- */
  /* Agents runtime                                                 */
  /* -------------------------------------------------------------- */

  describe('GET /api/runtime/agents/manifest', () => {
    it('returns registered tools and advertised models', async () => {
      const res = await request(app).get('/api/runtime/agents/manifest');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.tools)).toBe(true);
      // The mocked /models endpoint returns [{ id: 'gpt-4o' }], so the
      // listModels call should surface it.
      expect(res.body.models).toContain('gpt-4o');
    });
  });

  describe('POST /api/runtime/agents/graph', () => {
    it('runs a tiny 2-node graph to completion', async () => {
      const res = await request(app)
        .post('/api/runtime/agents/graph')
        .send({
          nodes: [
            { id: 'a', kind: 'echo' },
            { id: 'b', kind: 'uppercase' },
          ],
          edges: [
            { from: 'a', to: 'b' },
            { from: 'b', to: '__end__', end: true },
          ],
          initialState: { text: 'hi' },
        });
      expect(res.status).toBe(200);
      expect(res.body.finalState.text).toBe('HI');
    });

    it('rejects bad payloads', async () => {
      const res = await request(app).post('/api/runtime/agents/graph').send({});
      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/runtime/agents/react', () => {
    it('runs a ReAct trajectory and returns a final answer (mocked LLM)', async () => {
      const res = await request(app)
        .post('/api/runtime/agents/react')
        .send({ input: 'What is 2+2?', maxIterations: 1 });
      expect(res.status).toBe(200);
      expect(res.body.output).toBe('Mocked final answer.');
      expect(res.body.finishReason).toBe('final-answer');
    });
  });

  describe('POST /api/runtime/agents/crew', () => {
    it('rejects bad agent specs', async () => {
      const res = await request(app)
        .post('/api/runtime/agents/crew')
        .send({ input: 'x' /* no agents */ });
      expect(res.status).toBe(400);
    });
  });
});
