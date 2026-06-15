/**
 * LLM provider abstraction types.
 *
 * Every chat provider — whether OpenAI, DeepSeek, Anthropic, Ollama,
 * or a self-hosted vLLM — is described by an LLMProvider object. The
 * actual network call is performed by one of the clients in
 * `openaiCompatible.ts` or `anthropicClient.ts`, selected by
 * `provider.protocol`.
 */

/** Wire protocol used by the provider. */
export type LLMProtocol = "openai" | "anthropic";

/** A single chat message in the conversation history. */
export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

/** A pre-defined model entry, advertised in the settings UI. */
export type LLMModelInfo = {
  /** Provider-recognised model id (sent verbatim in the request). */
  id: string;
  /** Human-readable label shown in the settings dropdown. */
  label: string;
  /** True if the model accepts image inputs. */
  vision?: boolean;
  /** Optional free-form hint shown next to the model in the UI. */
  hint?: string;
};

/**
 * A single LLM provider. The id, baseURL, and protocol drive both the
 * network call and the settings UI; `apiKey` is the user-supplied key
 * (or the literal string "ollama" for the local Ollama server).
 */
export type LLMProvider = {
  /** Stable identifier persisted in localStorage. */
  id: string;
  /** Human-readable name shown in the UI. */
  name: string;
  /** Wire protocol. */
  protocol: LLMProtocol;
  /** API root used to build the request URL. */
  baseURL: string;
  /** Default model id. */
  defaultModel: string;
  /** Models surfaced in the settings dropdown. */
  models: LLMModelInfo[];
  /**
   * If true, the baseURL and model are user-editable in the settings.
   * Custom providers set this; preset providers may also let users
   * override the URL to point at a proxy.
   */
  customBaseURL?: boolean;
  /** Hint shown to the user about how to obtain an API key. */
  apiKeyHint?: string;
  /** URL of the provider's API-key signup page. */
  docsURL: string;
  /** Free-form notes shown under the provider dropdown. */
  notes?: string;
  /**
   * Optional extra headers to send with every request.
   * Some gateways (OpenRouter) require an HTTP-Referer header.
   */
  extraHeaders?: Record<string, string>;
  /**
   * Optional fixed request body fields merged into every chat request.
   * Used to enable provider-specific features like Qwen's
   * `enable_search`.
   */
  extraBody?: Record<string, unknown>;
  /** Region tag for documentation grouping; not used at runtime. */
  region?: "global" | "china" | "local";
};

/** A chunk emitted by the streaming chat client. */
export type ChatChunk =
  | { type: "text"; text: string }
  | { type: "done"; reason: "stop" | "length" | "error"; error?: string };

/** User-selected LLM configuration, persisted in localStorage. */
export type LLMSettings = {
  providerId: string;
  model: string;
  baseURL: string;
  apiKey: string;
};
