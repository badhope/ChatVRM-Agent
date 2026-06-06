/**
 * Agents-runtime routes — drive the W11 agent stack (ReAct, Crew, Graph)
 * over HTTP.
 *
 *   POST /api/runtime/agents/react
 *     body: { input: string, maxIterations?: number, model?: string,
 *             systemPrompt?: string, temperature?: number,
 *             stream?: boolean, sessionId?: string }
 *   POST /api/runtime/agents/crew
 *     body: { input: string, process?: 'sequential' | 'parallel',
 *             shareContext?: boolean, maxParallel?: number,
 *             agents: AgentSpec[] }
 *   POST /api/runtime/agents/graph
 *     body: { nodes: NodeSpec[], edges: EdgeSpec[], entry?: string,
 *             maxSteps?: number, initialState?: Record<string, unknown> }
 *   GET  /api/runtime/agents/manifest
 *     → { tools: string[], models: string[] }
 *
 * All routes emit a top-level `react:*` / `agent:*` / `graph:*` event
 * on the shared runtime bus so registered webhooks can stream the run
 * to external sinks in real time.
 */

import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { ReActAgent } from '../../src/agents/react.agent.js';
import { Crew, type AgentDefinition, type CrewProcess } from '../../src/agents/crew.agent.js';
import { Graph, END, START, type ConditionalFn, type GraphState, type NodeFn } from '../../src/agents/graph.agent.js';
import { getRuntime } from '../runtime.js';
import type { ILLMPort } from '../../src/ports/llm.port.js';
import type { IToolsPort } from '../../src/ports/tools.port.js';
import type { IConfigPort } from '../../src/ports/config.port.js';
import type { IMemoryPort } from '../../src/ports/memory.port.js';
import type { IStoragePort } from '../../src/ports/storage.port.js';
import type { IShellPort } from '../../src/ports/shell.port.js';

export interface AgentsRuntimeDeps {
  llm: ILLMPort;
  config: IConfigPort;
  memory: IMemoryPort;
  storage: IStoragePort;
  tools: IToolsPort;
  shell: IShellPort;
}

const ReactRunSchema = z.object({
  input: z.string().min(1).max(4000),
  maxIterations: z.number().int().positive().max(50).optional().default(6),
  model: z.string().optional(),
  systemPrompt: z.string().max(4000).optional(),
  temperature: z.number().min(0).max(2).optional(),
  stream: z.boolean().optional().default(false),
  sessionId: z.string().optional(),
});

const AgentSpecSchema = z.object({
  name: z.string().min(1),
  role: z.string().min(1),
  goal: z.string().min(1),
  backstory: z.string().optional(),
  // L15 (W19): cap `toolNames` at 32 to keep a single agent
  // from pulling in the whole tool registry (which would blow
  // the prompt budget in `react.agent.run()` and the LLM
  // schema-validation step in the OpenAI provider). The
  // previous code accepted any-length array, so a malicious /
  // buggy caller could request 10k tools and crash the
  // request with a 4 MB prompt. 32 is well above the
  // realistic upper bound (the actual tool registry in
  // `src/integration/tools-setup.ts` ships with 25) and
  // matches what the registered tool registry itself is
  // bounded at.
  toolNames: z.array(z.string()).max(32).optional().default([]),
  model: z.string().optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxIterations: z.number().int().positive().max(50).optional().default(4),
  systemPrompt: z.string().optional(),
});

const CrewRunSchema = z.object({
  input: z.string().min(1).max(4000),
  process: z.enum(['sequential', 'parallel']).optional().default('sequential'),
  shareContext: z.boolean().optional().default(true),
  maxParallel: z.number().int().positive().max(16).optional().default(4),
  agents: z.array(AgentSpecSchema).min(1).max(8),
});

const NodeSpecSchema = z.object({
  id: z.string().min(1),
  /** Built-in node kind or a JS expression evaluated server-side. */
  kind: z.enum(['echo', 'uppercase', 'append-tokens', 'noop']).optional().default('echo'),
  prefix: z.string().optional(),
});

const EdgeSpecSchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  /** When true, `to` is interpreted as the literal END marker. */
  end: z.boolean().optional().default(false),
});

const GraphRunSchema = z.object({
  nodes: z.array(NodeSpecSchema).min(1).max(32),
  edges: z.array(EdgeSpecSchema).min(0).max(64),
  entry: z.string().optional(),
  maxSteps: z.number().int().positive().max(200).optional().default(50),
  initialState: z.record(z.string(), z.unknown()).optional().default({}),
});

export function agentsRuntimeRoutes(deps: AgentsRuntimeDeps): Router {
  const router = Router();
  // C1 (W18): auth is applied globally in app.ts.

  router.get('/manifest', async (_req: Request, res: Response) => {
    try {
      const tools = (deps.tools.list?.() ?? deps.tools.listAll()).map((t) => t.name);
      let models: string[] = [];
      try {
        models = await deps.llm.listModels('openai' as never);
      } catch (err) {
        process.stderr.write(`[manifest] listModels threw: ${(err as Error).message}\n`);
        models = [];
      }
      res.json({ tools, models });
    } catch (err) {
      res.status(500).json({ error: 'manifest_failed', message: (err as Error).message });
    }
  });

  router.post('/react', async (req: Request, res: Response) => {
    const parsed = ReactRunSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid_request', issues: parsed.error.issues });
      return;
    }
    const rt = getRuntime();
    const data = parsed.data;
    try {
      // ReActAgent requires at least one tool with an inputSchema. The
      // default `registerDefaultTools` set does not declare schemas, so
      // we register a minimal `noop` tool on demand (idempotent).
      if (!deps.tools.has('noop')) {
        deps.tools.register({
          name: 'noop',
          description: 'Do nothing and return success. Useful as a placeholder tool for ReAct trajectories.',
          inputSchema: {
            type: 'object',
            properties: { reason: { type: 'string', description: 'Why this tool was called (free-form).' } },
            additionalProperties: false,
          },
          handler: async (args) => ({ success: true, output: `noop: ${String((args as { reason?: string }).reason ?? '')}` }),
        });
      }
      const agent = new ReActAgent({
        llm: deps.llm,
        tools: deps.tools,
        model: data.model,
        systemPrompt: data.systemPrompt,
        temperature: data.temperature,
        maxIterations: data.maxIterations,
        stream: data.stream,
        eventBus: rt.eventBus as unknown as ConstructorParameters<typeof ReActAgent>[0]['eventBus'],
        observability: rt.observability,
      });
      const t0 = performance.now();
      const result = await agent.run(data.input, { sessionId: data.sessionId });
      res.json({
        output: result.output,
        finishReason: result.finishReason,
        iterations: result.iterations,
        totalTokens: result.totalTokens,
        steps: result.steps.length,
        durationMs: Math.round(performance.now() - t0),
      });
    } catch (err) {
      const stack = (err as Error).stack;
      process.stderr.write(`[react] error: ${(err as Error).message}\n${stack}\n`);
      res.status(500).json({ error: 'react_run_failed', message: (err as Error).message });
    }
  });

  router.post('/crew', async (req: Request, res: Response) => {
    const parsed = CrewRunSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid_request', issues: parsed.error.issues });
      return;
    }
    const rt = getRuntime();
    const data = parsed.data;
    if (!deps.tools.has('noop')) {
      deps.tools.register({
        name: 'noop',
        description: 'Do nothing and return success. Useful as a placeholder tool for ReAct trajectories.',
        inputSchema: {
          type: 'object',
          properties: { reason: { type: 'string', description: 'Why this tool was called (free-form).' } },
          additionalProperties: false,
        },
        handler: async (args) => ({ success: true, output: `noop: ${String((args as { reason?: string }).reason ?? '')}` }),
      });
    }
    const crew = new Crew(deps.llm, deps.tools, {
      eventBus: rt.eventBus as unknown as ConstructorParameters<typeof Crew>[1] extends infer O ? O extends { eventBus?: infer B } ? B : never : never,
      observability: rt.observability,
    });
    const defs: AgentDefinition[] = data.agents.map((a) => ({
      name: a.name,
      role: a.role,
      goal: a.goal,
      backstory: a.backstory,
      tools: a.toolNames,
      model: a.model,
      temperature: a.temperature,
      maxIterations: a.maxIterations,
      systemPrompt: a.systemPrompt,
    }));
    for (const d of defs) crew.add(d);
    try {
      const t0 = performance.now();
      const result = await crew.run(
        {
          agents: defs,
          process: data.process as CrewProcess,
          shareContext: data.shareContext,
          maxParallel: data.maxParallel,
        },
        data.input,
      );
      res.json({
        process: result.process,
        finalOutput: result.finalOutput,
        totalTokens: result.totalTokens,
        perAgent: result.perAgent.map((r) => ({
          name: r.agentName,
          output: r.output,
          tokens: r.tokens.totalTokens,
          finishReason: r.finishReason,
        })),
        durationMs: Math.round(performance.now() - t0),
      });
    } catch (err) {
      res.status(500).json({ error: 'crew_run_failed', message: (err as Error).message });
    }
  });

  router.post('/graph', async (req: Request, res: Response) => {
    const parsed = GraphRunSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid_request', issues: parsed.error.issues });
      return;
    }
    const data = parsed.data;
    const graph = new Graph();
    for (const n of data.nodes) {
      const fn = makeNodeFn(n.kind, n.prefix);
      graph.addNode(n.id, fn as unknown as NodeFn);
    }
    if (data.nodes.length > 0) {
      graph.addEdge(START, data.entry ?? data.nodes[0]!.id);
    }
    for (const e of data.edges) {
      const target = e.end ? END : e.to;
      graph.addEdge(e.from, target);
    }
    const compiled = graph.compile({ maxSteps: data.maxSteps, entry: data.entry });
    try {
      const t0 = performance.now();
      const finalState = await compiled.run(data.initialState as GraphState);
      res.json({
        finalState,
        durationMs: Math.round(performance.now() - t0),
      });
    } catch (err) {
      res.status(500).json({ error: 'graph_run_failed', message: (err as Error).message });
    }
  });

  return router;
}

function makeNodeFn(kind: 'echo' | 'uppercase' | 'append-tokens' | 'noop', prefix?: string): NodeFn {
  return (state) => {
    switch (kind) {
      case 'uppercase':
        return { text: String((state as { text?: string }).text ?? '').toUpperCase() };
      case 'append-tokens':
        return { tokens: ((state as { tokens?: string[] }).tokens ?? []).concat([`${prefix ?? 'tok'}:${Date.now()}`]) };
      case 'noop':
        return {};
      case 'echo':
      default:
        return { echo: (state as { echo?: unknown }).echo ?? state };
    }
  };
}
