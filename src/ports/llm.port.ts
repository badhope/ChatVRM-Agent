import type { ProviderType } from './config.port.js';

/**
 * A tool / function the LLM may call. `parameters` is a JSON Schema object
 * (draft-07 subset, what OpenAI / Anthropic / Gemini all accept).
 *
 * Use {@link zodToJsonSchema} from `src/agents/zod-schema.ts` if you want
 * to author tools with zod and have the conversion handled for you.
 */
export interface LLMToolSpec {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export type ToolChoice = 'auto' | 'required' | 'none' | { name: string };

/**
 * A single function call the model decided to invoke. The id is provider-
 * assigned (OpenAI: `call_xxx`, Anthropic: `toolu_xxx`, Gemini: opaque).
 * `arguments` is the parsed JSON object the model produced.
 */
export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export type MessageRole = 'system' | 'user' | 'assistant' | 'tool';

export interface Message {
  role: MessageRole;
  /** Text content. For assistant messages with tool calls this is the
   *  model's chain-of-thought / partial text. For tool messages this is
   *  the tool's stringified output. */
  content: string;
  /** Set on assistant messages when the model emits tool calls. */
  toolCalls?: ToolCall[];
  /** Set on tool messages: the id of the assistant call this answers. */
  toolCallId?: string;
  /** Set on tool messages: the function name (for Anthropic / debugging). */
  name?: string;
}

export interface ChatParams {
  messages: Message[];
  model?: string;
  provider?: ProviderType;
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
  /** Native function-calling tools. */
  tools?: LLMToolSpec[];
  /** `auto` lets the model decide; `required` forces a call; `none`
   *  suppresses calling even if tools are present. */
  toolChoice?: ToolChoice;
  /** Parallel tool calls. Defaults to true on OpenAI, false on others. */
  parallelToolCalls?: boolean;
}

export interface ChatResponse {
  content: string;
  model: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  /** Present when the model invoked one or more tools. */
  toolCalls?: ToolCall[];
  /** Raw finish_reason: `stop` | `tool_calls` | `length` | `content_filter` | ... */
  finishReason?: string;
}

export interface StreamChunk {
  content: string;
  done: boolean;
  /** Partial tool call deltas. The ReAct loop accumulates them. */
  toolCallDelta?: Partial<ToolCall> & { index: number };
}

export interface ILLMPort {
  chat(params: ChatParams): Promise<ChatResponse>;
  stream(params: ChatParams): AsyncGenerator<StreamChunk>;
  listModels(provider: ProviderType): Promise<string[]>;
  isAvailable(provider: ProviderType): Promise<boolean>;
}
