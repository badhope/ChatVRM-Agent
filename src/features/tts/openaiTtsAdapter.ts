/**
 * OpenAI TTS adapter.
 *
 * Calls /v1/audio/speech and returns the raw audio stream
 * (mp3, opus, …) as an ArrayBuffer.
 */
import type { TTSRequest, TTSResult, TTSSettings } from "./types";

export async function synthesizeOpenAITTS(
  baseURL: string,
  settings: TTSSettings,
  req: TTSRequest
): Promise<TTSResult> {
  if (!settings.apiKey?.trim()) {
    throw new Error("OpenAI TTS requires an API key");
  }
  const url = joinURL(baseURL, "/audio/speech");
  const body = {
    model: req.model || settings.model || "tts-1",
    input: req.text,
    voice: req.voice,
    response_format: req.format || "mp3",
    speed: req.speed ?? settings.speed ?? 1.0,
  };
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${settings.apiKey}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `OpenAI TTS HTTP ${res.status}${text ? ` — ${text.slice(0, 200)}` : ""}`
    );
  }
  const audio = await res.arrayBuffer();
  return {
    audio,
    mime: mimeForFormat(body.response_format),
    voice: req.voice,
  };
}

function mimeForFormat(fmt: string): string {
  switch (fmt) {
    case "mp3":
      return "audio/mpeg";
    case "opus":
      return "audio/ogg";
    case "wav":
      return "audio/wav";
    case "pcm":
      return "audio/pcm";
    default:
      return "audio/mpeg";
  }
}

function joinURL(base: string, path: string): string {
  const b = base.replace(/\/+$/, "");
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${b}${p}`;
}
