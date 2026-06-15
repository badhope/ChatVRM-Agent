/**
 * TTS provider abstraction types.
 *
 * Every supported Text-to-Speech backend — Koeiromap, OpenAI TTS,
 * ElevenLabs, Microsoft Edge TTS, or a self-hosted HTTP endpoint —
 * is described by a TTSProvider object. The actual network call is
 * performed by one of the adapters in this directory, selected by
 * `provider.protocol`.
 */

/** Wire protocol used by the provider. */
export type TTSProtocol =
  | "koeiromap"   // Koemotion Koeiromap REST (returns base64 audio in JSON)
  | "openai-tts"  // OpenAI /v1/audio/speech (binary stream)
  | "elevenlabs"  // ElevenLabs /v1/text-to-speech/{voice_id} (binary stream)
  | "edge"        // Microsoft Edge TTS — proxied via /api/tts-edge (WebSocket)
  | "custom";     // User-supplied HTTP endpoint

/** A pre-defined voice entry, advertised in the settings UI. */
export type TTSVoice = {
  /** Provider-recognised voice id (sent verbatim in the request). */
  id: string;
  /** Human-readable label shown in the settings dropdown. */
  label: string;
  /** Language code (BCP-47) — used for filtering and to set the UI hint. */
  language?: string;
  /** Free-form hint shown next to the voice in the UI. */
  hint?: string;
};

/** Output audio format requested from the provider. */
export type TTSAudioFormat = "mp3" | "wav" | "opus" | "pcm";

/**
 * A single TTS provider.
 *
 * The id, baseURL, and protocol drive both the network call and the
 * settings UI; `apiKey` is the user-supplied key (omitted for the
 * public Koeiromap free endpoint and the Edge TTS proxy).
 */
export type TTSProvider = {
  /** Stable identifier persisted in localStorage. */
  id: string;
  /** Human-readable name shown in the UI. */
  name: string;
  /** Wire protocol. */
  protocol: TTSProtocol;
  /** API root used to build the request URL. */
  baseURL: string;
  /** Default voice id. */
  defaultVoice: string;
  /** Voices surfaced in the settings dropdown. */
  voices: TTSVoice[];
  /** Whether the baseURL is user-editable in the settings. */
  customBaseURL?: boolean;
  /** Hint shown to the user about how to obtain an API key. */
  apiKeyHint?: string;
  /** URL of the provider's API-key signup page. */
  docsURL: string;
  /** Free-form notes shown under the provider dropdown. */
  notes?: string;
  /**
   * Whether the provider runs server-side in the Next.js API route
   * (`/api/tts-edge`) — set true for Edge TTS only. When true, the
   * client calls our own endpoint with the original text and we
   * proxy the request.
   */
  serverSide?: boolean;
  /** Region tag for documentation grouping; not used at runtime. */
  region?: "global" | "china" | "local";
};

/** User-selected TTS configuration, persisted in localStorage. */
export type TTSSettings = {
  providerId: string;
  voice: string;
  model?: string;
  baseURL: string;
  apiKey: string;
  speed?: number;
};

/** Request to synthesize one chunk of speech. */
export type TTSRequest = {
  text: string;
  voice: string;
  /** Optional model id (used by OpenAI TTS). */
  model?: string;
  /** 0.25 – 4.0. Provider-specific. */
  speed?: number;
  /** Output format. Defaults to "mp3". */
  format?: TTSAudioFormat;
  /** Koeiromap-only: speaker X coordinate. */
  speakerX?: number;
  /** Koeiromap-only: speaker Y coordinate. */
  speakerY?: number;
  /**
   * Koeiromap-only: emotion style. Accepts the full TalkStyle set
   * for forward compatibility — non-Koeiromap adapters ignore it.
   */
  style?:
    | "talk"
    | "happy"
    | "sad"
    | "angry"
    | "fear"
    | "surprised";
};

/** Result of a successful synthesis. */
export type TTSResult = {
  /** Encoded audio bytes (mp3, wav, …). */
  audio: ArrayBuffer;
  /** MIME type, e.g. "audio/mpeg". */
  mime: string;
  /** Provider-reported voice id (for caching/logging). */
  voice: string;
};
