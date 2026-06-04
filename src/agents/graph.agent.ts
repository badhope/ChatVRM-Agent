import { EventEmitter } from 'eventemitter3';

/**
 * State passed between nodes. The graph executor holds a single
 * object that nodes mutate and the runner reads to decide routing.
 */
export type GraphState = Record<string, unknown>;

export type NodeFn<T extends GraphState = GraphState> = (state: T) => Promise<Partial<T>> | Partial<T>;

export type ConditionalFn<T extends GraphState = GraphState> = (state: T) => string;

/**
 * Human-in-the-loop nodes block until {@link resume} is called with
 * a payload (typically the operator's typed response, or a tool result
 * that was waiting for approval). The runner emits a `human:request`
 * event with the prompt and the node id; an external system calls
 * `runner.resume(nodeId, payload)`.
 */
export interface HumanRequest {
  nodeId: string;
  prompt: string;
  state: GraphState;
}

export interface GraphEvents {
  'node:start': { nodeId: string; state: GraphState };
  'node:done': { nodeId: string; state: GraphState; next: string | string[] | null };
  'node:error': { nodeId: string; error: Error };
  'edge:taken': { from: string; to: string; reason: 'static' | 'conditional' | 'loop' };
  'human:request': HumanRequest;
  'graph:start': { entryNode: string };
  'graph:done': { finalState: GraphState };
}

/* ----------------------------------------------------------------- */

export const START = '__start__';
export const END = '__end__';

interface NodeRecord {
  id: string;
  fn: NodeFn;
}

interface EdgeRecord {
  from: string;
  to: string;
  /** Set when this is a conditional edge; otherwise static. */
  route?: ConditionalFn;
}

export interface GraphDefinition<T extends GraphState = GraphState> {
  nodes: Array<{ id: string; fn: NodeFn<T> }>;
  edges: Array<{ from: string; to: string; route?: ConditionalFn<T> }>;
  /** Starting node. Default: the first declared node. */
  entry?: string;
  /** Max steps before stopping. Default 50. */
  maxSteps?: number;
}

/**
 * Build a graph. Replaces the linear 6-stage pipeline with a
 * LangGraph-style state machine: nodes + edges (static or conditional)
 * + cycles + human-in-the-loop.
 */
export class Graph<T extends GraphState = GraphState> {
  private nodes: Map<string, NodeRecord> = new Map();
  private outgoing: Map<string, EdgeRecord[]> = new Map();

  constructor() {}

  addNode(id: string, fn: NodeFn<T>): this {
    if (this.nodes.has(id)) throw new Error(`Node "${id}" already exists`);
    this.nodes.set(id, { id, fn: fn as unknown as NodeFn });
    return this;
  }

  /** Static edge. If the source has multiple static edges we take the last-registered (deterministic order). */
  addEdge(from: string, to: string): this {
    this.pushOutgoing({ from, to });
    return this;
  }

  /**
   * Conditional edge: a function of the state picks the next node id.
   * No placeholder target needed — the actual destination is resolved
   * at runtime via the route function.
   */
  addConditionalEdge(from: string, route: ConditionalFn<T>): this {
    this.pushOutgoing({ from, to: '__conditional__', route: route as unknown as ConditionalFn });
    return this;
  }

  private pushOutgoing(e: EdgeRecord): void {
    if (!this.nodes.has(e.from) && e.from !== START) {
      throw new Error(`Edge from unknown node "${e.from}"`);
    }
    // Conditional edges use a sentinel target that the route resolves at
    // runtime, so we only validate static destinations here.
    if (!e.route && !this.nodes.has(e.to) && e.to !== END) {
      throw new Error(`Edge to unknown node "${e.to}"`);
    }
    const list = this.outgoing.get(e.from) ?? [];
    list.push(e);
    this.outgoing.set(e.from, list);
  }

  /** All node ids this graph can reach from the given source. */
  allowedNext(from: string): string[] {
    const list = this.outgoing.get(from) ?? [];
    return list
      .map((e) => (e.route ? '__conditional__' : e.to))
      .filter((v, i, a) => a.indexOf(v) === i);
  }

  /** Compile the graph into a runnable. */
  compile(opts?: { maxSteps?: number; entry?: string }): CompiledGraph<T> {
    if (this.nodes.size === 0) throw new Error('Cannot compile empty graph');
    const nodeIds = [...this.nodes.keys()];
    const entry = opts?.entry ?? nodeIds[0]!;
    return new CompiledGraph(this, entry, opts?.maxSteps ?? 50);
  }
}

export class CompiledGraph<T extends GraphState = GraphState> {
  private graph: Graph<T>;
  private entry: string;
  private maxSteps: number;
  private bus: EventEmitter<GraphEvents> = new EventEmitter<GraphEvents>();
  /** Pending human requests keyed by node id. */
  private pendingHuman = new Map<string, (payload: unknown) => void>();

  constructor(graph: Graph<T>, entry: string, maxSteps: number) {
    this.graph = graph;
    this.entry = entry;
    this.maxSteps = maxSteps;
  }

  get events(): EventEmitter<GraphEvents> {
    return this.bus;
  }

  /**
   * Run the graph from a starting state. Returns the final state
   * (potentially the empty state if the graph exits via END immediately).
   */
  async run(initialState: T): Promise<T> {
    let state: T = { ...initialState };
    let current = this.entry;
    let steps = 0;

    this.bus.emit('graph:start', { entryNode: current });

    while (current !== END) {
      if (steps >= this.maxSteps) {
        throw new Error(`Graph exceeded maxSteps=${this.maxSteps} (possible cycle without termination)`);
      }
      steps += 1;

      const node = this.graph['nodes'].get(current) as NodeRecord | undefined;
      if (!node) throw new Error(`Unknown node "${current}" in graph`);

      this.bus.emit('node:start', { nodeId: current, state });

      let patch: Partial<T> = {};
      try {
        const result = await node.fn(state);
        patch = (result ?? {}) as Partial<T>;
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        this.bus.emit('node:error', { nodeId: current, error });
        throw error;
      }
      state = { ...state, ...patch };

      // Human-in-the-loop support: if patch.__human__ is a {prompt,...}
      // object, block until resume() is called.
      const humanReq = (patch as Record<string, unknown>)['__human__'] as HumanRequest | undefined;
      if (humanReq) {
        await new Promise<void>((resolve) => {
          this.pendingHuman.set(current, (payload) => {
            state = { ...state, __human_input__: payload } as T;
            resolve();
          });
          this.bus.emit('human:request', humanReq);
        });
        // After resume, drop the __human__ marker and continue from the
        // same node (the human's input is now in state.__human_input__).
        delete (state as Record<string, unknown>)['__human__'];
        this.bus.emit('node:done', { nodeId: current, state, next: current });
        continue;
      }

      // Pick the next node.
      const next = this.pickNext(current, state);
      this.bus.emit('edge:taken', { from: current, to: next ?? END, reason: this.edgeReason(current) });
      this.bus.emit('node:done', { nodeId: current, state, next });
      current = next ?? END;
    }

    this.bus.emit('graph:done', { finalState: state });
    return state;
  }

  /**
   * Resume a paused human-in-the-loop node with the operator's input.
   */
  resume(nodeId: string, payload: unknown): boolean {
    const waiter = this.pendingHuman.get(nodeId);
    if (!waiter) return false;
    this.pendingHuman.delete(nodeId);
    waiter(payload);
    return true;
  }

  private pickNext(from: string, state: T): string | null {
    const edges = (this.graph['outgoing'].get(from) ?? []) as EdgeRecord[];
    if (edges.length === 0) return null;

    // Find any conditional edge; the first one's route decides.
    const conditional = edges.find((e) => e.route);
    if (conditional && conditional.route) {
      const target = conditional.route(state);
      // Validate target exists.
      if (!this.graph['nodes'].has(target) && target !== END) {
        throw new Error(`Conditional edge from "${from}" returned unknown node "${target}"`);
      }
      return target;
    }

    // No conditional: take the first static edge (deterministic order).
    return edges[0]!.to;
  }

  private edgeReason(from: string): 'static' | 'conditional' | 'loop' {
    const edges = (this.graph['outgoing'].get(from) ?? []) as EdgeRecord[];
    if (edges.some((e) => e.route)) return 'conditional';
    const target = edges[0]?.to;
    if (target && target !== END && this.graph['nodes'].has(target)) {
      // We don't know the path; report loop only if a target equals source.
      if (target === from) return 'loop';
    }
    return 'static';
  }
}

/**
 * Helper: declare a human request in a node's return value. Example:
 *
 *   graph.addNode('review', async (state) => {
 *     return { __human__: { nodeId: 'review', prompt: 'Approve?', state } };
 *   });
 *   graph.addEdge('review', 'ship');
 */
export function humanRequest(nodeId: string, prompt: string, state: GraphState): HumanRequest {
  return { nodeId, prompt, state };
}
