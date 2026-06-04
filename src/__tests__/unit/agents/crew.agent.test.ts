import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { EventEmitter } from 'eventemitter3';
import { Crew, type AgentDefinition } from '../../../agents/crew.agent.js';
import { attachInputSchema } from '../../../agents/react.agent.js';
import type { ILLMPort, ChatResponse, ChatParams } from '../../../ports/llm.port.js';
import type { IToolsPort, ToolDefinition, ToolResult } from '../../../ports/tools.port.js';

function makeLLM(responses: ChatResponse[]): ILLMPort & { calls: ChatParams[] } {
  const calls: ChatParams[] = [];
  let i = 0;
  return {
    calls,
    async chat(p: ChatParams) {
      calls.push(p);
      if (i >= responses.length) {
        throw new Error(`Mock LLM exhausted after ${responses.length} calls (asked for #${i + 1})`);
      }
      return responses[i++]!;
    },
    async *stream() { throw new Error('not used'); },
    async listModels() { return []; },
    async isAvailable() { return true; },
  };
}

function makeTools(): IToolsPort & { executions: Array<{ name: string; args: unknown }> } {
  const executions: Array<{ name: string; args: unknown }> = [];
  const defs: ToolDefinition[] = [
    attachInputSchema(
      { name: 'echo', description: 'echo back args', handler: async () => ({ success: true, output: '' }) },
      z.object({ msg: z.string() }),
    ),
  ];
  return {
    executions,
    register: (d) => defs.push(d),
    unregister: () => {},
    has: (n) => defs.some((d) => d.name === n),
    get: (n) => {
      const d = defs.find((x) => x.name === n);
      if (!d) throw new Error(`No tool ${n}`);
      return d;
    },
    list: () => defs,
    listAll: () => defs,
    async execute(name: string, args: Record<string, unknown>): Promise<ToolResult> {
      executions.push({ name, args });
      return { success: true, output: `echo:${(args as { msg?: string }).msg ?? ''}` };
    },
  };
}

describe('Crew', () => {
  it('runs agents sequentially and chains context', async () => {
    const tools = makeTools();
    // Agent 1: returns an answer with no tool calls.
    // Agent 2: also returns an answer, but its system prompt should
    //          contain agent 1's output.
    const llm = makeLLM([
      { content: 'first output', model: 'm', usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 } },
      { content: 'second output', model: 'm', usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 } },
    ]);
    const crew = new Crew(llm, tools);
    const def: { agents: AgentDefinition[]; process?: 'sequential' | 'parallel' } = {
      agents: [
        { name: 'a1', role: 'researcher', goal: 'find facts' },
        { name: 'a2', role: 'writer', goal: 'summarise' },
      ],
    };
    const result = await crew.run(def, 'tell me about X');
    expect(result.perAgent.length).toBe(2);
    expect(result.perAgent[0]!.output).toBe('first output');
    expect(result.perAgent[1]!.output).toBe('second output');
    expect(result.finalOutput).toBe('second output');

    // Agent 2 should have received agent 1's output in its context.
    const secondCallSystem = llm.calls[1]!.messages[0]!.content;
    expect(secondCallSystem).toContain('first output');
    expect(secondCallSystem).toContain('a2');
  });

  it('runs agents in parallel when process=parallel', async () => {
    const tools = makeTools();
    const llm = makeLLM([
      { content: 'p1', model: 'm', usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 } },
      { content: 'p2', model: 'm', usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 } },
    ]);
    const crew = new Crew(llm, tools);
    const result = await crew.run(
      {
        process: 'parallel',
        agents: [
          { name: 'a', role: 'r', goal: 'g' },
          { name: 'b', role: 'r', goal: 'g' },
        ],
      },
      'parallel task',
    );
    expect(result.perAgent.length).toBe(2);
    expect(result.process).toBe('parallel');
  });

  it('exposes a shared scratchpad', async () => {
    const tools = makeTools();
    const llm = makeLLM([
      { content: 'a output', model: 'm', usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 } },
      { content: 'b output', model: 'm', usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 } },
    ]);
    const crew = new Crew(llm, tools);
    await crew.run(
      { agents: [{ name: 'a', role: 'r', goal: 'g' }, { name: 'b', role: 'r', goal: 'g' }] },
      'hi',
    );
    expect(crew.memory.get('a', 'last_output')).toBe('a output');
    expect(crew.memory.get('b', 'last_output')).toBe('b output');
  });

  it('emits crew/agent events on the bus', async () => {
    const tools = makeTools();
    const llm = makeLLM([
      { content: 'a1', model: 'm', usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 } },
      { content: 'a2', model: 'm', usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 } },
    ]);
    const crew = new Crew(llm, tools);
    const events = new EventEmitter();
    const trace: string[] = [];
    events.on('crew:start', () => trace.push('crew:start'));
    events.on('crew:agent:start', (e) => trace.push(`agent:start:${e.agent}`));
    events.on('crew:agent:done', (e) => trace.push(`agent:done:${e.agent}`));
    events.on('crew:done', () => trace.push('crew:done'));

    // Re-emit to our tracer.
    (crew.events as EventEmitter).on('crew:start', () => events.emit('crew:start'));
    (crew.events as EventEmitter).on('crew:agent:start', (e: { agent: string }) => events.emit('crew:agent:start', e));
    (crew.events as EventEmitter).on('crew:agent:done', (e: { agent: string }) => events.emit('crew:agent:done', e));
    (crew.events as EventEmitter).on('crew:done', (e: unknown) => events.emit('crew:done', e));

    await crew.run(
      { agents: [{ name: 'a1', role: 'r', goal: 'g' }, { name: 'a2', role: 'r', goal: 'g' }] },
      'go',
    );
    expect(trace).toEqual(['crew:start', 'agent:start:a1', 'agent:done:a1', 'agent:start:a2', 'agent:done:a2', 'crew:done']);
  });

  it('supports delegation: a1 delegates to a2 and uses the result', async () => {
    const tools = makeTools();
    const llm = makeLLM([
      // a1 turn 1: delegate to a2
      {
        content: 'let me ask a2',
        model: 'm',
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        toolCalls: [{ id: 'd1', name: '__delegate__', arguments: { to: 'a2', task: 'compute 2+2' } }],
        finishReason: 'tool_calls',
      },
      // a2 turn 1 (via delegate): final answer "4"
      {
        content: '4',
        model: 'm',
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      },
      // a1 turn 2: final answer using a2's "4"
      {
        content: 'a2 said 4',
        model: 'm',
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      },
      // a2 turn 1 (sequential crew step): final answer (peer a2 again)
      {
        content: '4 (a2 standalone)',
        model: 'm',
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      },
    ]);
    const crew = new Crew(llm, tools);

    // Track delegate events.
    const delegates: Array<{ from: string; to: string }> = [];
    (crew.events as EventEmitter).on('agent:delegate', (e: { from: string; to: string }) => delegates.push({ from: e.from, to: e.to }));

    const result = await crew.run(
      {
        agents: [
          { name: 'a1', role: 'orchestrator', goal: 'coordinate', canDelegateTo: ['a2'] },
          { name: 'a2', role: 'calculator', goal: 'compute' },
        ],
      },
      'what is 2+2?',
    );
    expect(delegates).toEqual([{ from: 'a1', to: 'a2' }]);
    expect(result.perAgent[0]!.output).toBe('a2 said 4');
    expect(result.perAgent[1]!.output).toBe('4 (a2 standalone)');
  });
});
