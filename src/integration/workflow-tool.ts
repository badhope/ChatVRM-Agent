/**
 * Workflow-as-a-Tool.
 *
 * Compiles a {@link WorkflowSpec} (the visual / declarative IR from
 * W6) into a single tool definition that can be registered on a
 * `ToolsRegistry`. From the agent's perspective, calling
 * `run_workflow("…")` is just like calling any other tool — the
 * actual orchestration (conditional routing, state passing, multiple
 * steps) happens inside the compiled `Graph`.
 *
 * Use this to expose complex multi-step business processes to the
 * agent as a primitive, instead of forcing the LLM to chain
 * half-a-dozen tool calls itself.
 *
 * Usage:
 *
 *   const wf = new WorkflowTool({
 *     name: 'process_refund',
 *     description: 'Process a customer refund end-to-end.',
 *     spec,
 *     handlers: { ... },
 *   });
 *   tools.register(wf.tool);
 */

import type { ToolDefinition, ToolResult } from '../ports/tools.port.js';
import { workflowToGraph, type WorkflowSpec } from '../agents/workflow.js';
import type { GraphState } from '../agents/graph.agent.js';
import { z } from 'zod';
import { zodToJsonSchema } from '../agents/zod-schema.js';

export interface WorkflowToolOptions<TState extends GraphState> {
  /** Tool name exposed to the LLM. */
  name: string;
  /** Tool description surfaced to the LLM. */
  description: string;
  /** The visual-workflow IR. */
  spec: WorkflowSpec;
  /** Per-node handlers (must cover every `type` in `spec.nodes`). */
  handlers: Record<string, (state: TState, node: { id: string; data?: Record<string, unknown> }) => Partial<TState> | Promise<Partial<TState>>>;
  /** Optional input validator; if absent, the spec must include a node
   *  named `__input__` of type 'read' that seeds the state. */
  inputSchema?: z.ZodTypeAny;
  /** Max graph steps before abort. */
  maxSteps?: number;
}

export class WorkflowTool<TState extends GraphState = GraphState> {
  readonly name: string;
  readonly description: string;
  private readonly spec: WorkflowSpec;
  private readonly handlers: WorkflowToolOptions<TState>['handlers'];
  private readonly inputSchema: z.ZodTypeAny | undefined;
  private readonly maxSteps: number;

  constructor(opts: WorkflowToolOptions<TState>) {
    this.name = opts.name;
    this.description = opts.description;
    this.spec = opts.spec;
    this.handlers = opts.handlers;
    this.inputSchema = opts.inputSchema;
    this.maxSteps = opts.maxSteps ?? 50;
  }

  /** Run the workflow directly (useful for CLI / tests). */
  async run(input: unknown): Promise<{ output: unknown; state: TState; issues: string[] }> {
    const validated = this.inputSchema ? this.inputSchema.parse(input) : input;
    const { graph, issues } = workflowToGraph<TState>(this.spec, {
      handlers: this.handlers as Record<string, (state: TState, node: { id: string; data?: Record<string, unknown> }) => Partial<TState> | Promise<Partial<TState>>>,
      maxSteps: this.maxSteps,
    });
    const issueStrings = issues.map((i) => `[${i.level}] ${i.nodeId ? `node=${i.nodeId}: ` : ''}${i.message}`);
    if (issueStrings.length > 0) {
      return { output: null, state: validated as TState, issues: issueStrings };
    }
    const state = await graph.run(validated as TState);
    return { output: state, state, issues: [] };
  }

  /** The {@link ToolDefinition} that an agent can register. */
  toToolDefinition(): ToolDefinition {
    const tool: ToolDefinition = {
      name: this.name,
      description: this.description,
      inputSchema: this.inputSchema
        ? zodToJsonSchema(this.inputSchema)
        : ({ type: 'object', properties: { input: {} } } as Record<string, unknown>),
      metadata: { kind: 'workflow', nodeCount: this.spec.nodes.length, edgeCount: this.spec.edges.length },
      handler: async (args): Promise<ToolResult> => {
        try {
          const r = await this.run(args);
          if (r.issues.length > 0) {
            return { success: false, error: `Workflow issues: ${r.issues.join('; ')}` };
          }
          return { success: true, output: JSON.stringify(r.state, null, 2) };
        } catch (err) {
          return { success: false, error: err instanceof Error ? err.message : String(err) };
        }
      },
    };
    return tool;
  }

  /** Sugar: `tools.register(wf.tool)`. */
  get tool(): ToolDefinition {
    return this.toToolDefinition();
  }
}
