/**
 * LLM cache tests.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { LLMCache } from '../../../integration/llm-cache.js';
import type { ILLMPort, ChatResponse, ChatParams, StreamChunk } from '../../../ports/llm.port.js';

function makeMockLLM(respond: () => ChatResponse): ILLMPort & { calls: number } {
  const mock = {
    calls: 0,
    async chat(_p: ChatParams) {
      mock.calls += 1;
      return respond();
    },
    async *stream(_p: ChatParams): AsyncGenerator<StreamChunk> { /* noop */ throw new Error('not used'); },
    async listModels(_provider: ChatParams['provider']) { return []; },
    async isAvailable(_provider: ChatParams['provider']) { return true; },
  };
  return mock;
}

describe('LLMCache', () => {
  let now: number;
  beforeEach(() => { now = 1_000_000; });

  function makeCache(opts: Partial<ConstructorParameters<typeof LLMCache>[0]> = {}): LLMCache {
    return new LLMCache({ now: () => now, ttlMs: 60_000, maxEntries: 8, ...opts });
  }

  it('caches an identical request', async () => {
    const llm = makeMockLLM(() => ({ content: 'hi', model: 'm', usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 } }));
    const cache = makeCache();
    const wrapped = cache.wrap(llm);
    const req: ChatParams = { provider: 'openai' as never, model: 'gpt', messages: [{ role: 'user', content: 'hello' }] };
    const r1 = await wrapped.chat(req);
    const r2 = await wrapped.chat(req);
    expect(r1).toBe(r2);
    expect(llm.calls).toBe(1);
    expect(cache.hitCount).toBe(1);
    expect(cache.missCount).toBe(1);
  });

  it('different requests miss the cache', async () => {
    const llm = makeMockLLM(() => ({ content: 'x', model: 'm', usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 } }));
    const cache = makeCache();
    const wrapped = cache.wrap(llm);
    await wrapped.chat({ provider: 'openai' as never, messages: [{ role: 'user', content: 'a' }] });
    await wrapped.chat({ provider: 'openai' as never, messages: [{ role: 'user', content: 'b' }] });
    expect(llm.calls).toBe(2);
    expect(cache.hitCount).toBe(0);
  });

  it('keys ignore message order, but respect content', async () => {
    const k1 = LLMCache.keyOf({ provider: 'p' as never, messages: [{ role: 'user', content: 'a' }] });
    const k2 = LLMCache.keyOf({ provider: 'p' as never, messages: [{ role: 'user', content: 'a' }] });
    const k3 = LLMCache.keyOf({ provider: 'p' as never, messages: [{ role: 'user', content: 'b' }] });
    expect(k1).toBe(k2);
    expect(k1).not.toBe(k3);
  });

  it('expiry: an entry past TTL is a miss', async () => {
    const llm = makeMockLLM(() => ({ content: 'x', model: 'm', usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 } }));
    const cache = makeCache({ ttlMs: 100 });
    const wrapped = cache.wrap(llm);
    const req: ChatParams = { provider: 'openai' as never, messages: [{ role: 'user', content: 'a' }] };
    await wrapped.chat(req);
    expect(cache.hitCount).toBe(0);
    // advance the clock past TTL
    now += 200;
    await wrapped.chat(req);
    expect(cache.hitCount).toBe(0);
    expect(llm.calls).toBe(2);
  });

  it('LRU eviction: oldest entry is dropped at maxEntries', async () => {
    const llm = makeMockLLM(() => ({ content: 'x', model: 'm', usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 } }));
    const cache = makeCache({ maxEntries: 2 });
    const wrapped = cache.wrap(llm);
    await wrapped.chat({ provider: 'p' as never, messages: [{ role: 'user', content: 'a' }] });
    await wrapped.chat({ provider: 'p' as never, messages: [{ role: 'user', content: 'b' }] });
    await wrapped.chat({ provider: 'p' as never, messages: [{ role: 'user', content: 'c' }] });
    expect(cache.size).toBe(2);
    // 'a' should be evicted.
    const k = LLMCache.keyOf({ provider: 'p' as never, messages: [{ role: 'user', content: 'a' }] });
    expect(cache.has(k)).toBe(false);
  });

  it('clear() drops everything and resets counters', async () => {
    const llm = makeMockLLM(() => ({ content: 'x', model: 'm', usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 } }));
    const cache = makeCache();
    const wrapped = cache.wrap(llm);
    await wrapped.chat({ provider: 'p' as never, messages: [{ role: 'user', content: 'a' }] });
    await wrapped.chat({ provider: 'p' as never, messages: [{ role: 'user', content: 'a' }] });
    expect(cache.hitCount).toBe(1);
    cache.clear();
    expect(cache.size).toBe(0);
    expect(cache.hitCount).toBe(0);
  });

  it('wraps listModels / isAvailable / stream without interfering', async () => {
    const llm = makeMockLLM(() => ({ content: '', model: '', usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 } }));
    llm.listModels = async () => [{ id: 'm1' } as never];
    llm.isAvailable = async () => true;
    const cache = makeCache();
    const wrapped = cache.wrap(llm);
    expect(await wrapped.listModels('openai' as never)).toHaveLength(1);
    expect(await wrapped.isAvailable('openai' as never)).toBe(true);
  });

  it('stable key: tools are part of the key', () => {
    const k1 = LLMCache.keyOf({ provider: 'p' as never, messages: [{ role: 'user', content: 'a' }] });
    const k2 = LLMCache.keyOf({ provider: 'p' as never, messages: [{ role: 'user', content: 'a' }], tools: [{ name: 't', description: 'd', parameters: {} }] });
    expect(k1).not.toBe(k2);
  });
});
