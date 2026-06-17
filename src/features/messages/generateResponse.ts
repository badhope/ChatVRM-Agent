import type { Message } from "@/features/messages/messages";
import type { LLMSettings, ChatChunk } from "@/features/llm/types";

export async function generateResponse(
  systemPrompt: string,
  messages: Message[],
  llmSettings: LLMSettings,
  onChunk: (text: string) => void,
  streamChat: (
    settings: LLMSettings,
    messages: Message[],
    onChunk: (chunk: ChatChunk) => void,
    signal?: AbortSignal
  ) => Promise<void>,
  signal?: AbortSignal
): Promise<string> {
  const fullMessages: Message[] = [
    { role: "system", content: systemPrompt },
    ...messages,
  ];

  let fullText = "";
  let lastError: string | undefined;
  await streamChat(llmSettings, fullMessages, (chunk) => {
    if (chunk.type === "text") {
      fullText += chunk.text;
      onChunk(fullText);
    } else if (chunk.type === "done" && chunk.reason === "error") {
      lastError = chunk.error;
    }
  }, signal);
  if (signal?.aborted) {
    throw new DOMException("Aborted", "AbortError");
  }
  if (lastError) {
    // Surface the upstream error to the caller. The page-level
    // handler reads the rejected message and renders it inside the
    // assistant bubble so the user can see what went wrong.
    throw new Error(lastError);
  }
  return fullText;
}