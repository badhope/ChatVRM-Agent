import type { ChatChunk, ChatMessage, LLMProvider } from "./types";
import { parseSSE } from "./openaiCompatible";

/**
 * Anthropic Messages API client.
 *
 * Anthropic's protocol is similar to OpenAI's chat completions but
 * not identical: the system prompt is a top-level parameter, the auth
 * header is `x-api-key` (not `Authorization: Bearer …`), and the
 * streamed SSE events carry `content_block_delta` chunks.
 */
export async function streamAnthropic(opts: {
  provider: LLMProvider;
  model: string;
  baseURL: string;
  apiKey: string;
  messages: ChatMessage[];
  maxTokens?: number;
  signal?: AbortSignal;
  onChunk: (chunk: ChatChunk) => void;
}): Promise<void> {
  const {
    provider,
    model,
    baseURL,
    apiKey,
    messages,
    maxTokens = 1024,
    signal,
    onChunk,
  } = opts;

  // Split out the system message; everything else becomes a turn.
  const systemParts: string[] = [];
  const turns: { role: "user" | "assistant"; content: string }[] = [];
  for (const m of messages) {
    if (m.role === "system") systemParts.push(m.content);
    else if (m.role === "user" || m.role === "assistant") {
      turns.push({ role: m.role, content: m.content });
    }
  }
  if (turns.length === 0) {
    onChunk({ type: "done", reason: "error", error: "No user/assistant messages" });
    return;
  }

  const url = joinURL(baseURL, "/v1/messages");
  const body: Record<string, unknown> = {
    model,
    messages: turns,
    max_tokens: maxTokens,
    stream: true,
  };
  if (systemParts.length > 0) body.system = systemParts.join("\n\n");
  if (provider.extraBody) Object.assign(body, provider.extraBody);

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "text/event-stream",
    "x-api-key": apiKey,
    "anthropic-version": "2023-06-01",
    "anthropic-dangerous-direct-browser-access": "true",
  };
  if (provider.extraHeaders) Object.assign(headers, provider.extraHeaders);

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok || !res.body) {
    const text = await safeReadErrorBody(res);
    onChunk({
      type: "done",
      reason: "error",
      error: `HTTP ${res.status} ${res.statusText}${text ? ` — ${text}` : ""}`,
    });
    return;
  }

  await parseSSE(res.body, (event) => {
    if (!event.data) return;
    let json: {
      type?: string;
      delta?: { type?: string; text?: string };
      error?: { message?: string };
    };
    try {
      json = JSON.parse(event.data);
    } catch {
      return;
    }
    if (json.type === "content_block_delta" && json.delta?.type === "text_delta") {
      const text = json.delta.text;
      if (text) onChunk({ type: "text", text });
    } else if (json.type === "message_stop") {
      onChunk({ type: "done", reason: "stop" });
    } else if (json.type === "error") {
      onChunk({
        type: "done",
        reason: "error",
        error: json.error?.message || "Anthropic stream error",
      });
    }
  });
}

function joinURL(base: string, path: string): string {
  if (!base) throw new Error("Base URL is required");
  const b = base.replace(/\/+$/, "");
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${b}${p}`;
}

async function safeReadErrorBody(res: Response): Promise<string> {
  try {
    const text = await res.text();
    if (!text) return "";
    try {
      const json = JSON.parse(text);
      return json.error?.message || json.message || text;
    } catch {
      return text.slice(0, 500);
    }
  } catch {
    return "";
  }
}
