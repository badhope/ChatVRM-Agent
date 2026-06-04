/**
 * Token budget tests.
 */

import { describe, it, expect } from 'vitest';
import { TokenBudget, TokenBudgetError, DEFAULT_PRICES } from '../../../integration/token-budget.js';
import type { ILLMPort, ChatResponse, ChatParams, StreamChunk } from '../../../ports/llm.port.js';

function makeLLM(usage: ChatResponse['usage'], model = 'gpt-4o-mini'): ILLMPort & { calls: number } {
  const mock = {
    calls: 0,
    async chat(_p: ChatParams) {
      mock.calls += 1;
      return { content: 'ok', model, usage };
    },
    async *stream(_p: ChatParams): AsyncGenerator<StreamChunk> { throw new Error('not used'); },
    async listModels(_provider: ChatParams['provider']) { return []; },
    async isAvailable(_provider: ChatParams['provider']) { return true; },
  };
  return mock;
}

describe('TokenBudget', () => {
  it('records per-call usage', async () => {
    const tb = new TokenBudget();
    const llm = makeLLM({ promptTokens: 10, completionTokens: 5, totalTokens: 15 });
    const wrapped = tb.wrap(llm, 's1');
    await wrapped.chat({ messages: [{ role: 'user', content: 'hi' }] });
    const u = tb.get('s1');
    expect(u.totalTokens).toBe(15);
    expect(u.calls).toBe(1);
  });

  it('aggregates across multiple calls', async () => {
    const tb = new TokenBudget();
    const llm = makeLLM({ promptTokens: 10, completionTokens: 5, totalTokens: 15 });
    const wrapped = tb.wrap(llm, 's1');
    await wrapped.chat({ messages: [{ role: 'user', content: 'a' }] });
    await wrapped.chat({ messages: [{ role: 'user', content: 'b' }] });
    await wrapped.chat({ messages: [{ role: 'user', content: 'c' }] });
    expect(tb.get('s1').totalTokens).toBe(45);
    expect(tb.get('s1').calls).toBe(3);
  });

  it('computes USD from per-model prices', async () => {
    const tb = new TokenBudget();
    tb.setPrice('gpt-4o', DEFAULT_PRICES['gpt-4o']!);
    const llm = makeLLM({ promptTokens: 1000, completionTokens: 500, totalTokens: 1500 }, 'gpt-4o');
    const wrapped = tb.wrap(llm, 's1');
    await wrapped.chat({ messages: [{ role: 'user', content: 'a' }] });
    // 1000 * 0.005/1000 + 500 * 0.015/1000 = 0.005 + 0.0075 = 0.0125
    expect(tb.get('s1').usd).toBeCloseTo(0.0125, 6);
  });

  it('hard limit throws on the next call', async () => {
    const tb = new TokenBudget({ hardAt: { totalTokens: 10 } });
    const llm = makeLLM({ promptTokens: 6, completionTokens: 5, totalTokens: 11 });
    const wrapped = tb.wrap(llm, 's1');
    await expect(wrapped.chat({ messages: [{ role: 'user', content: 'a' }] })).rejects.toThrow(TokenBudgetError);
  });

  it('hard limit allows calls below it', async () => {
    const tb = new TokenBudget({ hardAt: { totalTokens: 100 } });
    const llm = makeLLM({ promptTokens: 10, completionTokens: 5, totalTokens: 15 });
    const wrapped = tb.wrap(llm, 's1');
    await wrapped.chat({ messages: [{ role: 'user', content: 'a' }] });
    expect(tb.get('s1').totalTokens).toBe(15);
  });

  it('hard limit in USD', async () => {
    const tb = new TokenBudget({ hardAt: { usd: 0.0001 } });
    tb.setPrice('m', { promptPer1k: 0.001, completionPer1k: 0.001 });
    const llm = makeLLM({ promptTokens: 1, completionTokens: 1, totalTokens: 2 }, 'm');
    const wrapped = tb.wrap(llm, 's1');
    // Each call costs (1/1000)*0.001 + (1/1000)*0.001 = 0.000002 USD.
    // 0.0001 / 0.000002 = 50 calls to the limit. The 51st should throw.
    for (let i = 0; i < 50; i++) await wrapped.chat({ messages: [{ role: 'user', content: 'a' }] });
    await expect(wrapped.chat({ messages: [{ role: 'user', content: 'a' }] })).rejects.toThrow(TokenBudgetError);
  });

  it('reset(sessionId) drops one session only', async () => {
    const tb = new TokenBudget();
    const llm = makeLLM({ promptTokens: 10, completionTokens: 5, totalTokens: 15 });
    await tb.wrap(llm, 's1').chat({ messages: [{ role: 'user', content: 'a' }] });
    await tb.wrap(llm, 's2').chat({ messages: [{ role: 'user', content: 'a' }] });
    tb.reset('s1');
    expect(tb.get('s1').totalTokens).toBe(0);
    expect(tb.get('s2').totalTokens).toBe(15);
  });

  it('reset() drops everything', () => {
    const tb = new TokenBudget();
    tb.record('s1', 'm', { promptTokens: 1, completionTokens: 1, totalTokens: 2 });
    tb.reset();
    expect(tb.snapshot()).toEqual({});
  });

  it('withSession() uses a getter for the session id', async () => {
    const tb = new TokenBudget();
    const llm = makeLLM({ promptTokens: 1, completionTokens: 1, totalTokens: 2 });
    let sid = 'one';
    const wrapped = tb.withSession(llm, () => sid);
    await wrapped.chat({ messages: [{ role: 'user', content: 'a' }] });
    expect(tb.get('one').totalTokens).toBe(2);
    sid = 'two';
    await wrapped.chat({ messages: [{ role: 'user', content: 'b' }] });
    expect(tb.get('two').totalTokens).toBe(2);
  });

  it('default session is "default"', async () => {
    const tb = new TokenBudget();
    tb.record('default', 'm', { promptTokens: 1, completionTokens: 1, totalTokens: 2 });
    expect(tb.get().totalTokens).toBe(2);
  });
});
