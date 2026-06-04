import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { ReflectiveAgent } from '../../../agents/reflective.agent.js';
import { attachInputSchema } from '../../../agents/react.agent.js';
import type { ILLMPort, ChatResponse, ChatParams } from '../../../ports/llm.port.js';
import type { IToolsPort, ToolDefinition, ToolResult } from '../../../ports/tools.port.js';

function makeLLM(scripts: ChatResponse[][]): ILLMPort & { calls: ChatParams[] } {
  const calls: ChatParams[] = [];
  const queue = scripts.flatMap((s) => s);
  let i = 0;
  return {
    calls,
    async chat(p: ChatParams) {
      calls.push(p);
      if (i >= queue.length) {
        throw new Error(`Mock LLM exhausted after ${queue.length} calls`);
      }
      return queue[i++]!;
    },
    async *stream() { throw new Error('not used'); },
    async listModels() { return []; },
    async isAvailable() { return true; },
  };
}

function makeTools(): IToolsPort {
  const defs: ToolDefinition[] = [
    attachInputSchema({ name: 'noop', description: 'noop' }, z.object({})),
  ];
  return {
    register: (d) => defs.push(d),
    unregister: (_n: string) => true,
    list: () => defs,
    listAll: () => defs,
    has: (n: string) => defs.some((x) => x.name === n),
    get: (n) => {
      const d = defs.find((x) => x.name === n);
      if (!d) throw new Error(`No tool ${n}`);
      return d;
    },
    async execute(): Promise<ToolResult> {
      return { success: true, output: 'ok' };
    },
  };
}

describe('ReflectiveAgent', () => {
  it('stops after the first round when the critic is satisfied', async () => {
    const llm = makeLLM([
      // Round 1 ReAct: 1 turn, no tool calls.
      [
        {
          content: 'The answer is 42.',
          model: 'm',
          usage: { promptTokens: 5, completionTokens: 5, totalTokens: 10 },
        },
      ],
      // Round 1 critique: satisfied
      [
        {
          content: JSON.stringify({ satisfied: true, issues: [], feedback: 'OK' }),
          model: 'm',
          usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
        },
      ],
    ]);
    const agent = new ReflectiveAgent({
      base: { llm, tools: makeTools() },
      maxRounds: 3,
    });
    const result = await agent.run('What is the meaning of life?');
    expect(result.finishReason).toBe('satisfied');
    expect(result.rounds.length).toBe(1);
    expect(result.output).toBe('The answer is 42.');
  });

  it('re-runs the agent when the critic is not satisfied', async () => {
    const llm = makeLLM([
      // Round 1 ReAct: 1 turn, no tool calls.
      [
        {
          content: 'I am not sure of the answer.',
          model: 'm',
          usage: { promptTokens: 5, completionTokens: 5, totalTokens: 10 },
        },
      ],
      // Round 1 critique: not satisfied
      [
        {
          content: JSON.stringify({ satisfied: false, issues: ['too vague'], feedback: 'give a number' }),
          model: 'm',
          usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
        },
      ],
      // Round 2 ReAct: 1 turn, no tool calls, but with feedback in the prompt.
      [
        {
          content: '42',
          model: 'm',
          usage: { promptTokens: 5, completionTokens: 5, totalTokens: 10 },
        },
      ],
      // Round 2 critique: satisfied
      [
        {
          content: JSON.stringify({ satisfied: true, issues: [], feedback: 'OK' }),
          model: 'm',
          usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
        },
      ],
    ]);
    const agent = new ReflectiveAgent({
      base: { llm, tools: makeTools() },
      maxRounds: 3,
    });
    const result = await agent.run('What is the meaning of life?');
    expect(result.finishReason).toBe('satisfied');
    expect(result.rounds.length).toBe(2);
    expect(result.output).toBe('42');
  });

  it('returns max-rounds when the critic never approves', async () => {
    const llm = makeLLM([
      // 2 rounds × (1 react + 1 critique) = 4 calls
      [
        { content: 'attempt 1', model: 'm', usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 } },
      ],
      [
        { content: JSON.stringify({ satisfied: false, issues: ['x'], feedback: 'try again' }), model: 'm', usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 } },
      ],
      [
        { content: 'attempt 2', model: 'm', usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 } },
      ],
      [
        { content: JSON.stringify({ satisfied: false, issues: ['x'], feedback: 'try again' }), model: 'm', usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 } },
      ],
    ]);
    const agent = new ReflectiveAgent({
      base: { llm, tools: makeTools() },
      maxRounds: 2,
    });
    const result = await agent.run('go');
    expect(result.finishReason).toBe('max-rounds');
    expect(result.rounds.length).toBe(2);
    expect(result.output).toBe('attempt 2');
  });

  it('recovers when the critic emits non-JSON (parses fallback)', async () => {
    const llm = makeLLM([
      [
        { content: 'hello', model: 'm', usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 } },
      ],
      // Critic returns garbage.
      [
        { content: 'not json at all', model: 'm', usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 } },
      ],
      // Second react (because critic said not satisfied).
      [
        { content: 'hello again', model: 'm', usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 } },
      ],
      // Second critic: satisfied.
      [
        { content: JSON.stringify({ satisfied: true, issues: [], feedback: 'OK' }), model: 'm', usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 } },
      ],
    ]);
    const agent = new ReflectiveAgent({
      base: { llm, tools: makeTools() },
      maxRounds: 3,
    });
    const result = await agent.run('go');
    expect(result.finishReason).toBe('satisfied');
    expect(result.rounds[0]!.critique.issues).toContain('unparseable-critique');
  });
});
