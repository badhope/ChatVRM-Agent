/**
 * Custom HTTP endpoint adapter.
 *
 * POST {baseURL} with JSON { text, voice, format, speed } and
 * receive the raw audio bytes. This is the escape hatch for
 * self-hosted backends (CosyVoice, GPT-SoVITS, etc.).
 */
import type { TTSRequest, TTSResult, TTSSettings } from "./types";

export async function synthesizeCustom(
  baseURL: string,
  settings: TTSSettings,
  req: TTSRequest
): Promise<TTSResult> {
  if (!baseURL) throw new Error("Custom TTS requires a base URL");
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "audio/mpeg",
  };
  if (settings.apiKey) headers.Authorization = `Bearer ${settings.apiKey}`;
  const res = await fetch(baseURL, {
    method: "POST",
    headers,
    body: JSON.stringify({
      text: req.text,
      voice: req.voice,
      format: req.format || "mp3",
      speed: req.speed ?? 1.0,
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Custom TTS HTTP ${res.status}${text ? ` — ${text.slice(0, 200)}` : ""}`
    );
  }
  const audio = await res.arrayBuffer();
  return {
    audio,
    mime: res.headers.get("content-type") || "audio/mpeg",
    voice: req.voice,
  };
}
