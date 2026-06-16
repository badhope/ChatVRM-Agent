/**
 * ElevenLabs adapter.
 *
 * Calls /v1/text-to-speech/{voice_id} and returns the audio stream
 * (mp3 by default) as an ArrayBuffer.
 */
import type { TTSRequest, TTSResult, TTSSettings } from "./types";
import { joinURL } from "@/utils/joinURL";

export async function synthesizeElevenLabs(
  baseURL: string,
  settings: TTSSettings,
  req: TTSRequest
): Promise<TTSResult> {
  if (!settings.apiKey?.trim()) {
    throw new Error("ElevenLabs requires an API key");
  }
  const voiceId = req.voice || settings.voice;
  const url = joinURL(baseURL, `/text-to-speech/${voiceId}`);
  const body = {
    text: req.text,
    model_id: req.model || settings.model || "eleven_multilingual_v2",
    voice_settings: {
      stability: 0.5,
      similarity_boost: 0.75,
      speed: req.speed ?? settings.speed ?? 1.0,
    },
  };
  const accept = req.format === "wav" ? "audio/wav" : "audio/mpeg";
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: accept,
      "xi-api-key": settings.apiKey,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `ElevenLabs HTTP ${res.status}${text ? ` — ${text.slice(0, 200)}` : ""}`
    );
  }
  const audio = await res.arrayBuffer();
  return { audio, mime: accept, voice: voiceId };
}


