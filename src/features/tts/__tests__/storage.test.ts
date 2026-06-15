// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from "vitest";
import { loadTTSSettings, saveTTSSettings } from "../storage";

describe("TTS storage", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("returns defaults when storage is empty", () => {
    const s = loadTTSSettings();
    expect(s.providerId).toBeTruthy();
    expect(s.voice).toBeTruthy();
    expect(s.apiKey).toBe("");
    expect(s.speed).toBe(1.0);
  });

  it("round-trips through saveTTSSettings → loadTTSSettings", () => {
    const input = {
      providerId: "openai-tts",
      voice: "alloy",
      model: "tts-1-hd",
      baseURL: "https://api.openai.com/v1",
      apiKey: "sk-test",
      speed: 1.25,
    };
    saveTTSSettings(input);
    const loaded = loadTTSSettings();
    expect(loaded).toEqual(input);
  });

  it("falls back to provider defaults for unknown providerId", () => {
    window.localStorage.setItem(
      "chatvrm:tts:v1",
      JSON.stringify({ providerId: "nope", voice: "", apiKey: "x" })
    );
    const s = loadTTSSettings();
    expect(s.providerId).toBeTruthy();
    expect(s.voice).toBeTruthy();
    expect(s.apiKey).toBe("x");
  });

  it("returns defaults when the stored JSON is malformed", () => {
    window.localStorage.setItem("chatvrm:tts:v1", "{not json");
    const s = loadTTSSettings();
    expect(s.providerId).toBeTruthy();
  });
});
