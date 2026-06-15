import type { ChatChunk, ChatMessage, LLMSettings } from "./types";
import { findProvider } from "./providers";
import { streamOpenAICompatible } from "./openaiCompatible";
import { streamAnthropic } from "./anthropicClient";

/**
 * Unified chat streaming entry point.
 *
 * Selects the right client based on the provider's protocol and
 * forwards text deltas to the caller. Throws synchronously only on
 * configuration errors (missing API key, missing baseURL); runtime
 * network errors are reported through the `done` chunk with
 * `reason: "error"`.
 */
export async function streamChat(
  settings: LLMSettings,
  messages: ChatMessage[],
  onChunk: (chunk: ChatChunk) => void,
  signal?: AbortSignal
): Promise<void> {
  const provider = findProvider(settings.providerId);
  const apiKey = settings.apiKey?.trim();

  if (!apiKey) {
    onChunk({
      type: "done",
      reason: "error",
      error: "API key is empty. Set it in the settings panel.",
    });
    return;
  }

  // Resolve baseURL: prefer the user override, then the provider
  // default, then throw if the provider requires a custom URL.
  let baseURL = settings.baseURL?.trim() || provider.baseURL;
  if (!baseURL) {
    onChunk({
      type: "done",
      reason: "error",
      error:
        "Base URL is required for this provider. Please configure it in settings.",
    });
    return;
  }
  // Some providers store the deployment/model in the baseURL path
  // (e.g. Azure). Don't touch the URL in that case.
  if (!/\/v1\/?$/.test(baseURL) && !baseURL.includes("/openai/")) {
    // Most OpenAI-compatible providers expect /v1 to be present.
    // The provider's own baseURL should already include it; if the
    // user overrode with a domain-only URL, append /v1.
    if (!baseURL.includes("/v1")) baseURL = baseURL.replace(/\/+$/, "") + "/v1";
  }

  const model = settings.model?.trim() || provider.defaultModel;
  if (!model) {
    onChunk({
      type: "done",
      reason: "error",
      error: "Model is required. Please select or enter a model id in settings.",
    });
    return;
  }

  if (provider.protocol === "anthropic") {
    await streamAnthropic({
      provider,
      model,
      baseURL,
      apiKey,
      messages,
      signal,
      onChunk,
    });
  } else {
    await streamOpenAICompatible({
      provider,
      model,
      baseURL,
      apiKey,
      messages,
      signal,
      onChunk,
    });
  }
}
