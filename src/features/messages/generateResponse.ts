import type { Message } from "@/features/messages/messages";
import type { LLMSettings, ChatChunk } from "@/features/llm/types";

export async function generateResponse(
  systemPrompt: string,
  messages: Message[],
  llmSettings: LLMSettings,
  onChunk: (text: string) => void,
  streamChat: (settings: LLMSettings, messages: Message[], onChunk: (chunk: ChatChunk) => void) => Promise<void>
): Promise<string> {
  const fullMessages: Message[] = [
    { role: "system", content: systemPrompt },
    ...messages,
  ];

  let fullText = "";
  await streamChat(llmSettings, fullMessages, (chunk) => {
    if (chunk.type === "text") {
      fullText += chunk.text;
      onChunk(fullText);
    }
  });
  return fullText;
}