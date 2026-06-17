import type { LLMSettings } from "./types";
import { LLM_PROVIDERS, findProvider } from "./providers";

const STORAGE_KEY = "chatvrm:llm:v1";

/**
 * Load the user's LLM settings from localStorage. Returns sensible
 * defaults when nothing is stored or the storage is corrupted.
 *
 * Provider-specific fields (baseURL, model) are seeded from the
 * provider definition so an upgrade to a new provider version can
 * silently migrate deprecated endpoints.
 */
export function loadLLMSettings(): LLMSettings {
  if (typeof window === "undefined") {
    return defaultSettings();
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultSettings();
    const parsed = JSON.parse(raw) as Partial<LLMSettings>;
    const provider = findProvider(parsed.providerId);
    return {
      providerId: provider.id,
      model: parsed.model || provider.defaultModel,
      baseURL: parsed.baseURL || provider.baseURL,
      apiKey: parsed.apiKey || "",
    };
  } catch {
    return defaultSettings();
  }
}

export function saveLLMSettings(settings: LLMSettings): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Quota exceeded or private mode — silently ignore.
  }
}

function defaultSettings(): LLMSettings {
  // Default to Aliyun Bailian (China-friendly, OpenAI-compatible).
  // User must supply their own API key.
  const dashscope = LLM_PROVIDERS.find((p) => p.id === "dashscope")!;
  return {
    providerId: dashscope.id,
    model: dashscope.defaultModel,
    baseURL: dashscope.baseURL,
    apiKey: "",
  };
}
