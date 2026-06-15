import type { ChatChunk, ChatMessage, LLMProvider } from "./types";

/**
 * Stream a chat completion from an OpenAI-compatible provider.
 *
 * Most modern LLM providers expose the OpenAI `/v1/chat/completions`
 * endpoint verbatim. The only differences are cosmetic — baseURL,
 * model name, and (rarely) a couple of extra body fields — so one
 * client serves them all.
 *
 * The function is called from the browser with `apiKey` either
 * supplied by the user or read from `process.env.OPEN_AI_KEY` on the
 * server. The streaming response is parsed as Server-Sent Events and
 * text deltas are forwarded to `onChunk`.
 */
export async function streamOpenAICompatible(opts: {
  provider: LLMProvider;
  model: string;
  baseURL: string;
  apiKey: string;
  messages: ChatMessage[];
  signal?: AbortSignal;
  onChunk: (chunk: ChatChunk) => void;
}): Promise<void> {
  const { provider, model, baseURL, apiKey, messages, signal, onChunk } = opts;

  const url = joinURL(baseURL, "/chat/completions");
  const body: Record<string, unknown> = {
    model,
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
    stream: true,
  };
  if (provider.extraBody) {
    Object.assign(body, provider.extraBody);
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "text/event-stream",
  };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
  if (provider.extraHeaders) {
    Object.assign(headers, provider.extraHeaders);
  }

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
    if (!event.data || event.data === "[DONE]") {
      if (event.data === "[DONE]") {
        onChunk({ type: "done", reason: "stop" });
      }
      return;
    }
    try {
      const json = JSON.parse(event.data);
      const delta: string | undefined =
        json.choices?.[0]?.delta?.content ??
        json.choices?.[0]?.message?.content;
      if (delta) onChunk({ type: "text", text: delta });
    } catch {
      // Ignore malformed chunks.
    }
  });
}

// ─── helpers ───────────────────────────────────────────────────────────

/** A single parsed SSE event. */
type SSEEvent = { event?: string; data: string };

/**
 * Parse a ReadableStream as Server-Sent Events.
 *
 * We do the SSE parsing by hand (instead of using EventSource) because
 * we need POST + custom headers + the ability to cancel.
 */
export async function parseSSE(
  stream: ReadableStream<Uint8Array>,
  onEvent: (e: SSEEvent) => void
): Promise<void> {
  const reader = stream.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // SSE messages are separated by a blank line.
      const parts = buffer.split("\n\n");
      buffer = parts.pop() ?? "";

      for (const part of parts) {
        let dataLine = "";
        let eventName: string | undefined;
        for (const rawLine of part.split("\n")) {
          const line = rawLine.replace(/\r$/, "");
          if (line.startsWith(":")) continue; // comment
          const idx = line.indexOf(":");
          const field = idx === -1 ? line : line.slice(0, idx);
          const value = idx === -1 ? "" : line.slice(idx + 1).trimStart();
          if (field === "data") dataLine += (dataLine ? "\n" : "") + value;
          else if (field === "event") eventName = value;
        }
        if (dataLine.length > 0) {
          onEvent({ event: eventName, data: dataLine });
        }
      }
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // Ignore.
    }
  }
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
    // Try to surface a useful error message from the JSON.
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
