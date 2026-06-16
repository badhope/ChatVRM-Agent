/**
 * Koeiromap adapter.
 *
 * Calls the Koemotion /v1.0/infer endpoint and returns the
 * base64-encoded mp3 audio from the JSON response. The free
 * endpoint works without an API key; the paid endpoint requires
 * one via the Ocp-Apim-Subscription-Key header.
 */
import type {
  TTSProvider,
  TTSRequest,
  TTSResult,
  TTSSettings,
} from "./types";
import { joinURL } from "@/utils/joinURL";

export async function synthesizeKoeiromap(
  provider: TTSProvider,
  settings: TTSSettings,
  req: TTSRequest
): Promise<TTSResult> {
  const reducedStyle = (req.style ?? "talk") as "talk" | "happy" | "sad";
  const body = {
    text: req.text,
    speaker_x: req.speakerX ?? 0,
    speaker_y: req.speakerY ?? 0,
    style: reducedStyle,
    output_format: "mp3",
  };
  const url = joinURL(provider.baseURL, "/koeiromap/v1.0/infer");
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Cache-Control": "no-cache",
  };
  if (settings.apiKey) {
    headers["Ocp-Apim-Subscription-Key"] = settings.apiKey;
  }
  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Koeiromap HTTP ${res.status}${text ? ` — ${text.slice(0, 200)}` : ""}`
    );
  }
  const data = (await res.json()) as { audio?: string };
  if (!data.audio) throw new Error("Koeiromap returned no audio data");
  const audio = base64ToArrayBuffer(data.audio);
  return { audio, mime: "audio/mpeg", voice: req.voice };
}

function base64ToArrayBuffer(b64: string): ArrayBuffer {
  // Strip data URL prefix if present.
  const i = b64.indexOf(",");
  const clean = i >= 0 ? b64.slice(i + 1) : b64;
  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let j = 0; j < binary.length; j++) bytes[j] = binary.charCodeAt(j);
  return bytes.buffer;
}