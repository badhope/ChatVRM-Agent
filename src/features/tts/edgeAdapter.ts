/**
 * Microsoft Edge TTS adapter.
 *
 * The native Edge TTS protocol is a complex WebSocket + protobuf
 * stream. We proxy through our own /api/tts-edge server-side route
 * that returns audio/mpeg bytes.
 */
import type { TTSRequest, TTSResult, TTSSettings } from "./types";

export async function synthesizeEdge(
  _baseURL: string,
  _settings: TTSSettings,
  req: TTSRequest
): Promise<TTSResult> {
  const url = "/api/tts-edge";
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
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
      `Edge TTS HTTP ${res.status}${text ? ` — ${text.slice(0, 200)}` : ""}`
    );
  }
  const audio = await res.arrayBuffer();
  return {
    audio,
    mime: req.format === "wav" ? "audio/wav" : "audio/mpeg",
    voice: req.voice,
  };
}
