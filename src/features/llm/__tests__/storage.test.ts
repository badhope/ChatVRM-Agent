// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from "vitest";
import { loadLLMSettings, saveLLMSettings } from "../storage";

describe("LLM storage", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("returns defaults when storage is empty", () => {
    const s = loadLLMSettings();
    expect(s.providerId).toBe("openai");
    expect(s.model).toBeTruthy();
    expect(s.baseURL).toBeTruthy();
    expect(s.apiKey).toBe("");
  });

  it("round-trips through saveLLMSettings → loadLLMSettings", () => {
    const input = {
      providerId: "deepseek",
      model: "deepseek-chat",
      baseURL: "https://api.deepseek.com/v1",
      apiKey: "sk-test",
    };
    saveLLMSettings(input);
    const loaded = loadLLMSettings();
    expect(loaded).toEqual(input);
  });

  it("falls back to OpenAI for unknown providerId", () => {
    window.localStorage.setItem(
      "chatvrm:llm:v1",
      JSON.stringify({ providerId: "nope", model: "x", apiKey: "k" })
    );
    const s = loadLLMSettings();
    expect(s.providerId).toBe("openai");
    expect(s.apiKey).toBe("k");
  });

  it("returns defaults when the stored JSON is malformed", () => {
    window.localStorage.setItem("chatvrm:llm:v1", "{not json");
    const s = loadLLMSettings();
    expect(s.providerId).toBe("openai");
  });
});
