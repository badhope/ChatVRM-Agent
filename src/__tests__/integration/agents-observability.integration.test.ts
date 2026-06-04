/**
 * Crew + Graph observability & session injection tests.
 *
 * Validates that the cross-cutting concerns added in W11a.3/W11a.4
 * are correctly propagated to the ReAct/Graph/span graph.
 */

import { describe, it, expect } from 'vitest';
import { Crew, type AgentDefinition } from '../../agents/crew.agent.js';
import { Graph } from '../../agents/graph.agent.js';
import { NoopObservability } from '../../adapters/observability.noop.js';
import { JsonFileSessionStore } from '../../adapters/session-store.json.js';
import * as os from 'node:os';
import * as path from 'node:path';
import { rm, mkdir } from 'node:fs/promises';
import { z } from 'zod';
import { attachInputSchema } from '../../agents/react.agent.js';
import type { ILLMPort, ChatResponse, ChatParams } from '../../ports/llm.port.js';
import type { IToolsPort, ToolDefinition, ToolResult } from '../../ports/tools.port.js';

function makeLLM(responses: ChatResponse[]): ILLMPort {
  let i = 0;
  return {
    async chat(_p: ChatParams) {
      if (i >= responses.length) {
        throw new Error('Mock LLM exhausted');
      }
      return responses[i++]!;
    },
    async *stream() { throw new Error('not used'); },
    async listModels() { return []; },
    async isAvailable() { return true; },
  };
}

function makeTools(): IToolsPort {
  const defs: ToolDefinition[] = [
    attachInputSchema(
      { name: 'echo', description: 'echo back args', handler: async () => ({ success: true, output: '' }) },
      z.object({ msg: z.string() }),
    ),
  ];
  return {
    register: (d) => defs.push(d),
    unregister: () => true,
    has: (n) => defs.some((d) => d.name === n),
    get: (n) => {
      const d = defs.find((x) => x.name === n);
      if (!d) throw new Error('not found');
      return d;
    },
    list: () => defs,
    listAll: () => defs,
    async execute(name: string, args: Record<string, unknown>): Promise<ToolResult> {
      return { success: true, output: `${name}:${(args.msg as string) ?? ''}` };
    },
  };
}

describe('Crew observability & session injection', () => {
  it('emits a per-agent trace via NoopObservability in recordMode', async () => {
    const obs = new NoopObservability({ recordMode: true });
    const llm = makeLLM([
      { content: 'first output', model: 'm', usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 } },
      { content: 'second output', model: 'm', usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 } },
    ]);
    const crew = new Crew(llm, makeTools(), { observability: obs });
    const def: { agents: AgentDefinition[] } = {
      agents: [
        { name: 'a1', role: 'r1', goal: 'g1' },
        { name: 'a2', role: 'r2', goal: 'g2' },
      ],
    };
    await crew.run(def, 'hi');
    const records = obs.drainRecords();
    const traceNames = records.filter((r) => r.kind === 'span').map((r) => r.name);
    expect(traceNames).toContain('agent.a1');
    expect(traceNames).toContain('agent.a2');
  });

  it('Crew constructor accepts a sessionStore (no throw)', async () => {
    const dir = path.join(os.tmpdir(), `crew-sess-${Date.now()}-${Math.random().toString(16).slice(2)}`);
    await mkdir(dir, { recursive: true });
    try {
      const store = new JsonFileSessionStore(path.join(dir, 'sessions.json'));
      await store.init();
      const llm = makeLLM([
        { content: 'one', model: 'm', usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 } },
      ]);
      const crew = new Crew(llm, makeTools(), { sessionStore: store });
      const def: { agents: AgentDefinition[] } = {
        agents: [{ name: 'a1', role: 'r', goal: 'g' }],
      };
      const r = await crew.run(def, 'hello');
      expect(r.perAgent.length).toBe(1);
      expect(r.finalOutput).toBe('one');
      await store.close();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe('Graph observability', () => {
  it('emits a graph.run trace + a span per node when observability is set', async () => {
    const obs = new NoopObservability({ recordMode: true });
    const graph = new Graph<{ count: number }>();
    graph.addNode('a', (s) => ({ count: (s.count ?? 0) + 1 }));
    graph.addNode('b', (s) => ({ count: (s.count ?? 0) + 1 }));
    graph.addEdge('a', 'b');
    const compiled = graph.compile({ observability: obs });
    const r = await compiled.run({ count: 0 });
    expect(r.count).toBe(2);
    const records = obs.drainRecords();
    const names = records.map((x) => x.name);
    expect(names).toContain('graph.run');
    expect(names).toContain('node.a');
    expect(names).toContain('node.b');
  });

  it('graph runs without observability (no spans created)', async () => {
    const graph = new Graph<{ count: number }>();
    graph.addNode('a', (s) => ({ count: (s.count ?? 0) + 1 }));
    const r = await graph.compile().run({ count: 1 });
    expect(r.count).toBe(2);
  });

  it('graph emits an error trace on node failure', async () => {
    const obs = new NoopObservability({ recordMode: true });
    const graph = new Graph<{ count: number }>();
    graph.addNode('a', () => { throw new Error('boom'); });
    const compiled = graph.compile({ observability: obs });
    await expect(compiled.run({ count: 0 })).rejects.toThrow('boom');
    const records = obs.drainRecords();
    expect(records.some((r) => r.name === 'graph.run')).toBe(true);
  });
});
