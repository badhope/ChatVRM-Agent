/**
 * Webhook tests.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { EventEmitter } from 'eventemitter3';
import { AgentEventWebhook, WebhookRouter, type WebhookTransport } from '../../../integration/webhooks.js';

function makeBus(): EventEmitter {
  return new EventEmitter();
}

describe('AgentEventWebhook', () => {
  let bus: EventEmitter;
  beforeEach(() => { bus = makeBus(); });

  it('delivers matching events to the URL', async () => {
    const calls: Array<{ url: string; body: string }> = [];
    const transport: WebhookTransport = async ({ url, body }) => {
      calls.push({ url, body });
      return { ok: true, status: 200 };
    };
    const w = new AgentEventWebhook({
      name: 'w1',
      url: 'http://localhost/webhook',
      events: ['react:start', 'react:done'],
      queueMode: true,
    }, transport);
    w.bind(bus);
    bus.emit('react:start', { input: 'hi', toolCount: 0 });
    bus.emit('react:done', { result: { output: 'done', steps: [], iterations: 0, totalTokens: 0, finishReason: 'final-answer' } });
    await w.drain();
    expect(calls).toHaveLength(2);
    expect(calls[0]!.body).toContain('react:start');
    expect(calls[1]!.body).toContain('react:done');
    w.unbind();
  });

  it('does not deliver events the webhook is not subscribed to', async () => {
    let count = 0;
    const transport: WebhookTransport = async () => { count += 1; return { ok: true, status: 200 }; };
    const w = new AgentEventWebhook({
      name: 'w',
      url: 'http://x',
      events: ['react:start'],
    }, transport);
    w.bind(bus);
    bus.emit('react:done', { result: { output: '', steps: [], iterations: 0, totalTokens: 0, finishReason: 'final-answer' } });
    await w.drain();
    expect(count).toBe(0);
    w.unbind();
  });

  it('respects a filter predicate', async () => {
    let count = 0;
    const transport: WebhookTransport = async () => { count += 1; return { ok: true, status: 200 }; };
    const w = new AgentEventWebhook({
      name: 'w',
      url: 'http://x',
      events: ['react:start'],
      filter: (p) => ((p as { input: string }).input).length > 5,
      queueMode: true,
    }, transport);
    w.bind(bus);
    bus.emit('react:start', { input: 'hi', toolCount: 0 });
    bus.emit('react:start', { input: 'long message here', toolCount: 0 });
    await w.drain();
    expect(count).toBe(1);
    w.unbind();
  });

  it('retries on transient 5xx and eventually succeeds', async () => {
    let n = 0;
    const transport: WebhookTransport = async () => {
      n += 1;
      return n < 2 ? { ok: false, status: 503 } : { ok: true, status: 200 };
    };
    const w = new AgentEventWebhook({
      name: 'w',
      url: 'http://x',
      events: ['react:start'],
      queueMode: true,
      maxAttempts: 3,
      backoffMultiplier: 1,
    }, transport, async () => {});
    w.bind(bus);
    bus.emit('react:start', { input: 'a', toolCount: 0 });
    await w.drain();
    expect(w.deliveredCount).toBe(1);
    expect(w.lastResult?.attempts).toBe(2);
    w.unbind();
  });

  it('does not retry on a permanent 4xx', async () => {
    let n = 0;
    const transport: WebhookTransport = async () => { n += 1; return { ok: false, status: 400 }; };
    const w = new AgentEventWebhook({
      name: 'w',
      url: 'http://x',
      events: ['react:start'],
      queueMode: true,
      maxAttempts: 3,
    }, transport, async () => {});
    w.bind(bus);
    bus.emit('react:start', { input: 'a', toolCount: 0 });
    await w.drain();
    expect(n).toBe(1);
    expect(w.failedCount).toBe(1);
    w.unbind();
  });

  it('retries on a 429 (rate limit)', async () => {
    let n = 0;
    const transport: WebhookTransport = async () => {
      n += 1;
      return n < 3 ? { ok: false, status: 429 } : { ok: true, status: 200 };
    };
    const w = new AgentEventWebhook({
      name: 'w',
      url: 'http://x',
      events: ['react:start'],
      queueMode: true,
      maxAttempts: 3,
    }, transport, async () => {});
    w.bind(bus);
    bus.emit('react:start', { input: 'a', toolCount: 0 });
    await w.drain();
    expect(w.deliveredCount).toBe(1);
    w.unbind();
  });

  it('signs the body with HMAC-SHA256 when a secret is configured', async () => {
    let captured: { headers: Record<string, string>; body: string } | null = null;
    const transport: WebhookTransport = async (req) => {
      captured = { headers: req.headers, body: req.body };
      return { ok: true, status: 200 };
    };
    const w = new AgentEventWebhook({
      name: 'w',
      url: 'http://x',
      events: ['react:start'],
      queueMode: true,
      secret: 'topsecret',
    }, transport, async () => {});
    w.bind(bus);
    bus.emit('react:start', { input: 'a', toolCount: 0 });
    await w.drain();
    expect(captured).not.toBeNull();
    expect(captured!.headers['X-Signature']).toMatch(/^[a-f0-9]{64}$/);
    w.unbind();
  });

  it('attaches custom headers', async () => {
    let captured: Record<string, string> = {};
    const transport: WebhookTransport = async (req) => { captured = req.headers; return { ok: true, status: 200 }; };
    const w = new AgentEventWebhook({
      name: 'w',
      url: 'http://x',
      events: ['react:start'],
      customHeaders: { Authorization: 'Bearer xyz' },
    }, transport);
    w.bind(bus);
    bus.emit('react:start', { input: 'a', toolCount: 0 });
    await w.drain();
    expect(captured['Authorization']).toBe('Bearer xyz');
    w.unbind();
  });

  it('unbind() stops further deliveries', async () => {
    let count = 0;
    const transport: WebhookTransport = async () => { count += 1; return { ok: true, status: 200 }; };
    const w = new AgentEventWebhook({
      name: 'w',
      url: 'http://x',
      events: ['react:start'],
    }, transport);
    w.bind(bus);
    bus.emit('react:start', { input: 'a', toolCount: 0 });
    await w.drain();
    expect(count).toBe(1);
    w.unbind();
    bus.emit('react:start', { input: 'b', toolCount: 0 });
    await w.drain();
    expect(count).toBe(1);
  });
});

describe('WebhookRouter', () => {
  it('routes events to multiple webhooks', async () => {
    const bus = makeBus();
    const calls: string[] = [];
    const transport: WebhookTransport = async (req) => { calls.push(JSON.parse(req.body).event); return { ok: true, status: 200 }; };
    const router = new WebhookRouter({ bus, transport });
    await router.register({ name: 'a', url: 'http://a', events: ['react:start'] });
    await router.register({ name: 'b', url: 'http://b', events: ['react:start', 'react:done'] });
    bus.emit('react:start', { input: 'a', toolCount: 0 });
    bus.emit('react:done', { result: { output: '', steps: [], iterations: 0, totalTokens: 0, finishReason: 'final-answer' } });
    await router.drainAll();
    // 2 webhooks subscribe to 'react:start' → 2 calls. 1 subscribes to 'react:done' → 1 call.
    expect(calls).toEqual(expect.arrayContaining(['react:start', 'react:done']));
    expect(calls.length).toBe(3);
    router.destroy();
  });

  it('unregister() removes a webhook', async () => {
    const bus = makeBus();
    const router = new WebhookRouter({ bus, transport: async () => ({ ok: true, status: 200 }) });
    await router.register({ name: 'a', url: 'http://a', events: ['react:start'] });
    expect(router.list()).toHaveLength(1);
    expect(router.unregister('a')).toBe(true);
    expect(router.list()).toHaveLength(0);
    expect(router.unregister('a')).toBe(false);
  });

  it('get() returns the named webhook', async () => {
    const bus = makeBus();
    const router = new WebhookRouter({ bus, transport: async () => ({ ok: true, status: 200 }) });
    const w = await router.register({ name: 'a', url: 'http://a', events: ['react:start'] });
    expect(router.get('a')).toBe(w);
    expect(router.get('nope')).toBeUndefined();
  });

  it('destroy() unbinds everything', async () => {
    const bus = makeBus();
    let count = 0;
    const transport: WebhookTransport = async () => { count += 1; return { ok: true, status: 200 }; };
    const router = new WebhookRouter({ bus, transport });
    router.register({ name: 'a', url: 'http://a', events: ['react:start'] });
    router.destroy();
    bus.emit('react:start', { input: 'a', toolCount: 0 });
    expect(count).toBe(0);
  });
});
