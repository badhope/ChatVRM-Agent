import { EventEmitter } from 'eventemitter3';
import type { ILLMPort, LLMToolSpec } from '../ports/llm.port.js';
import type { IToolsPort, ToolDefinition, ToolResult } from '../ports/tools.port.js';
import type { ProviderType } from '../ports/config.port.js';
import type { IObservability } from '../ports/observability.port.js';
import type { ISessionStore } from '../ports/session-store.port.js';
import { ReActAgent, type ReActResult, attachInputSchema } from './react.agent.js';
import { z } from 'zod';

/**
 * A single agent with a role, a goal, and an optional backstory.
 * Mirrors CrewAI's `Agent` and AutoGen's `ConversableAgent` (without
 * the network protocol) — its only knowledge of other agents is
 * the {@link delegate} tool which calls a peer and returns the result.
 */
export interface AgentDefinition {
  name: string;
  role: string;
  goal: string;
  backstory?: string;
  /** Tools the agent can use. Optional, default: empty. */
  tools?: string[];
  /** Tools the agent may delegate to (peer agent names). */
  canDelegateTo?: string[];
  /** Force a specific provider/model. */
  provider?: ProviderType;
  model?: string;
  temperature?: number;
  /** Lower number = more conservative. Default 0. */
  temperature_?: number;
  /** Allow parallel tool calls. Default false. */
  allowParallel?: boolean;
  /** Max ReAct iterations. Default 6. */
  maxIterations?: number;
}

export interface AgentRunResult {
  agentName: string;
  output: string;
  steps: ReActResult['steps'];
  tokens: { promptTokens: number; completionTokens: number; totalTokens: number };
  finishReason: ReActResult['finishReason'];
}

export interface AgentEvents {
  'agent:start': { name: string; input: string };
  'agent:done': { name: string; result: AgentRunResult };
  'agent:delegate': { from: string; to: string; task: string; result: string };
  'crew:start': { agents: string[]; input: string };
  'crew:agent:start': { agent: string; index: number };
  'crew:agent:done': { agent: string; result: AgentRunResult };
  'crew:done': { result: CrewResult };
}

export interface AgentDeps {
  llm: ILLMPort;
  tools: IToolsPort;
  /** All agents that may be referenced by `canDelegateTo`. */
  registry: AgentRegistry;
  /** Optional shared scratchpad that any agent can write to. */
  sharedMemory?: SharedMemory;
  eventBus?: EventEmitter<AgentEvents>;
  /** Optional observability backend — propagated to every child ReAct. */
  observability?: IObservability;
  /** Optional session store — propagated to every child ReAct. */
  sessionStore?: ISessionStore;
  /** Use streaming chat on every child ReAct. */
  stream?: boolean;
}

const DELEGATE_TOOL_NAME = '__delegate__';

export class AgentRegistry {
  private byName = new Map<string, AgentInstance>();

  register(agent: AgentInstance): void {
    if (this.byName.has(agent.def.name)) {
      throw new Error(`Agent "${agent.def.name}" is already registered`);
    }
    this.byName.set(agent.def.name, agent);
  }

  get(name: string): AgentInstance | undefined {
    return this.byName.get(name);
  }

  names(): string[] {
    return [...this.byName.keys()];
  }

  all(): AgentInstance[] {
    return [...this.byName.values()];
  }
}

/**
 * Thread-safe append-only key-value store shared across all agents in a
 * crew. The crew uses it for handoffs ("the previous agent said X, so
 * the next one starts with that context").
 */
export class SharedMemory {
  private store = new Map<string, string>();
  private history: Array<{ at: string; agent: string; key: string; value: string }> = [];

  set(agent: string, key: string, value: string): void {
    const fullKey = `${agent}::${key}`;
    this.store.set(fullKey, value);
    this.history.push({ at: new Date().toISOString(), agent, key, value });
  }

  get(agent: string, key: string): string | undefined {
    return this.store.get(`${agent}::${key}`);
  }

  /** All values written by the given agent, flattened as `key: value`. */
  dump(agent: string): string {
    return [...this.store.entries()]
      .filter(([k]) => k.startsWith(`${agent}::`))
      .map(([k, v]) => `${k.split('::').slice(1).join('::')}: ${v}`)
      .join('\n');
  }

  /** Recent activity across all agents (newest last). */
  recent(limit = 20): Array<{ at: string; agent: string; key: string; value: string }> {
    return this.history.slice(-limit);
  }

  clear(): void {
    this.store.clear();
    this.history.length = 0;
  }
}

/**
 * The runtime instance. Wraps a ReActAgent pre-configured with the
 * role / goal / backstory baked into the system prompt plus any
 * delegate tools the agent can use to hand work off.
 */
export class AgentInstance {
  def: AgentDefinition;
  private deps: AgentDeps;
  private delegateToolDef: ToolDefinition | null = null;
  private delegateSpec: LLMToolSpec | null = null;

  constructor(def: AgentDefinition, deps: AgentDeps) {
    this.def = def;
    this.deps = deps;
    if (def.canDelegateTo && def.canDelegateTo.length > 0) {
      this.installDelegateTool();
    }
  }

  /**
   * Run the agent on a user task. The system prompt is constructed
   * from the role/goal/backstory so the LLM knows its persona.
   */
  async run(input: string, sharedContext?: string): Promise<AgentRunResult> {
    const systemPrompt = this.buildSystemPrompt(sharedContext);
    const events = this.deps.eventBus;
    events?.emit('agent:start', { name: this.def.name, input });

    // Filter the tool registry to the agent's allowed tools.
    const allDefs = this.deps.tools.listAll();
    const allowed = this.def.tools
      ? allDefs.filter((t) => this.def.tools!.includes(t.name))
      : allDefs;

    // Inject a sub-registry that only exposes the allowed tools,
    // plus the delegate tool (if installed).
    const scopedRegistry = new ScopedToolsPort(this.deps.tools, [...allowed.map((t) => t.name), DELEGATE_TOOL_NAME].filter((v, i, a) => a.indexOf(v) === i));

    // Wrap delegate tool calls back to AgentInstance.
    const wrappedExecute = async (name: string, args: Record<string, unknown>): Promise<ToolResult> => {
      if (name === DELEGATE_TOOL_NAME) {
        return this.executeDelegate(args);
      }
      return this.deps.tools.execute(name, args);
    };
    scopedRegistry.delegateExecute = wrappedExecute;

    const react = new ReActAgent({
      llm: this.deps.llm,
      tools: scopedRegistry,
      provider: this.def.provider,
      model: this.def.model,
      temperature: this.def.temperature ?? this.def.temperature_,
      maxIterations: this.def.maxIterations ?? 6,
      allowParallel: this.def.allowParallel ?? false,
      systemPrompt,
      // The ReAct bus is distinct from the agent bus; we just want to
      // let the caller observe iterations. The ReAct bus is unused here
      // because the agent's own bus already emits 'agent:start'/'agent:done'.
      eventBus: undefined,
      // Propagate cross-cutting concerns so every agent run shows up
      // in the same trace / session.
      observability: this.deps.observability,
      sessionStore: this.deps.sessionStore,
      stream: this.deps.stream,
    });

    let result: ReActResult;
    try {
      // Open a span per agent so the trace shows the per-agent
      // contribution (delegations become child spans).
      const trace = this.deps.observability
        ? await this.deps.observability.trace(`agent.${this.def.name}`, { input, metadata: { role: this.def.role } })
        : null;
      try {
        result = await react.run(input);
        if (trace) await trace.end({ output: { output: result.output } });
      } catch (runErr) {
        if (trace) await trace.end({ output: { error: runErr instanceof Error ? runErr.message : String(runErr) }, level: 'error' });
        throw runErr;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const fallback: AgentRunResult = {
        agentName: this.def.name,
        output: `[agent error] ${message}`,
        steps: [],
        tokens: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        finishReason: 'error',
      };
      events?.emit('agent:done', { name: this.def.name, result: fallback });
      return fallback;
    }

    const ar: AgentRunResult = {
      agentName: this.def.name,
      output: result.output,
      steps: result.steps,
      tokens: { promptTokens: 0, completionTokens: 0, totalTokens: result.totalTokens },
      finishReason: result.finishReason,
    };
    // Persist a summary in shared memory if there's a shared memory slot.
    if (this.deps.sharedMemory) {
      this.deps.sharedMemory.set(this.def.name, 'last_output', result.output);
    }
    events?.emit('agent:done', { name: this.def.name, result: ar });
    return ar;
  }

  private buildSystemPrompt(sharedContext?: string): string {
    const lines: string[] = [];
    lines.push(`You are "${this.def.name}", a ${this.def.role}.`);
    if (this.def.goal) lines.push(`Your goal: ${this.def.goal}`);
    if (this.def.backstory) lines.push(`Background: ${this.def.backstory}`);
    lines.push('');
    lines.push('Stay in character. Use the tools available to you. If you need a peer agent to do a subtask, use the `__delegate__` tool.');
    if (sharedContext) {
      lines.push('');
      lines.push('Context from previous agents:');
      lines.push(sharedContext);
    }
    if (this.deps.sharedMemory) {
      const dump = this.deps.sharedMemory.dump(this.def.name);
      if (dump) {
        lines.push('');
        lines.push('Your prior notes in shared memory:');
        lines.push(dump);
      }
    }
    return lines.join('\n');
  }

  private installDelegateTool(): void {
    const enumValues = this.def.canDelegateTo ?? [];
    this.delegateToolDef = attachInputSchema(
      {
        name: DELEGATE_TOOL_NAME,
        description:
          `Hand off a subtask to a peer agent (one of: ${enumValues.join(', ')}). ` +
          `Use this when another agent is better suited for a sub-task. Returns the peer's final answer.`,
        handler: async () => ({ success: true, output: '' }),
      },
      z.object({
        to: z.enum(enumValues as [string, ...string[]]).describe('Peer agent name'),
        task: z.string().min(1).describe('A self-contained subtask the peer can solve'),
      }),
    );
    this.delegateSpec = {
      name: DELEGATE_TOOL_NAME,
      description: this.delegateToolDef.description,
      parameters: {
        type: 'object',
        properties: {
          to: { type: 'string', enum: enumValues, description: 'Peer agent name' },
          task: { type: 'string', description: 'A self-contained subtask the peer can solve' },
        },
        required: ['to', 'task'],
      },
    };
  }

  /** Public: an external tool registry can include the delegate spec when exposing this agent. */
  getDelegateToolSpec(): LLMToolSpec | null {
    return this.delegateSpec;
  }

  private async executeDelegate(args: Record<string, unknown>): Promise<ToolResult> {
    const to = String(args['to'] ?? '');
    const task = String(args['task'] ?? '');
    const peer = this.deps.registry.get(to);
    if (!peer) {
      return { success: false, error: `No agent named "${to}"` };
    }
    const peerResult = await peer.run(task, `[delegated by ${this.def.name} for task: ${task}]`);
    this.deps.eventBus?.emit('agent:delegate', { from: this.def.name, to, task, result: peerResult.output });
    return { success: true, output: peerResult.output };
  }
}

/**
 * A read-only view of the tools registry that only exposes a whitelist
 * of tool names. Also allows swapping out the execute() implementation
 * so delegate tools route through the AgentInstance.
 */
class ScopedToolsPort implements IToolsPort {
  private allowed: Set<string>;
  public delegateExecute: ((name: string, args: Record<string, unknown>) => Promise<ToolResult>) | null = null;
  constructor(private parent: IToolsPort, allowed: string[]) {
    this.allowed = new Set(allowed);
  }
  register(): void {
    throw new Error('ScopedToolsPort is read-only');
  }
  unregister(): boolean {
    throw new Error('ScopedToolsPort is read-only');
  }
  has(name: string): boolean {
    return this.allowed.has(name);
  }
  list(): ToolDefinition[] {
    return this.parent.listAll().filter((d) => this.allowed.has(d.name));
  }
  listAll(): ToolDefinition[] {
    return this.parent.listAll().filter((d) => this.allowed.has(d.name));
  }
  get(name: string): ToolDefinition {
    if (!this.allowed.has(name)) {
      throw new Error(`Tool "${name}" not in agent's allowlist`);
    }
    if (name === DELEGATE_TOOL_NAME) {
      // We need a definition; the AgentInstance owns it, so callers
      // should attach the spec separately when handing the agent tools
      // to the LLM. Returning a synthetic def here is enough for the
      // ReActAgent.collectLLMTools() pass.
      return {
        name: DELEGATE_TOOL_NAME,
        description: 'delegate to a peer agent',
        parameters: { type: 'object' },
        handler: async () => ({ success: true, output: '' }),
      };
    }
    return this.parent.get(name);
  }
  async execute(name: string, args: Record<string, unknown>): Promise<ToolResult> {
    if (name === DELEGATE_TOOL_NAME && this.delegateExecute) {
      return this.delegateExecute(name, args);
    }
    if (!this.allowed.has(name)) {
      return { success: false, error: `Tool "${name}" not in agent's allowlist` };
    }
    return this.parent.execute(name, args);
  }
}

/* ============================================================
 * Crew — orchestrates a sequence of agents (or runs them in parallel).
 * ============================================================ */

export type CrewProcess = 'sequential' | 'parallel';

export interface CrewDefinition {
  agents: AgentDefinition[];
  process?: CrewProcess;
  /** When sequential, each agent's output is prepended to the next agent's prompt. */
  shareContext?: boolean;
  /** Max parallel agents when process='parallel'. */
  maxParallel?: number;
}

export interface CrewResult {
  process: CrewProcess;
  perAgent: AgentRunResult[];
  finalOutput: string;
  totalTokens: number;
  totalDurationMs: number;
}

export class Crew {
  private registry: AgentRegistry;
  private shared: SharedMemory;
  private bus: EventEmitter<AgentEvents>;
  private deps: AgentDeps;

  constructor(
    llm: ILLMPort,
    tools: IToolsPort,
    options?: {
      observability?: IObservability;
      sessionStore?: ISessionStore;
      stream?: boolean;
      eventBus?: EventEmitter<AgentEvents>;
    },
  ) {
    this.registry = new AgentRegistry();
    this.shared = new SharedMemory();
    this.bus = options?.eventBus ?? new EventEmitter<AgentEvents>();
    this.deps = {
      llm,
      tools,
      registry: this.registry,
      sharedMemory: this.shared,
      eventBus: this.bus,
      observability: options?.observability,
      sessionStore: options?.sessionStore,
      stream: options?.stream,
    };
  }

  /** Add an agent to the crew. */
  add(agent: AgentDefinition): AgentInstance {
    const inst = new AgentInstance(agent, this.deps);
    this.registry.register(inst);
    return inst;
  }

  /** Access the shared scratchpad (read/write). */
  get memory(): SharedMemory {
    return this.shared;
  }

  get events(): EventEmitter<AgentEvents> {
    return this.bus;
  }

  async run(def: CrewDefinition, input: string): Promise<CrewResult> {
    const process = def.process ?? 'sequential';
    const startTime = performance.now();
    this.bus.emit('crew:start', { agents: def.agents.map((a) => a.name), input });

    const instances: AgentInstance[] = def.agents.map((a) => {
      const existing = this.registry.get(a.name);
      if (existing) return existing;
      return this.add(a);
    });

    let perAgent: AgentRunResult[];
    if (process === 'sequential') {
      perAgent = await this.runSequential(instances, input, def.shareContext ?? true);
    } else {
      perAgent = await this.runParallel(instances, input, def.maxParallel ?? 4);
    }

    // Final output: the last agent's output.
    const finalOutput = perAgent.length > 0 ? perAgent[perAgent.length - 1]!.output : '';
    const totalTokens = perAgent.reduce((s, r) => s + r.tokens.totalTokens, 0);
    const result: CrewResult = {
      process,
      perAgent,
      finalOutput,
      totalTokens,
      totalDurationMs: Math.round(performance.now() - startTime),
    };
    this.bus.emit('crew:done', { result });
    return result;
  }

  private async runSequential(
    instances: AgentInstance[],
    input: string,
    shareContext: boolean,
  ): Promise<AgentRunResult[]> {
    const results: AgentRunResult[] = [];
    let runningContext = '';
    for (let i = 0; i < instances.length; i += 1) {
      const inst = instances[i]!;
      this.bus.emit('crew:agent:start', { agent: inst.def.name, index: i });
      const ctx = shareContext && runningContext ? `Previous agent output:\n${runningContext}\n\nOriginal user request:\n${input}` : undefined;
      const r = await inst.run(input, ctx);
      this.bus.emit('crew:agent:done', { agent: inst.def.name, result: r });
      results.push(r);
      runningContext = r.output;
    }
    return results;
  }

  private async runParallel(instances: AgentInstance[], input: string, maxParallel: number): Promise<AgentRunResult[]> {
    const results: AgentRunResult[] = [];
    let cursor = 0;
    const workers: Array<Promise<void>> = [];
    for (let w = 0; w < Math.min(maxParallel, instances.length); w += 1) {
      workers.push(
        (async () => {
          while (true) {
            const idx = cursor++;
            if (idx >= instances.length) return;
            const inst = instances[idx]!;
            this.bus.emit('crew:agent:start', { agent: inst.def.name, index: idx });
            const r = await inst.run(input);
            this.bus.emit('crew:agent:done', { agent: inst.def.name, result: r });
            results.push(r);
          }
        })(),
      );
    }
    await Promise.all(workers);
    return results;
  }
}
