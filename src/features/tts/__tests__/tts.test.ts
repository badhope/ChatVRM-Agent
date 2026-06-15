import { describe, it, expect } from "vitest";
import { synthesizeSpeech } from "../tts";
import { findTTSProvider } from "../providers";
import type { TTSSettings } from "../types";

describe("synthesizeSpeech routing", () => {
  it("throws when the provider needs a baseURL and none is set", async () => {
    const provider = findTTSProvider("custom");
    const settings: TTSSettings = {
      providerId: provider.id,
      voice: provider.defaultVoice,
      baseURL: "",
      apiKey: "",
    };
    await expect(
      synthesizeSpeech(settings, { text: "hi", voice: "default" })
    ).rejects.toThrow(/Base URL/i);
  });

  it("rejects OpenAI TTS without an API key", async () => {
    const provider = findTTSProvider("openai-tts");
    const settings: TTSSettings = {
      providerId: provider.id,
      voice: provider.defaultVoice,
      baseURL: provider.baseURL,
      apiKey: "",
    };
    await expect(
      synthesizeSpeech(settings, { text: "hi", voice: "alloy" })
    ).rejects.toThrow(/API key/i);
  });

  it("rejects ElevenLabs without an API key", async () => {
    const provider = findTTSProvider("elevenlabs");
    const settings: TTSSettings = {
      providerId: provider.id,
      voice: provider.defaultVoice,
      baseURL: provider.baseURL,
      apiKey: "",
    };
    await expect(
      synthesizeSpeech(settings, { text: "hi", voice: provider.defaultVoice })
    ).rejects.toThrow(/API key/i);
  });
});
