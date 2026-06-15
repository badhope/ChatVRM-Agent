import type { TTSProvider } from "./types";

/**
 * Pre-defined TTS providers. The id is the persisted key — never
 * rename it. Add a new entry here to ship a new built-in provider;
 * the settings UI will pick it up automatically.
 */
export const TTS_PROVIDERS: TTSProvider[] = [
  // ─── Koeiromap (Koemotion, rinna) — original ChatVRM provider ─────
  {
    id: "koeiromap",
    name: "Koeiromap (Koemotion)",
    protocol: "koeiromap",
    baseURL: "https://api.rinna.co.jp",
    defaultVoice: "preset-A",
    voices: [
      { id: "preset-A", label: "Preset A — Cute", language: "ja", hint: "Default" },
      { id: "preset-B", label: "Preset B — Energetic", language: "ja" },
      { id: "preset-C", label: "Preset C — Cool", language: "ja" },
      { id: "preset-D", label: "Preset D — Mature", language: "ja" },
    ],
    apiKeyHint:
      "An API key is required for the paid endpoint; the free endpoint works without one but with reduced emotion control.",
    docsURL: "https://developers.rinna.co.jp/product/#product=koeiromap-free",
    notes:
      "Optimised for Japanese. Speaker X/Y are used as the voice position — the settings panel still exposes the X/Y sliders when this provider is selected.",
    region: "global",
  },

  // ─── OpenAI TTS ───────────────────────────────────────────────────
  {
    id: "openai-tts",
    name: "OpenAI TTS",
    protocol: "openai-tts",
    baseURL: "https://api.openai.com/v1",
    defaultVoice: "alloy",
    voices: [
      { id: "alloy", label: "Alloy", language: "en", hint: "Neutral" },
      { id: "echo", label: "Echo", language: "en" },
      { id: "fable", label: "Fable", language: "en" },
      { id: "onyx", label: "Onyx", language: "en" },
      { id: "nova", label: "Nova", language: "en" },
      { id: "shimmer", label: "Shimmer", language: "en" },
    ],
    apiKeyHint: "Get your key at platform.openai.com → API keys",
    docsURL: "https://platform.openai.com/docs/guides/text-to-speech",
    notes: "Reuses the LLM API key when that provider is OpenAI.",
    region: "global",
  },

  // ─── ElevenLabs ──────────────────────────────────────────────────
  {
    id: "elevenlabs",
    name: "ElevenLabs",
    protocol: "elevenlabs",
    baseURL: "https://api.elevenlabs.io/v1",
    defaultVoice: "21m00Tcm4TlvDq8ikWAM",
    voices: [
      {
        id: "21m00Tcm4TlvDq8ikWAM",
        label: "Rachel",
        language: "en",
        hint: "Default — calm",
      },
      { id: "AZnzlk1XvdvUeBnXmlld", label: "Domi", language: "en" },
      { id: "EXAVITQu4vr4xnSDxMaL", label: "Bella", language: "en" },
      { id: "ErXwobaYiN019PkySvjV", label: "Antoni", language: "en" },
      { id: "MF3mGyEYCl7XYWbV9V6O", label: "Elli", language: "en" },
      { id: "TxGEqnHWrfWFTfGW9XjX", label: "Josh", language: "en" },
      { id: "VR6AewLTigWG4xSOukaG", label: "Arnold", language: "en" },
      { id: "pNInz6obpgDQGcFmaJgB", label: "Adam", language: "en" },
      { id: "yoZ06aMxZJJ28mfd3POQ", label: "Sam", language: "en" },
    ],
    customBaseURL: true,
    apiKeyHint: "Get your key at elevenlabs.io → Profile → API Keys",
    docsURL: "https://elevenlabs.io/docs/api-reference/text-to-speech",
    notes:
      "You can paste any voice id from your ElevenLabs Voices library. The voices listed above are stock voices for quick selection.",
    region: "global",
  },

  // ─── Microsoft Edge TTS (server-proxied) ──────────────────────────
  {
    id: "edge",
    name: "Microsoft Edge TTS",
    protocol: "edge",
    baseURL: "/api/tts-edge",
    defaultVoice: "ja-JP-NanamiNeural",
    voices: [
      { id: "ja-JP-NanamiNeural", label: "Nanami (ja-JP)", language: "ja" },
      { id: "ja-JP-KeitaNeural", label: "Keita (ja-JP)", language: "ja" },
      { id: "en-US-JennyNeural", label: "Jenny (en-US)", language: "en" },
      { id: "en-US-GuyNeural", label: "Guy (en-US)", language: "en" },
      { id: "zh-CN-XiaoxiaoNeural", label: "Xiaoxiao (zh-CN)", language: "zh" },
      { id: "zh-CN-YunxiNeural", label: "Yunxi (zh-CN)", language: "zh" },
      { id: "zh-CN-YunjianNeural", label: "Yunjian (zh-CN)", language: "zh" },
      { id: "ko-KR-SunHiNeural", label: "SunHi (ko-KR)", language: "ko" },
    ],
    apiKeyHint: "No API key required — proxied through the server-side /api/tts-edge route.",
    docsURL:
      "https://learn.microsoft.com/en-us/azure/ai-services/speech-service/language-support",
    notes:
      "Free, high-quality neural voices. Audio is synthesised on the server because the Edge TTS WebSocket protocol is complex.",
    serverSide: true,
    region: "global",
  },

  // ─── Custom HTTP endpoint ─────────────────────────────────────────
  {
    id: "custom",
    name: "Custom HTTP endpoint",
    protocol: "custom",
    baseURL: "",
    defaultVoice: "default",
    voices: [{ id: "default", label: "default" }],
    customBaseURL: true,
    apiKeyHint:
      "POST {baseURL} with JSON { text, voice, format }. Server returns the raw audio bytes (audio/mpeg).",
    docsURL: "",
    notes:
      "Bring your own TTS backend (e.g. a self-hosted CosyVoice, GPT-SoVITS, or a LiteLLM proxy).",
    region: "local",
  },
];

/** Find a provider by id. Falls back to the first one. */
export function findTTSProvider(id: string | undefined): TTSProvider {
  if (id) {
    const hit = TTS_PROVIDERS.find((p) => p.id === id);
    if (hit) return hit;
  }
  return TTS_PROVIDERS[0];
}
