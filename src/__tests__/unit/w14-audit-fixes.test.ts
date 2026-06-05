import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { ReActAgent, attachInputSchema } from '../../agents/react.agent.js';
import type { ILLMPort, ChatParams, ChatResponse, StreamChunk } from '../../ports/llm.port.js';
import type { IToolsPort, ToolDefinition, ToolResult } from '../../ports/tools.port.js';

function makeStreamingLLM(streams: AsyncIterable<StreamChunk>[]): ILLMPort {
  let i = 0;
  return {
    async chat(): Promise<ChatResponse> { throw new Error('not used'); },
    async *stream(_p: ChatParams): AsyncGenerator<StreamChunk> {
      const s = streams[i++];
      if (!s) throw new Error('no more streams');
      for await (const c of s) yield c;
    },
    async listModels() { return []; },
    async isAvailable() { return true; },
  };
}

function makeChatLLM(responses: ChatResponse[]): ILLMPort {
  let i = 0;
  return {
    async chat(): Promise<ChatResponse> { return responses[i++]!; },
    async *stream() { throw new Error('not used'); },
    async listModels() { return []; },
    async isAvailable() { return true; },
  };
}

function makeTools(defs: ToolDefinition[]): IToolsPort & { executions: Array<{ name: string; args: Record<string, unknown> }> } {
  const executions: Array<{ name: string; args: Record<string, unknown> }> = [];
  return {
    executions,
    register: (d) => defs.push(d),
    unregister: () => true,
    list: () => defs,
    listAll: () => defs,
    has: (n) => defs.some((x) => x.name === n),
    get: (n) => {
      const d = defs.find((x) => x.name === n);
      if (!d) throw new Error(`No tool ${n}`);
      return d;
    },
    async execute(name, args): Promise<ToolResult> {
      executions.push({ name, args });
      return { success: true, output: `result for ${name}` };
    },
  };
}

describe('ReActAgent streaming tool-call args (W14 audit fix)', () => {
  it('concatenates string fragment deltas verbatim (does not stringify+slice)', async () => {
    async function* stream(): AsyncIterable<StreamChunk> {
      // First delta carries id+name (mirrors OpenAI stream shape)
      yield { content: '', done: false, toolCallDelta: { index: 0, id: 'call_1', name: 'search' } };
      // Subsequent deltas carry only the JSON arg fragment
      yield { content: '', done: false, toolCallDelta: { index: 0, arguments: '{"city":' as unknown as Record<string, unknown> } };
      yield { content: '', done: false, toolCallDelta: { index: 0, arguments: '"San Francisco"}' as unknown as Record<string, unknown> } };
      // Terminal chunk — carries finishReason out-of-band
      yield { content: '', done: true, finishReason: 'tool_calls', model: 'fake' } as StreamChunk;
    }
    // Two streams: first returns a tool_call, second returns final answer.
    async function* finalStream(): AsyncIterable<StreamChunk> {
      yield { content: 'It is sunny.', done: true, model: 'fake' } as StreamChunk;
    }
    const llm = makeStreamingLLM([stream(), finalStream()]);
    const defs: ToolDefinition[] = [];
    const tools = makeTools(defs);
    defs.push(
      attachInputSchema(
        { name: 'search', description: 'search by city', handler: async () => ({ success: true, output: 'ok' }) },
        z.object({ city: z.string() }),
      ),
    );
    const agent = new ReActAgent({ llm, tools, maxIterations: 3, stream: true });
    const result = await agent.run('weather?');
    expect(tools.executions).toEqual([{ name: 'search', args: { city: 'San Francisco' } }]);
    expect(result.output).toBe('It is sunny.');
    expect(result.finishReason).toBe('final-answer');
  });
});

describe('ReActAgent handles missing usage (W14 audit fix)', () => {
  it('does not crash when usage is missing from a successful response', async () => {
    // The first response has no `usage` field at all (some self-hosted
    // OpenAI-compatible servers omit it). The agent must default to zeros
    // instead of throwing.
    const llm = makeChatLLM([
      {
        content: 'I should look up.',
        model: 'm',
        toolCalls: [{ id: 'c1', name: 'noop', arguments: {} }],
        finishReason: 'tool_calls',
      } as ChatResponse,
      {
        content: 'done',
        model: 'm',
      } as ChatResponse,
    ]);
    const defs: ToolDefinition[] = [];
    const tools = makeTools(defs);
    defs.push(
      attachInputSchema(
        { name: 'noop', description: 'noop', handler: async () => 'ok' },
        z.object({}),
      ),
    );
    const agent = new ReActAgent({ llm, tools, maxIterations: 3 });
    const result = await agent.run('hi');
    expect(result.output).toBe('done');
    expect(result.finishReason).toBe('final-answer');
    expect(result.totalTokens).toBe(0);
  });
});
