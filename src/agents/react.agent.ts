import { EventEmitter } from 'eventemitter3';
import type { ILLMPort, LLMToolSpec, Message, ToolCall, ToolChoice } from '../ports/llm.port.js';
import type { IToolsPort, ToolResult } from '../ports/tools.port.js';
import type { ProviderType } from '../ports/config.port.js';
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
  'react:start': { input: string; toolCount: number };
  'react:thought': { index: number; thought: string };
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
   */
  async run(input: string, systemPromptOverride?: string): Promise<ReActResult> {
    const llmTools = this.collectLLMTools();
    if (llmTools.length === 0) {
      throw new Error('ReActAgent.run: no tools with inputSchema registered');
    }
    const maxIter = this.cfg.maxIterations ?? DEFAULT_MAX_ITERATIONS;
    const sysPrompt = systemPromptOverride ?? this.cfg.systemPrompt ?? DEFAULT_REACT_SYSTEM_PROMPT;

    const messages: Message[] = [
      { role: 'system', content: sysPrompt },
      { role: 'user', content: input },
    ];
    const steps: ReActStep[] = [];
    let totalTokens = 0;
    let finishReason: ReActResult['finishReason'] = 'max-iterations';

    this.bus.emit('react:start', { input, toolCount: llmTools.length });

    for (let i = 0; i < maxIter; i += 1) {
      if (this.cfg.signal?.aborted) {
        finishReason = 'aborted';
        break;
      }

      const iterStart = performance.now();
      let response;
      try {
        const toolChoice: ToolChoice = this.cfg.forceTool ? { name: this.cfg.forceTool.name } : 'auto';
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
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        this.bus.emit('react:error', { error, index: i });
        const partial: ReActResult = {
          output: steps.length > 0 ? steps[steps.length - 1]!.thought || '' : '',
          steps,
          iterations: i,
          totalTokens,
          finishReason: 'error',
        };
        this.bus.emit('react:done', { result: partial });
        return partial;
      }

      totalTokens += response.usage.totalTokens;
      const thought = response.content ?? '';

      if (!response.toolCalls || response.toolCalls.length === 0) {
        // Final answer.
        this.bus.emit('react:final', { index: i, content: thought });
        const step: ReActStep = {
          index: i,
          thought,
          actions: [],
          tokens: response.usage,
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
        let result: ToolResult;
        try {
          result = await this.cfg.tools.execute(call.name, call.arguments);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          result = { success: false, error: `Tool execution threw: ${message}` };
        }
        const callDuration = Math.round(performance.now() - callStart);
        const observation = result.success ? result.output ?? '' : `Error: ${result.error ?? 'unknown'}`;

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
    this.bus.emit('react:done', { result });
    return result;
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
 */
export function attachInputSchema<T extends { name: string; description: string }>(
  tool: T,
  schema: unknown,
): T & { inputSchema: unknown } {
  return { ...tool, inputSchema: schema };
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
