import { describe, it, expect } from 'vitest';
import { validateWorkflow, workflowToGraph } from '../../../agents/workflow.js';
import { renderWorkflowSVG } from '../../../agents/workflow-render.js';
import { workflowJsonSchema } from '../../../agents/workflow-schema.js';
import type { WorkflowSpec } from '../../../agents/workflow.js';

interface S {
  n: number;
  log: string[];
}

const simpleSpec: WorkflowSpec = {
  name: 'inc-then-cond',
  entry: 'a',
  nodes: [
    { id: 'a', type: 'add' },
    { id: 'b', type: 'mul' },
    { id: 'c', type: 'add' },
  ],
  edges: [
    { id: 'e1', source: 'a', target: 'b' },
    { id: 'e2', source: 'b', target: 'c', label: 'always' },
  ],
};

const condSpec: WorkflowSpec = {
  name: 'branch',
  entry: 'in',
  nodes: [
    { id: 'in', type: 'start' },
    { id: 'hi', type: 'tag', data: { label: 'hi' } },
    { id: 'lo', type: 'tag', data: { label: 'lo' } },
  ],
  edges: [
    { id: 'e1', source: 'in', target: 'hi', condition: 'big' },
    { id: 'e2', source: 'in', target: 'lo' },
  ],
};

describe('validateWorkflow', () => {
  it('returns no issues for a valid spec', () => {
    expect(validateWorkflow(simpleSpec)).toEqual([]);
  });

  it('flags duplicate node ids', () => {
    const bad: WorkflowSpec = {
      name: 'd',
      entry: 'a',
      nodes: [
        { id: 'a', type: 't' },
        { id: 'a', type: 't' },
      ],
      edges: [],
    };
    const issues = validateWorkflow(bad);
    expect(issues.some((i) => i.message.includes('duplicate'))).toBe(true);
  });

  it('flags missing entry', () => {
    const issues = validateWorkflow({ ...simpleSpec, entry: 'nope' });
    expect(issues.some((i) => i.message.includes('entry'))).toBe(true);
  });

  it('flags dangling edges', () => {
    const issues = validateWorkflow({
      ...simpleSpec,
      edges: [...simpleSpec.edges, { id: 'x', source: 'b', target: 'missing' }],
    });
    expect(issues.some((i) => i.message.includes('target not found'))).toBe(true);
  });

  it('warns on orphan nodes', () => {
    const issues = validateWorkflow({
      ...simpleSpec,
      nodes: [...simpleSpec.nodes, { id: 'orphan', type: 't' }],
    });
    expect(issues.some((i) => i.level === 'warning' && i.message.includes('orphan'))).toBe(true);
  });
});

describe('workflowToGraph', () => {
  it('compiles a linear workflow and runs it', async () => {
    const { graph, issues } = workflowToGraph<S>(simpleSpec, {
      handlers: {
        add: (s) => ({ n: s.n + 1, log: [...s.log, 'add'] }),
        mul: (s) => ({ n: s.n * 2, log: [...s.log, 'mul'] }),
      },
    });
    expect(issues).toEqual([]);
    const result = await graph.run({ n: 1, log: [] });
    // 1 -> add(2) -> mul(4) -> add(5)
    expect(result.n).toBe(5);
    expect(result.log).toEqual(['add', 'mul', 'add']);
  });

  it('routes via named conditions', async () => {
    const { graph } = workflowToGraph<S>(condSpec, {
      handlers: {
        start: () => ({ log: [] }),
        tag: (s, n) => ({ log: [...s.log, (n.data?.['label'] as string) ?? 'x'] }),
      },
      conditions: {
        big: (s) => s.n >= 10,
      },
    });
    const hi = await graph.run({ n: 100, log: [] });
    expect(hi.log).toEqual(['hi']);
    const lo = await graph.run({ n: 1, log: [] });
    expect(lo.log).toEqual(['lo']);
  });

  it('records an error issue when a node type has no handler', () => {
    const { issues } = workflowToGraph(simpleSpec, { handlers: {} });
    expect(issues.some((i) => i.message.includes('no handler'))).toBe(true);
  });
});

describe('renderWorkflowSVG', () => {
  it('produces a self-contained SVG with nodes and edges', () => {
    const svg = renderWorkflowSVG(simpleSpec);
    expect(svg).toContain('<svg');
    expect(svg).toContain('wf-node');
    expect(svg).toContain('wf-edge');
    expect(svg).toContain('data-id="a"');
    expect(svg).toContain('data-from="a"');
    // Labels rendered.
    expect(svg).toContain('mul');
  });

  it('escapes HTML in node data', () => {
    const svg = renderWorkflowSVG({
      ...simpleSpec,
      nodes: [{ id: 'a', type: 't', data: { label: '<script>' } }],
      edges: [],
    });
    expect(svg).not.toContain('<script>');
    expect(svg).toContain('&lt;script&gt;');
  });
});

describe('workflowJsonSchema', () => {
  it('is a valid JSON-Schema fragment (has $schema and required)', () => {
    expect(workflowJsonSchema.$schema).toContain('json-schema');
    expect(workflowJsonSchema.required).toContain('name');
    expect(workflowJsonSchema.required).toContain('entry');
  });
});
