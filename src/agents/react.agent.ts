import { EventEmitter } from 'eventemitter3';
import type { ILLMPort, LLMToolSpec, Message, StreamChunk, ToolCall, ToolChoice } from '../ports/llm.port.js';
import type { IToolsPort, ToolResult } from '../ports/tools.port.js';
import type { ProviderType } from '../ports/config.port.js';
import type { IObservability } from '../ports/observability.port.js';
import type { ISessionStore, SessionMessage } from '../ports/session-store.port.js';
import { zodToJsonSchema } from './zod-schema.js';

/**
 * A single ReAct iteration's record. Surfaced both as the `steps` field
 * of the final result and as `react:step` events for SSE consumers.
 */
export interface ReActStep {
  index: number;
  /** The model's free-text reasoning ("Thought: ...") before tool calls. */
  thought: string;
  /** Tool calls the model decided to make this iteration. Empty means "done". */
  actions: Array<{ call: ToolCall; observation: string; ok: boolean; durationMs: number }>;
  /** Tokens consumed in this iteration. */
  tokens: { promptTokens: number; completionTokens: number; totalTokens: number };
  /** Wall-clock duration of the iteration. */
  durationMs: number;
}

export interface ReActResult {
  output: string;
  steps: ReActStep[];
  iterations: number;
  totalTokens: number;
  /** When the loop terminated — one of: 'final-answer', 'max-iterations', 'aborted', 'error'. */
  finishReason: 'final-answer' | 'max-iterations' | 'aborted' | 'error';
}

export interface ReActEvents {
  'react:start': { input: string; toolCount: number; sessionId?: string };
  'react:thought': { index: number; thought: string };
  'react:token': { index: number; token: string };
  'react:action': { index: number; call: ToolCall };
  'react:observation': { index: number; name: string; ok: boolean; observation: string; durationMs: number };
  'react:final': { index: number; content: string };
  'react:done': { result: ReActResult };
  'react:error': { error: Error; index: number };
}

export interface ReActConfig {
  llm: ILLMPort;
  tools: IToolsPort;
  provider?: ProviderType;
  model?: string;
  temperature?: number;
  maxIterations?: number;
  /** If true, the agent may emit parallel tool calls in one turn. */
  allowParallel?: boolean;
  /** Inject before the user's request to nudge reasoning style. */
  systemPrompt?: string;
  /** Force a specific tool on the next turn. Set after a reflection. */
  forceTool?: { name: string; reason: string };
  eventBus?: EventEmitter<ReActEvents>;
  signal?: AbortSignal;
  /**
   * Observability backend. When supplied, the agent wraps the entire
   * run in a top-level trace and emits a span per LLM call and per
   * tool execution. Defaults to a no-op so the agent is still cheap
   * to instantiate.
   */
  observability?: IObservability;
  /**
   * Optional session store. When supplied *and* `sessionId` is passed
   * to `run()`, the agent loads prior turns as `Message[]` and
   * appends the new turn at the end. Persists the full exchange
   * (input, steps, output) once the run completes.
   */
  sessionStore?: ISessionStore;
  /** Use streaming chat when supported. Tokens are emitted on the
   *  `react:token` event. Default false (callers opt in). */
  stream?: boolean;
}

export const DEFAULT_REACT_SYSTEM_PROMPT = `You are a capable agent that solves problems by reasoning step-by-step and calling tools.

For each turn:
1. Reason about what you know so far and what you still need.
2. Decide whether to call a tool or give a final answer.
3. If you need information you don't have, call a tool.
4. When you have enough information, give a concise final answer with no further tool calls.

Rules:
- Always call a tool if it can answer the question — never guess file contents, command output, or external facts.
- Tool arguments must match the declared JSON schema exactly.
- If a tool returns an error, try a different argument shape or a different tool. Do not repeat the same failing call.
- When you have the answer, respond with the answer only — no meta-commentary.`;

const DEFAULT_MAX_ITERATIONS = 8;

/**
 * ReAct (Reason + Act) agent.
 *
 * Loop: prompt LLM with tools -> if it returns tool_calls, run them and
 * append observations -> loop. If the LLM returns no tool_calls, treat
 * the content as the final answer.
 *
 * Uses the LLM provider's *native* function-calling protocol (OpenAI
 * tools / Anthropic tool_use / Google functionDeclarations / Baidu
 * function_call) instead of parsing free-form text. The provider is
 * chosen from the supplied config or the LLM port's default.
 */
export class ReActAgent {
  private cfg: ReActConfig;
  private bus: EventEmitter<ReActEvents>;

  constructor(cfg: ReActConfig) {
    this.cfg = cfg;
    this.bus = cfg.eventBus ?? new EventEmitter<ReActEvents>();
  }

  get events(): EventEmitter<ReActEvents> {
    return this.bus;
  }

  /**
   * Run a single ReAct trajectory. Returns the final answer, the
   * captured steps (for replay/inspection), and a finish reason.
   *
   * When `sessionId` is passed and `cfg.sessionStore` is set, the
   * agent loads prior conversation turns and persists the new
   * exchange at the end of the run.
   */
  async run(input: string, opts: { systemPromptOverride?: string; sessionId?: string } = {}): Promise<ReActResult> {
    const llmTools = this.collectLLMTools();
    if (llmTools.length === 0) {
      throw new Error('ReActAgent.run: no tools with inputSchema registered');
    }
    const maxIter = this.cfg.maxIterations ?? DEFAULT_MAX_ITERATIONS;
    const sysPrompt = opts.systemPromptOverride ?? this.cfg.systemPrompt ?? DEFAULT_REACT_SYSTEM_PROMPT;
    const sessionId = opts.sessionId;

    // Load history from session store, if any.
    const priorMessages = sessionId && this.cfg.sessionStore
      ? await this.loadSessionMessages(sessionId, sysPrompt)
      : [{ role: 'system' as const, content: sysPrompt }];

    const messages: Message[] = [
      ...priorMessages,
      { role: 'user', content: input },
    ];
    const steps: ReActStep[] = [];
    let totalTokens = 0;
    let finishReason: ReActResult['finishReason'] = 'max-iterations';

    // Observability: open a top-level trace for the run.
    const trace = this.cfg.observability
      ? await this.cfg.observability.trace('react.run', {
          input: { input, sessionId, toolCount: llmTools.length },
        })
      : null;

    this.bus.emit('react:start', { input, toolCount: llmTools.length, sessionId });

    for (let i = 0; i < maxIter; i += 1) {
      if (this.cfg.signal?.aborted) {
        finishReason = 'aborted';
        break;
      }

      const iterStart = performance.now();
      let response;
      const llmSpan = trace ? await trace.generation(`llm.iter.${i}`, {
        model: this.cfg.model,
        input: { messages: messages.length, tools: llmTools.length },
      }) : null;
      try {
        const toolChoice: ToolChoice = this.cfg.forceTool ? { name: this.cfg.forceTool.name } : 'auto';
        if (this.cfg.stream) {
          // Stream-collect into a final ChatResponse. This still returns
          // the full answer; the side-effect is `react:token` events.
          response = await this.streamingChat({
            provider: this.cfg.provider,
            model: this.cfg.model,
            messages,
            tools: llmTools,
            toolChoice,
            temperature: this.cfg.temperature ?? 0,
            parallelToolCalls: this.cfg.allowParallel ?? false,
            signal: this.cfg.signal,
          }, i);
        } else {
          response = await this.cfg.llm.chat({
            provider: this.cfg.provider,
            model: this.cfg.model,
            messages,
            tools: llmTools,
            toolChoice,
            temperature: this.cfg.temperature ?? 0,
            parallelToolCalls: this.cfg.allowParallel ?? false,
            signal: this.cfg.signal,
          });
        }
        if (llmSpan) {
          await llmSpan.setMetadata('usage', response.usage ?? null);
          await llmSpan.setOutput({ content: response.content, toolCalls: response.toolCalls });
          await llmSpan.end();
        }
      } catch (err) {
        if (llmSpan) {
          await llmSpan.end({ statusMessage: 'error' });
        }
        const error = err instanceof Error ? err : new Error(String(err));
        this.bus.emit('react:error', { error, index: i });
        const partial: ReActResult = {
          output: steps.length > 0 ? steps[steps.length - 1]!.thought || '' : '',
          steps,
          iterations: i,
          totalTokens,
          finishReason: 'error',
        };
        await this.persistSession(sessionId, { input, result: partial, messages: messages.slice(1) });
        this.bus.emit('react:done', { result: partial });
        if (trace) await trace.end({ output: { error: error.message } });
        return partial;
      }

      // Defensive default — some providers (notably self-hosted ones
      // via the OpenAI-compatible path) occasionally omit `usage` on
      // success responses. Treat missing as zeros rather than throwing.
      const stepUsage = response.usage ?? { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
      totalTokens += stepUsage.totalTokens;
      const thought = response.content ?? '';

      if (!response.toolCalls || response.toolCalls.length === 0) {
        // Final answer.
        this.bus.emit('react:final', { index: i, content: thought });
        const step: ReActStep = {
          index: i,
          thought,
          actions: [],
          tokens: stepUsage,
          durationMs: Math.round(performance.now() - iterStart),
        };
        steps.push(step);
        finishReason = 'final-answer';
        break;
      }

      this.bus.emit('react:thought', { index: i, thought });

      // Push the assistant message (with tool_calls) for the model to see
      // on the next iteration. This is what OpenAI / Anthropic / Gemini
      // require to associate the tool results with the originating call.
      messages.push({
        role: 'assistant',
        content: thought,
        toolCalls: response.toolCalls,
      });

      const step: ReActStep = {
        index: i,
        thought,
        actions: [],
        tokens: response.usage,
        durationMs: 0,
      };

      for (const call of response.toolCalls) {
        this.bus.emit('react:action', { index: i, call });
        const callStart = performance.now();
        const toolSpan = trace ? await trace.span(`tool.${call.name}`, { input: call.arguments }) : null;
        let result: ToolResult;
        try {
          result = await this.cfg.tools.execute(call.name, call.arguments);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          result = { success: false, error: `Tool execution threw: ${message}` };
        }
        const callDuration = Math.round(performance.now() - callStart);
        const observation = result.success ? result.output ?? '' : `Error: ${result.error ?? 'unknown'}`;
        if (toolSpan) {
          await toolSpan.setMetadata('ok', result.success);
          await toolSpan.setMetadata('durationMs', callDuration);
          await toolSpan.setOutput({ output: observation.slice(0, 4000) });
          await toolSpan.end({ statusMessage: result.success ? 'default' : 'error' });
        }

        this.bus.emit('react:observation', {
          index: i,
          name: call.name,
          ok: result.success,
          observation,
          durationMs: callDuration,
        });

        step.actions.push({ call, observation, ok: result.success, durationMs: callDuration });

        messages.push({
          role: 'tool',
          toolCallId: call.id,
          name: call.name,
          content: truncate(observation, 8000),
        });
      }

      step.durationMs = Math.round(performance.now() - iterStart);
      steps.push(step);

      // forceTool is single-shot: clear after using it.
      if (this.cfg.forceTool) this.cfg.forceTool = undefined;
    }

    const result: ReActResult = {
      output: pickFinalOutput(steps),
      steps,
      iterations: steps.length,
      totalTokens,
      finishReason,
    };
    await this.persistSession(sessionId, { input, result, messages: messages.slice(1) });
    this.bus.emit('react:done', { result });
    if (trace) {
      await trace.setMetadata('finishReason', finishReason);
      await trace.setMetadata('iterations', result.iterations);
      await trace.setMetadata('totalTokens', result.totalTokens);
      await trace.end({ output: { output: result.output } });
    }
    return result;
  }

  /**
   * Run the LLM with streaming and accumulate the result into a
   * `ChatResponse`. Tokens are emitted on `react:token` for SSE
   * consumers. This is the same path the non-streaming branch takes
   * internally; it just gives the caller visibility into the
   * incremental content.
   */
  private async streamingChat(
    params: Parameters<ILLMPort['chat']>[0],
    iterIndex: number,
  ): Promise<Awaited<ReturnType<ILLMPort['chat']>>> {
    let content = '';
    let model = params.model ?? 'unknown';
    let usage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
    const toolCalls: ToolCall[] = [];
    let finishReason: string | undefined;
    const callAccumulator = new Map<number, { id: string; name: string; argsJson: string }>();
    for await (const chunk of this.cfg.llm.stream(params)) {
      if (chunk.content) {
        content += chunk.content;
        this.bus.emit('react:token', { index: iterIndex, token: chunk.content });
      }
      if (chunk.done) {
        // Most providers send the final usage + finishReason on the
        // terminal chunk; pull them off if present.
        const last = chunk as StreamChunk & { usage?: typeof usage; finishReason?: string; model?: string };
        if (last.usage) usage = last.usage;
        if (last.finishReason) finishReason = last.finishReason;
        if (last.model) model = last.model;
      }
      if (chunk.toolCallDelta) {
        const d = chunk.toolCallDelta;
        const cur = callAccumulator.get(d.index) ?? { id: '', name: '', argsJson: '' };
        if (d.id) cur.id = d.id;
        if (d.name) cur.name = d.name;
        if (typeof d.arguments !== 'undefined' && d.arguments !== null) {
          // OpenAI and most providers send a *string fragment* of JSON
          // (e.g. '{"city":'), not an object — concatenate as-is. If a
          // provider already hands us a fully-materialised object, fall
          // back to a stable JSON serialisation (no stringly slice).
          if (typeof d.arguments === 'string') {
            cur.argsJson += d.arguments;
          } else {
            cur.argsJson += JSON.stringify(d.arguments);
          }
        }
        callAccumulator.set(d.index, cur);
      }
    }
    for (const [, cur] of [...callAccumulator.entries()].sort(([a], [b]) => a - b)) {
      let args: Record<string, unknown> = {};
      try {
        args = cur.argsJson.trim() ? JSON.parse(cur.argsJson) : {};
      } catch {
        args = {};
      }
      toolCalls.push({ id: cur.id, name: cur.name, arguments: args });
    }
    return {
      content,
      model,
      usage,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      finishReason,
    };
  }

  /** Convert stored session messages into the LLM `Message[]` shape,
   *  prepending a system prompt that wasn't already there. */
  private async loadSessionMessages(sessionId: string, sysPrompt: string): Promise<Message[]> {
    if (!this.cfg.sessionStore) return [{ role: 'system', content: sysPrompt }];
    const session = await this.cfg.sessionStore.get(sessionId);
    if (!session) {
      return [{ role: 'system', content: sysPrompt }];
    }
    const out: Message[] = [{ role: 'system', content: sysPrompt }];
    for (const m of session.messages) {
      if (m.role === 'system' || m.role === 'user' || m.role === 'assistant' || m.role === 'tool') {
        out.push({
          role: m.role,
          content: m.content,
          toolCallId: m.toolCallId,
          name: m.name,
        });
      }
    }
    return out;
  }

  /** Persist the run's conversation to the session store (if configured). */
  private async persistSession(
    sessionId: string | undefined,
    payload: { input: string; result: ReActResult; messages: Message[] },
  ): Promise<void> {
    if (!sessionId || !this.cfg.sessionStore) return;
    try {
      const now = Date.now();
      const session = (await this.cfg.sessionStore.get(sessionId)) ?? {
        id: sessionId,
        metadata: {},
        messages: [] as SessionMessage[],
        createdAt: now,
        updatedAt: now,
      };
      const newMessages: SessionMessage[] = [];
      let msgId = 0;
      const nextId = () => `m${++msgId}-${now}`;
      // We replay `messages` (which already contains the new user turn
      // + assistant/tool messages); skip any leading system prompt.
      for (const m of payload.messages) {
        if (m.role === 'system') continue;
        newMessages.push({
          id: nextId(),
          role: m.role,
          content: m.content,
          toolCallId: m.toolCallId,
          name: m.name,
          createdAt: now,
        });
      }
      // Append a summary line as a final assistant message for easy
      // re-display.
      newMessages.push({
        id: nextId(),
        role: 'assistant',
        content: payload.result.output,
        createdAt: now,
      });
      session.messages = [...session.messages, ...newMessages];
      session.updatedAt = now;
      session.metadata = {
        ...(session.metadata ?? {}),
        lastFinishReason: payload.result.finishReason,
        lastIterations: payload.result.iterations,
        lastTotalTokens: payload.result.totalTokens,
      };
      await this.cfg.sessionStore.upsert(session);
    } catch (err) {
      // Persistence must never break the run.
      this.bus.emit('react:error', { error: err instanceof Error ? err : new Error(String(err)), index: -1 });
    }
  }

  /**
   * Build LLMToolSpec[] from the tools registry. Tools must declare
   * `inputSchema` (a zod schema or a JSON Schema object) on their
   * ToolDefinition to be eligible for native calling — see
   * {@link attachInputSchema}.
   */
  private collectLLMTools(): LLMToolSpec[] {
    const all = this.cfg.tools.listAll();
    const specs: LLMToolSpec[] = [];
    for (const t of all) {
      const def = t as unknown as { inputSchema?: unknown; description: string; name: string };
      if (!def.inputSchema) continue;
      // zod schemas have a `_def` field; JSON Schema objects do not.
      const isZod = def.inputSchema && typeof (def.inputSchema as { _def?: unknown })._def === 'object';
      const params = isZod
        ? zodToJsonSchema(def.inputSchema as never)
        : (def.inputSchema as Record<string, unknown>);
      specs.push({ name: t.name, description: t.description, parameters: params });
    }
    return specs;
  }
}

/**
 * Decorator: attach a zod/JSON-Schema to an existing tool definition so
 * the ReAct agent can pass it to the LLM as a native tool.
 *
 * If the input tool has no `handler`, a no-op default is added so the
 * result satisfies the `ToolDefinition` shape (useful when wrapping an
 * MCP server-side tool where the actual handler lives remotely).
 */
export function attachInputSchema<
  T extends { name: string; description: string; handler?: (args: Record<string, unknown>) => Promise<ToolResult | string> }
>(tool: T, schema: unknown): T & { inputSchema: unknown; handler: (args: Record<string, unknown>) => Promise<ToolResult | string> } {
  const handler = (tool.handler ??
    (async () => ({ success: true, output: '' })));
  return { ...tool, inputSchema: schema, handler };
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max) + `\n... [truncated ${s.length - max} chars]`;
}

function pickFinalOutput(steps: ReActStep[]): string {
  for (let i = steps.length - 1; i >= 0; i -= 1) {
    const step = steps[i]!;
    if (step.actions.length === 0 && step.thought) return step.thought;
  }
  // Fallback: concatenate observations from the last step.
  const last = steps[steps.length - 1];
  if (!last) return '';
  return last.actions.map((a) => a.observation).join('\n');
}
