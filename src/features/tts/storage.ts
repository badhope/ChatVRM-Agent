import type { TTSSettings } from "./types";
import { findTTSProvider } from "./providers";

const STORAGE_KEY = "chatvrm:tts:v1";

/**
 * Load the user's TTS settings from localStorage. Returns sensible
 * defaults when nothing is stored or the storage is corrupted.
 */
export function loadTTSSettings(): TTSSettings {
  if (typeof window === "undefined") {
    return defaultSettings();
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultSettings();
    const parsed = JSON.parse(raw) as Partial<TTSSettings>;
    const provider = findTTSProvider(parsed.providerId);
    return {
      providerId: provider.id,
      voice: parsed.voice || provider.defaultVoice,
      model: parsed.model,
      baseURL: parsed.baseURL || provider.baseURL,
      apiKey: parsed.apiKey || "",
      speed: typeof parsed.speed === "number" ? parsed.speed : 1.0,
    };
  } catch {
    return defaultSettings();
  }
}

export function saveTTSSettings(settings: TTSSettings): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Quota exceeded or private mode — silently ignore.
  }
}

function defaultSettings(): TTSSettings {
  const p = findTTSProvider(undefined);
  return {
    providerId: p.id,
    voice: p.defaultVoice,
    baseURL: p.baseURL,
    apiKey: "",
    speed: 1.0,
  };
}
