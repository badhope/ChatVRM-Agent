import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import { EventEmitter } from 'eventemitter3';
import { ReActAgent, attachInputSchema, type ReActEvents } from '../../../agents/react.agent.js';
import type { ILLMPort, ChatResponse, ChatParams, Message } from '../../../ports/llm.port.js';
import type { IToolsPort, ToolDefinition, ToolResult } from '../../../ports/tools.port.js';

function makeLLM(responses: ChatResponse[]): ILLMPort & { calls: ChatParams[] } {
  const calls: ChatParams[] = [];
  let i = 0;
  return {
    calls,
    async chat(p: ChatParams) {
      calls.push(p);
      if (i >= responses.length) {
        throw new Error(`Mock LLM exhausted after ${responses.length} calls`);
      }
      return responses[i++]!;
    },
    async *stream() {
      throw new Error('not used in this test');
    },
    async listModels() {
      return [];
    },
    async isAvailable() {
      return true;
    },
  };
}

function makeTools(defs: ToolDefinition[]): IToolsPort & { executions: Array<{ name: string; args: Record<string, unknown> }> } {
  const executions: Array<{ name: string; args: Record<string, unknown> }> = [];
  return {
    executions,
    register: (d) => defs.push(d),
    unregister: (_n: string) => true,
    list: () => defs,
    listAll: () => defs,
    has: (n: string) => defs.some((x) => x.name === n),
    get: (name) => {
      const d = defs.find((x) => x.name === name);
      if (!d) throw new Error(`No tool ${name}`);
      return d;
    },
    async execute(name: string, args: Record<string, unknown>): Promise<ToolResult> {
      executions.push({ name, args });
      return { success: true, output: `result for ${name}(${JSON.stringify(args)})` };
    },
  };
}

describe('ReActAgent', () => {
  it('returns the model content as final answer when there are no tool calls', async () => {
    const llm = makeLLM([
      { content: 'Hello, the answer is 42.', model: 'm', usage: { promptTokens: 5, completionTokens: 5, totalTokens: 10 } },
    ]);
    const tools = makeTools([
      attachInputSchema({ name: 'noop', description: 'a noop tool' }, z.object({})),
    ]);
    const agent = new ReActAgent({ llm, tools, maxIterations: 3 });
    const result = await agent.run('What is the meaning of life?');
    expect(result.output).toBe('Hello, the answer is 42.');
    expect(result.finishReason).toBe('final-answer');
    expect(result.iterations).toBe(1);
  });

  it('loops: tool call → observation → final answer', async () => {
    const llm = makeLLM([
      // Turn 1: call tool
      {
        content: 'I should look up the weather first.',
        model: 'm',
        usage: { promptTokens: 5, completionTokens: 5, totalTokens: 10 },
        toolCalls: [{ id: 'call_1', name: 'lookup', arguments: { city: 'SF' } }],
        finishReason: 'tool_calls',
      },
      // Turn 2: final answer
      {
        content: 'It is sunny in SF.',
        model: 'm',
        usage: { promptTokens: 12, completionTokens: 5, totalTokens: 17 },
      },
    ]);
    const tools = makeTools([
      attachInputSchema(
        { name: 'lookup', description: 'lookup city weather' },
        z.object({ city: z.string() }),
      ),
    ]);
    const events = new EventEmitter<ReActEvents>();
    const observed: string[] = [];
    events.on('react:thought', (e) => observed.push(`thought:${e.index}`));
    events.on('react:action', (e) => observed.push(`action:${e.call.name}`));
    events.on('react:observation', (e) => observed.push(`obs:${e.ok}:${e.observation.slice(0, 8)}`));
    events.on('react:final', (e) => observed.push(`final:${e.index}`));

    const agent = new ReActAgent({ llm, tools, maxIterations: 5, eventBus: events });
    const result = await agent.run('Weather in SF?');

    expect(result.finishReason).toBe('final-answer');
    expect(result.iterations).toBe(2);
    expect(tools.executions).toEqual([{ name: 'lookup', args: { city: 'SF' } }]);
    expect(observed).toEqual(['thought:0', 'action:lookup', 'obs:true:result f', 'final:1']);
  });

  it('respects maxIterations and stops with finishReason=max-iterations', async () => {
    const llm = makeLLM(
      Array.from({ length: 3 }, (_, i) => ({
        content: `still thinking ${i}`,
        model: 'm',
        usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
        toolCalls: [{ id: `c${i}`, name: 'noop', arguments: {} }],
        finishReason: 'tool_calls',
      })),
    );
    const tools = makeTools([
      attachInputSchema({ name: 'noop', description: 'noop' }, z.object({})),
    ]);
    const agent = new ReActAgent({ llm, tools, maxIterations: 2 });
    const result = await agent.run('ping');
    expect(result.finishReason).toBe('max-iterations');
    expect(tools.executions.length).toBe(2);
  });

  it('passes tools in the LLM wire format matching OpenAI shape', async () => {
    const llm = makeLLM([
      { content: 'done', model: 'm', usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 } },
    ]);
    const tools = makeTools([
      attachInputSchema(
        { name: 'add', description: 'add two numbers' },
        z.object({ a: z.number(), b: z.number() }),
      ),
    ]);
    const agent = new ReActAgent({ llm, tools });
    await agent.run('test');

    const call = llm.calls[0]!;
    expect(call.tools).toBeDefined();
    expect(call.tools![0]!.name).toBe('add');
    expect(call.tools![0]!.parameters).toMatchObject({
      type: 'object',
      properties: { a: { type: 'number' }, b: { type: 'number' } },
      required: ['a', 'b'],
    });
  });

  it('sends tool results back to the model with the right tool_call_id', async () => {
    const llm = makeLLM([
      {
        content: 'th', model: 'm',
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        toolCalls: [{ id: 'xyz', name: 'ping', arguments: {} }],
      },
      { content: 'final', model: 'm', usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 } },
    ]);
    const tools = makeTools([
      attachInputSchema({ name: 'ping', description: 'ping' }, z.object({})),
    ]);
    const agent = new ReActAgent({ llm, tools });
    await agent.run('go');

    const secondCall = llm.calls[1]!;
    const toolMsg = secondCall.messages.find((m: Message) => m.role === 'tool');
    expect(toolMsg).toBeDefined();
    expect(toolMsg!.toolCallId).toBe('xyz');
    expect(toolMsg!.name).toBe('ping');
  });

  it('captures failed tool executions as ok=false observations', async () => {
    const llm = makeLLM([
      {
        content: '', model: 'm',
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        toolCalls: [{ id: 'c1', name: 'boom', arguments: {} }],
      },
      { content: 'I see the tool failed', model: 'm', usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 } },
    ]);
    const tools = makeTools([attachInputSchema({ name: 'boom', description: 'd' }, z.object({}))]);
    tools.execute = async () => ({ success: false, error: 'kaboom' });
    const events = new EventEmitter<ReActEvents>();
    const obs: Array<{ ok: boolean; obs: string }> = [];
    events.on('react:observation', (e) => obs.push({ ok: e.ok, obs: e.observation }));

    const agent = new ReActAgent({ llm, tools, eventBus: events });
    await agent.run('go');
    expect(obs[0]!.ok).toBe(false);
    expect(obs[0]!.obs).toContain('kaboom');
  });

  it('aborts cleanly when signal is set', async () => {
    const llm = makeLLM([
      { content: 'th', model: 'm', usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 }, toolCalls: [{ id: 'c1', name: 't', arguments: {} }] },
    ]);
    const tools = makeTools([attachInputSchema({ name: 't', description: 'd' }, z.object({}))]);
    const ctrl = new AbortController();
    ctrl.abort();
    const agent = new ReActAgent({ llm, tools, signal: ctrl.signal });
    const result = await agent.run('go');
    expect(result.finishReason).toBe('aborted');
  });
});
