import { describe, it, expect } from "vitest";
import { TTS_PROVIDERS, findTTSProvider } from "../providers";

describe("findTTSProvider", () => {
  it("returns the first provider for undefined", () => {
    expect(findTTSProvider(undefined).id).toBe(TTS_PROVIDERS[0].id);
  });

  it("returns the first provider for an unknown id", () => {
    expect(findTTSProvider("nope").id).toBe(TTS_PROVIDERS[0].id);
  });

  it("returns the requested provider for a known id", () => {
    expect(findTTSProvider("openai-tts").id).toBe("openai-tts");
    expect(findTTSProvider("elevenlabs").id).toBe("elevenlabs");
    expect(findTTSProvider("edge").id).toBe("edge");
  });
});

describe("TTS_PROVIDERS", () => {
  it("has unique ids", () => {
    const ids = TTS_PROVIDERS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every provider has at least one voice", () => {
    for (const p of TTS_PROVIDERS) {
      expect(p.voices.length, `provider ${p.id}`).toBeGreaterThan(0);
      expect(p.defaultVoice, `provider ${p.id} defaultVoice`).toBeTruthy();
    }
  });
});
