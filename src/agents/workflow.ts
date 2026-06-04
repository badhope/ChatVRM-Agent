/**
 * Workflow intermediate representation.
 *
 * A {@link WorkflowSpec} is the JSON you'd round-trip from a visual
 * editor (react-flow / vue-flow / d3). It's deliberately schema-stable
 * and provider-agnostic — node `type` values are free-form strings you
 * define (e.g. "llmCall", "toolExec", "router", "humanInput").
 *
 * Workflows compile to our {@link Graph} from W4 via
 * {@link workflowToGraph}, so you can author them visually and run
 * them with the same engine that powers state graphs.
 *
 * The on-disk shape is:
 *   {
 *     id: string,
 *     name: string,
 *     nodes: [{ id, type, data, position? }],
 *     edges: [{ id, source, target, sourceHandle?, targetHandle?, condition? }],
 *     entry: string  // node id
 *   }
 */

import { Graph, START, END, type CompiledGraph, type GraphState } from './graph.agent.js';

export interface WorkflowNode {
  id: string;
  type: string;
  data?: Record<string, unknown>;
  position?: { x: number; y: number };
}

export interface WorkflowEdge {
  id?: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
  /** Optional predicate. Either a JSON-serialisable expression
   *  (`"state.score > 0.5"`) or a registered name resolved at compile. */
  condition?: string;
  label?: string;
}

export interface WorkflowSpec {
  id?: string;
  name: string;
  version?: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  entry: string;
}

export interface ValidationIssue {
  level: 'error' | 'warning';
  message: string;
  nodeId?: string;
  edgeId?: string;
}

export interface CompiledWorkflow<TState extends GraphState> {
  spec: WorkflowSpec;
  graph: CompiledGraph<TState>;
  issues: ValidationIssue[];
}

export type NodeHandler<TState extends GraphState> = (
  state: TState,
  node: WorkflowNode,
) => Promise<Partial<TState>> | Partial<TState>;

export type EdgeCondition<TState extends GraphState> = (
  state: TState,
  edge: WorkflowEdge,
) => boolean;

export interface CompileOptions<TState extends GraphState> {
  /** Map of node type -> handler. */
  handlers: Record<string, NodeHandler<TState>>;
  /** Map of condition name -> predicate. */
  conditions?: Record<string, EdgeCondition<TState>>;
  /** Graph compile options. */
  maxSteps?: number;
}

export function validateWorkflow(spec: WorkflowSpec): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const ids = new Set<string>();
  for (const n of spec.nodes) {
    if (ids.has(n.id)) {
      issues.push({ level: 'error', message: `duplicate node id: ${n.id}`, nodeId: n.id });
    }
    ids.add(n.id);
  }
  if (!ids.has(spec.entry) && spec.entry !== START) {
    issues.push({ level: 'error', message: `entry node not found: ${spec.entry}` });
  }
  for (const e of spec.edges) {
    if (!ids.has(e.source)) {
      issues.push({ level: 'error', message: `edge source not found: ${e.source}`, edgeId: e.id });
    }
    if (!ids.has(e.target) && e.target !== END) {
      issues.push({ level: 'error', message: `edge target not found: ${e.target}`, edgeId: e.id });
    }
  }
  // Detect orphans.
  const incoming = new Set<string>();
  for (const e of spec.edges) incoming.add(e.target);
  for (const n of spec.nodes) {
    if (n.id !== spec.entry && !incoming.has(n.id)) {
      issues.push({ level: 'warning', message: `orphan node: ${n.id}`, nodeId: n.id });
    }
  }
  return issues;
}

export function workflowToGraph<TState extends GraphState>(
  spec: WorkflowSpec,
  opts: CompileOptions<TState>,
): CompiledWorkflow<TState> {
  const issues = validateWorkflow(spec);
  const graph = new Graph<TState>();
  for (const n of spec.nodes) {
    const handler = opts.handlers[n.type];
    if (!handler) {
      issues.push({ level: 'error', message: `no handler for type: ${n.type}`, nodeId: n.id });
    }
    graph.addNode(n.id, async (state) => {
      if (!handler) throw new Error(`No handler for node type: ${n.type} (node=${n.id})`);
      return handler(state, n);
    });
  }
  // Group edges by source.
  const bySource = new Map<string, WorkflowEdge[]>();
  for (const e of spec.edges) {
    const arr = bySource.get(e.source) ?? [];
    arr.push(e);
    bySource.set(e.source, arr);
  }
  for (const [source, edges] of bySource) {
    if (edges.length === 1) {
      graph.addEdge(source, edges[0].target);
    } else {
      // Conditional: each condition is evaluated against the live state.
      // The graph's ConditionalFn is synchronous; if you need async
      // conditions, wrap the condition as a synchronous cache that
      // returns the next-step decision made earlier in the state.
      const route = (state: TState): string => {
        for (const e of edges) {
          const cond = e.condition ? opts.conditions?.[e.condition] : undefined;
          if (cond === undefined) {
            // No condition means "default" — only the last edge with no
            // condition acts as a default. (Convention: put the default
            // last in the array.)
            if (!e.condition) return e.target;
            continue;
          }
          if (cond(state, e)) return e.target;
        }
        return END;
      };
      graph.addConditionalEdge(source, route);
    }
  }
  const compiled = graph.compile({ maxSteps: opts.maxSteps, entry: spec.entry });
  return { spec, graph: compiled, issues };
}
