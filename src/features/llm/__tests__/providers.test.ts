import { describe, it, expect } from "vitest";
import { LLM_PROVIDERS, findProvider } from "../providers";

describe("findProvider", () => {
  it("returns OpenAI for undefined", () => {
    expect(findProvider(undefined).id).toBe("openai");
  });

  it("returns OpenAI for an unknown id", () => {
    expect(findProvider("nope").id).toBe("openai");
  });

  it("returns the requested provider for a known id", () => {
    expect(findProvider("anthropic").id).toBe("anthropic");
    expect(findProvider("deepseek").id).toBe("deepseek");
  });
});

describe("LLM_PROVIDERS", () => {
  it("has unique ids", () => {
    const ids = LLM_PROVIDERS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every provider has a non-empty baseURL or customBaseURL", () => {
    for (const p of LLM_PROVIDERS) {
      const ok = p.baseURL || p.customBaseURL;
      expect(ok, `provider ${p.id} has no baseURL`).toBeTruthy();
    }
  });

  it("every provider has a defaultModel", () => {
    for (const p of LLM_PROVIDERS) {
      // Azure and Custom require user input for model name.
      if (p.id === "azure" || p.id === "custom") continue;
      expect(p.defaultModel, `provider ${p.id}`).toBeTruthy();
    }
  });
});
