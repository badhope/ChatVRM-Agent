/**
 * Workflow-as-a-Tool integration tests.
 */

import { describe, it, expect } from 'vitest';
import { WorkflowTool } from '../../integration/workflow-tool.js';
import { z } from 'zod';
import type { WorkflowSpec } from '../../agents/workflow.js';
import type { GraphState } from '../../agents/graph.agent.js';
import { ToolsRegistry } from '../../adapters/tools.registry.js';

interface RefundState extends GraphState {
  amount?: number;
  approved?: boolean;
  reason?: string;
  result?: string;
}

describe('WorkflowTool', () => {
  const spec: WorkflowSpec = {
    id: 'refund',
    name: 'Process Refund',
    nodes: [
      { id: 'validate', type: 'validate' },
      { id: 'approve', type: 'approve' },
      { id: 'reject', type: 'reject' },
    ],
    edges: [
      { id: 'e1', source: 'validate', target: 'approve' },
      { id: 'e2', source: 'validate', target: 'reject' },
    ],
    entry: 'validate',
  };

  // The validate node has two outgoing edges (a static + a conditional),
  // so we use addConditionalEdge semantics. We add a single static
  // edge per branch; the validate handler decides which to take by
  // setting `state.approved`.
  // To keep it simple, use TWO workflows in the test:
  //   - happy path:  validate -> approve  (no reject node)
  //   - sad path:    validate -> reject   (no approve node)
  // For dynamic branching use the spec2 with both edges from a single node.
  const specHappy: WorkflowSpec = {
    name: 'happy',
    nodes: [
      { id: 'validate', type: 'validate' },
      { id: 'approve', type: 'approve' },
    ],
    edges: [{ source: 'validate', target: 'approve' }],
    entry: 'validate',
  };
  const specSad: WorkflowSpec = {
    name: 'sad',
    nodes: [
      { id: 'validate', type: 'validate' },
      { id: 'reject', type: 'reject' },
    ],
    edges: [{ source: 'validate', target: 'reject' }],
    entry: 'validate',
  };

  const handlers = {
    validate: (state: RefundState) => {
      if ((state.amount ?? 0) < 0 || !Number.isFinite(state.amount ?? 0)) {
        return { approved: false, reason: 'invalid amount' };
      }
      return { approved: (state.amount ?? 0) < 100, reason: 'validated' };
    },
    approve: (state: RefundState) => ({ result: `approved ${state.amount}` }),
    reject: (state: RefundState) => ({ result: `rejected: ${state.reason}` }),
  };

  it('runs a sequential workflow end-to-end (happy path)', async () => {
    const wf = new WorkflowTool<RefundState>({
      name: 'process_refund',
      description: 'Process a customer refund end-to-end.',
      spec: specHappy,
      handlers,
    });
    const r = await wf.run({ amount: 50 });
    expect(r.issues).toEqual([]);
    expect(r.state.approved).toBe(true);
    expect(r.state.result).toContain('approved');
  });

  it('produces a ToolDefinition that the registry accepts', () => {
    const wf = new WorkflowTool<RefundState>({
      name: 'process_refund',
      description: 'Process a customer refund end-to-end.',
      spec: specHappy,
      handlers,
    });
    const def = wf.toToolDefinition();
    expect(def.name).toBe('process_refund');
    expect(def.metadata?.['kind']).toBe('workflow');
    expect(def.metadata?.['nodeCount']).toBe(2);
    expect(def.metadata?.['edgeCount']).toBe(1);
  });

  it('validates input via zod schema when provided', async () => {
    const wf = new WorkflowTool<RefundState>({
      name: 'process_refund',
      description: 'Process a customer refund end-to-end.',
      spec: specHappy,
      handlers,
      inputSchema: z.object({ amount: z.number().positive() }),
    });
    await expect(wf.run({ amount: -1 } as never)).rejects.toThrow();
  });

  it('returns a failure ToolResult when handler throws', async () => {
    const wf = new WorkflowTool<RefundState>({
      name: 'wf',
      description: 'always-fails',
      spec: specHappy,
      handlers: {
        validate: () => { throw new Error('boom'); },
        approve: () => ({}),
      },
    });
    const def = wf.toToolDefinition();
    const out = await def.handler({ amount: 10 });
    expect((out as { success: boolean }).success).toBe(false);
    expect((out as { error?: string }).error).toContain('boom');
  });

  it('reports validation issues (missing handler) as a failure', async () => {
    const badSpec: WorkflowSpec = {
      ...specHappy,
      nodes: [...specHappy.nodes, { id: 'unhandled', type: 'no-such-handler' }],
      edges: [...specHappy.edges, { source: 'unhandled', target: 'approve' }],
    };
    const badWf = new WorkflowTool<RefundState>({
      name: 'wf2',
      description: 'incomplete',
      spec: badSpec,
      handlers,
    });
    const r = await badWf.run({});
    expect(r.issues.length).toBeGreaterThan(0);
    const out = await badWf.toToolDefinition().handler({});
    expect((out as { success: boolean }).success).toBe(false);
    expect((out as { error?: string }).error).toContain('Workflow issues');
  });

  it('integrates with a ToolsRegistry: register + execute (happy)', async () => {
    const wf = new WorkflowTool<RefundState>({
      name: 'process_refund',
      description: 'Process a customer refund end-to-end.',
      spec: specHappy,
      handlers,
    });
    const registry = new ToolsRegistry();
    registry.register(wf.tool);
    const out = await registry.execute('process_refund', { amount: 50 });
    expect(out.success).toBe(true);
    const parsed = JSON.parse(out.output ?? '{}');
    expect(parsed.approved).toBe(true);
    expect(parsed.result).toContain('approved');
  });

  it('integrates with a ToolsRegistry: register + execute (sad)', async () => {
    const wf = new WorkflowTool<RefundState>({
      name: 'reject_refund',
      description: 'Reject refund.',
      spec: specSad,
      handlers,
    });
    const registry = new ToolsRegistry();
    registry.register(wf.tool);
    const out = await registry.execute('reject_refund', { amount: 200 });
    expect(out.success).toBe(true);
    const parsed = JSON.parse(out.output ?? '{}');
    expect(parsed.approved).toBe(false);
    expect(parsed.result).toContain('rejected');
  });
});
