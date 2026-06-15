/**
 * Unified TTS entry point.
 *
 * Selects the right adapter based on the provider's protocol and
 * returns the encoded audio bytes. Throws synchronously only on
 * configuration errors (missing URL); runtime network errors are
 * thrown to the caller.
 */
import type { TTSRequest, TTSResult, TTSSettings } from "./types";
import { findTTSProvider } from "./providers";
import { synthesizeKoeiromap } from "./koeiromapAdapter";
import { synthesizeOpenAITTS } from "./openaiTtsAdapter";
import { synthesizeElevenLabs } from "./elevenlabsAdapter";
import { synthesizeEdge } from "./edgeAdapter";
import { synthesizeCustom } from "./customAdapter";

export async function synthesizeSpeech(
  settings: TTSSettings,
  req: TTSRequest
): Promise<TTSResult> {
  const provider = findTTSProvider(settings.providerId);
  const baseURL = settings.baseURL?.trim() || provider.baseURL;
  if (!baseURL && provider.protocol !== "edge") {
    throw new Error(
      `Provider "${provider.name}" requires a Base URL. Set it in the settings panel.`
    );
  }

  switch (provider.protocol) {
    case "koeiromap":
      return synthesizeKoeiromap(provider, settings, req);
    case "openai-tts":
      return synthesizeOpenAITTS(baseURL, settings, req);
    case "elevenlabs":
      return synthesizeElevenLabs(baseURL, settings, req);
    case "edge":
      return synthesizeEdge(baseURL, settings, req);
    case "custom":
      return synthesizeCustom(baseURL, settings, req);
    default: {
      const _exhaustive: never = provider.protocol;
      throw new Error(`Unknown TTS protocol: ${_exhaustive}`);
    }
  }
}
