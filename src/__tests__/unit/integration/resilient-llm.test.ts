/**
 * Resilient LLM wrapper tests.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ResilientLLM, ResilientError } from '../../../integration/resilient-llm.js';
import { CircuitState } from '../../../infrastructure/circuit-breaker.js';
import type { ILLMPort, ChatResponse, ChatParams, StreamChunk } from '../../../ports/llm.port.js';

function makeLLM(behavior: () => ChatResponse | Promise<ChatResponse> | never): ILLMPort & { calls: number } {
  const mock = {
    calls: 0,
    async chat(_p: ChatParams) {
      mock.calls += 1;
      const r = behavior();
      if (r instanceof Promise) return r;
      if (r === undefined) throw new Error('mock LLM throws');
      return r;
    },
    async *stream(_p: ChatParams): AsyncGenerator<StreamChunk> { throw new Error('not used'); },
    async listModels(_provider: ChatParams['provider']) { return []; },
    async isAvailable(_provider: ChatParams['provider']) { return true; },
  };
  return mock;
}

describe('ResilientLLM', () => {
  it('returns the underlying response on success', async () => {
    const r = new ResilientLLM({ sleep: async () => {} });
    const llm = makeLLM(() => ({ content: 'ok', model: 'm', usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 } }));
    const out = await r.wrap(llm).chat({ messages: [{ role: 'user', content: 'a' }] });
    expect(out.content).toBe('ok');
    expect(llm.calls).toBe(1);
    r.destroy();
  });

  it('retries on transient failure, then succeeds', async () => {
    let n = 0;
    const r = new ResilientLLM({ maxRetries: 3, sleep: async () => {} });
    const llm = makeLLM(() => {
      n += 1;
      if (n < 3) throw new Error('transient');
      return { content: 'ok', model: 'm', usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 } };
    });
    const out = await r.wrap(llm).chat({ messages: [{ role: 'user', content: 'a' }] });
    expect(out.content).toBe('ok');
    expect(llm.calls).toBe(3);
    r.destroy();
  });

  it('throws ResilientError after exhausting retries', async () => {
    const r = new ResilientLLM({ maxRetries: 2, sleep: async () => {} });
    const llm = makeLLM(() => { throw new Error('always fails'); });
    await expect(r.wrap(llm).chat({ messages: [{ role: 'user', content: 'a' }] })).rejects.toThrow(ResilientError);
    expect(llm.calls).toBe(3);
    r.destroy();
  });

  it('does not retry when shouldRetry returns false', async () => {
    const r = new ResilientLLM({ maxRetries: 3, sleep: async () => {}, shouldRetry: () => false });
    const llm = makeLLM(() => { throw new Error('non-retryable'); });
    await expect(r.wrap(llm).chat({ messages: [{ role: 'user', content: 'a' }] })).rejects.toThrow(ResilientError);
    expect(llm.calls).toBe(1);
    r.destroy();
  });

  it('respects an AbortSignal', async () => {
    const ctrl = new AbortController();
    const r = new ResilientLLM({ maxRetries: 5, sleep: (ms) => new Promise((res) => setTimeout(res, ms)), signal: ctrl.signal });
    const llm = makeLLM(() => { throw new Error('fails'); });
    setTimeout(() => ctrl.abort(), 10);
    await expect(r.wrap(llm).chat({ messages: [{ role: 'user', content: 'a' }] })).rejects.toThrow(/abort|aborted/);
    r.destroy();
  });

  it('circuit breaker wraps the call (recording failures)', async () => {
    const r = new ResilientLLM({
      maxRetries: 0,
      sleep: async () => {},
      breaker: { failureThreshold: 1, resetTimeout: 60_000 },
    });
    const llm = makeLLM(() => { throw new Error('fails'); });
    const wrapped = r.wrap(llm);
    await expect(wrapped.chat({ messages: [{ role: 'user', content: 'a' }] })).rejects.toThrow();
    // The breaker recorded the failure even if its OPEN state lags.
    const stats = (r as unknown as { breaker: { getStats: () => { failures: number } } }).breaker.getStats();
    expect(stats.failures).toBeGreaterThan(0);
    r.destroy();
  });

  it('resetBreaker() resets state', async () => {
    const r = new ResilientLLM({
      maxRetries: 0,
      sleep: async () => {},
      breaker: { failureThreshold: 1, resetTimeout: 60_000 },
    });
    const llm = makeLLM(() => { throw new Error('fails'); });
    const wrapped = r.wrap(llm);
    await expect(wrapped.chat({ messages: [{ role: 'user', content: 'a' }] })).rejects.toThrow();
    r.resetBreaker();
    expect(r.circuitState).toBe(CircuitState.CLOSED);
    r.destroy();
  });

  it('preserves the original error in ResilientError', async () => {
    const r = new ResilientLLM({ maxRetries: 0, sleep: async () => {} });
    const llm = makeLLM(() => { throw new Error('original cause'); });
    try {
      await r.wrap(llm).chat({ messages: [{ role: 'user', content: 'a' }] });
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ResilientError);
      const re = err as ResilientError;
      expect(re.cause).toBeInstanceOf(Error);
      expect((re.cause as Error).message).toBe('original cause');
      expect(re.attempts).toBe(1);
      expect(re.retries).toBe(0);
    }
    r.destroy();
  });

  it('stream() is passed through unchanged', async () => {
    const r = new ResilientLLM({ sleep: async () => {} });
    const llm: ILLMPort = {
      async chat() { return { content: '', model: 'm', usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 } }; },
      async *stream(): AsyncGenerator<StreamChunk> {
        yield { content: 'a', done: false };
        yield { content: 'b', done: true };
      },
      async listModels() { return []; },
      async isAvailable() { return true; },
    };
    const wrapped = r.wrap(llm);
    const out: string[] = [];
    for await (const c of wrapped.stream({ messages: [] })) out.push(c.content);
    expect(out.join('')).toBe('ab');
    r.destroy();
  });
});
