import { Message } from "../messages/messages";
import { streamChat } from "../llm/llmChat";
import type { LLMSettings } from "../llm/types";

/**
 * Legacy streaming entry point, retained for backward compatibility.
 *
 * The new code paths should call `streamChat` from
 * `features/llm/llmChat.ts` directly. This shim exists so existing
 * imports keep working and to provide a stable call signature for
 * the public `/api/chat` route.
 *
 * Returns a `ReadableStream<string>` that yields text deltas, exactly
 * like the old implementation.
 */
export async function getChatResponseStream(
  messages: Message[],
  apiKey: string,
  settings?: Partial<LLMSettings>
): Promise<ReadableStream<string>> {
  const effectiveSettings: LLMSettings = {
    providerId: settings?.providerId ?? "openai",
    model: settings?.model ?? "gpt-4o-mini",
    baseURL: settings?.baseURL ?? "https://api.openai.com/v1",
    apiKey: apiKey || settings?.apiKey || "",
  };

  return new ReadableStream<string>({
    async start(controller) {
      const enqueue = (text: string) => {
        if (text) controller.enqueue(text);
      };
      const close = () => {
        try {
          controller.close();
        } catch {
          // Already closed.
        }
      };

      try {
        await streamChat(
          effectiveSettings,
          messages.map((m) => ({ role: m.role, content: m.content })),
          (chunk) => {
            if (chunk.type === "text") enqueue(chunk.text);
            else if (chunk.type === "done") {
              if (chunk.reason === "error" && chunk.error) {
                controller.error(new Error(chunk.error));
              } else {
                close();
              }
            }
          }
        );
      } catch (err) {
        controller.error(err);
      }
    },
  });
}
