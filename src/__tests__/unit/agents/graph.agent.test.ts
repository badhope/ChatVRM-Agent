import { describe, it, expect } from 'vitest';
import { Graph, START, END, humanRequest } from '../../../agents/graph.agent.js';

describe('Graph', () => {
  it('runs a static linear graph', async () => {
    const g = new Graph<{ count: number }>();
    g.addNode('init', () => ({ count: 0 }));
    g.addNode('inc', (s) => ({ count: s.count + 1 }));
    g.addNode('end', (s) => ({ result: s.count * 2 }));

    g.addEdge('init', 'inc');
    g.addEdge('inc', 'end');
    g.addEdge('end', END);

    const compiled = g.compile();
    const final = await compiled.run({ count: -1 } as { count: number });
    expect(final.count).toBe(1);
    expect(final.result).toBe(2);
  });

  it('routes conditionally based on state', async () => {
    const g = new Graph<{ x: number; path?: string }>();
    g.addNode('branch', (s) => ({ x: s.x }));
    g.addNode('big', (s) => ({ path: 'big', y: s.x * 2 }));
    g.addNode('small', (s) => ({ path: 'small', y: s.x / 2 }));

    g.addConditionalEdge('branch', (s) => (s.x > 10 ? 'big' : 'small'));
    g.addEdge('big', END);
    g.addEdge('small', END);

    const big = await g.compile().run({ x: 100 });
    expect(big.path).toBe('big');
    expect(big.y).toBe(200);

    const small = await g.compile().run({ x: 5 });
    expect(small.path).toBe('small');
    expect(small.y).toBe(2.5);
  });

  it('supports cycles and terminates via a conditional', async () => {
    const g = new Graph<{ n: number; log: number[] }>();
    g.addNode('count', (s) => ({ n: s.n + 1, log: [...s.log, s.n + 1] }));
    g.addConditionalEdge('count', (s) => (s.n < 5 ? 'count' : END));

    const final = await g.compile().run({ n: 0, log: [] });
    expect(final.n).toBe(5);
    expect(final.log).toEqual([1, 2, 3, 4, 5]);
  });

  it('throws when the graph exceeds maxSteps', async () => {
    const g = new Graph<{ n: number }>();
    g.addNode('loop', (s) => ({ n: s.n + 1 }));
    g.addEdge('loop', 'loop'); // pure self-loop
    const compiled = g.compile({ maxSteps: 3 });
    await expect(compiled.run({ n: 0 })).rejects.toThrow(/exceeded maxSteps/);
  });

  it('emits node and edge events on the bus', async () => {
    const g = new Graph<{ x: number }>();
    g.addNode('a', (s) => ({ x: s.x + 1 }));
    g.addNode('b', (s) => ({ x: s.x * 10 }));
    g.addEdge('a', 'b');
    g.addEdge('b', END);
    const compiled = g.compile();
    const events: string[] = [];
    compiled.events.on('node:start', (e) => events.push(`start:${e.nodeId}`));
    compiled.events.on('node:done', (e) => events.push(`done:${e.nodeId}`));
    compiled.events.on('edge:taken', (e) => events.push(`edge:${e.from}->${e.to}`));
    compiled.events.on('graph:start', () => events.push('graph:start'));
    compiled.events.on('graph:done', () => events.push('graph:done'));
    await compiled.run({ x: 1 });
    // Verify the lifecycle appears, don't pin the exact emission order.
    expect(events).toContain('graph:start');
    expect(events).toContain('graph:done');
    expect(events.filter((e) => e.startsWith('start:'))).toEqual(['start:a', 'start:b']);
    expect(events.filter((e) => e.startsWith('done:'))).toEqual(['done:a', 'done:b']);
    expect(events.filter((e) => e.startsWith('edge:'))).toEqual(['edge:a->b', 'edge:b->__end__']);
  });

  it('blocks for human input and resumes when resume() is called', async () => {
    const g = new Graph<{ score: number; __human_input__?: unknown; decided?: string }>();
    g.addNode('score', () => ({ score: 0.42 }));
    g.addNode('review', (s) => {
      if (s.__human_input__ === undefined) {
        return { __human__: humanRequest('review', `Score ${s.score} — approve?`, s) } as never;
      }
      return { decided: s.__human_input__ ? 'yes' : 'no' } as never;
    });
    g.addEdge('score', 'review');
    g.addEdge('review', END);

    const compiled = g.compile();
    const humanRequests: string[] = [];
    compiled.events.on('human:request', (e) => humanRequests.push(e.prompt));

    // Schedule a resume after the human request fires.
    setTimeout(() => compiled.resume('review', true), 5);

    const final = await compiled.run({ score: 0 });
    expect(humanRequests.length).toBe(1);
    expect(humanRequests[0]).toContain('approve');
    expect(final.__human_input__).toBe(true);
    expect(final.decided).toBe('yes');
  });

  it('resume() returns false for unknown node id', () => {
    const g = new Graph<{ x: number }>();
    g.addNode('a', (s) => ({ x: s.x + 1 }));
    g.addEdge('a', END);
    const compiled = g.compile();
    expect(compiled.resume('does-not-exist', {})).toBe(false);
  });

  it('does not crash on async node functions', async () => {
    const g = new Graph<{ n: number }>();
    g.addNode('a', async (s) => {
      await new Promise((r) => setTimeout(r, 5));
      return { n: s.n + 1 };
    });
    g.addNode('b', async (s) => {
      await new Promise((r) => setTimeout(r, 5));
      return { n: s.n * 2 };
    });
    g.addEdge('a', 'b');
    g.addEdge('b', END);
    const final = await g.compile().run({ n: 3 });
    expect(final.n).toBe(8);
  });
});
