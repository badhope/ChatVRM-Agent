/**
 * Server-side Edge TTS proxy.
 *
 * Microsoft's Edge TTS endpoint uses a complex WebSocket +
 * protobuf protocol. We delegate to the `msedge-tts` package
 * which speaks the protocol for us, then stream the audio back
 * to the client as a raw mp3 response.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";
import { z } from "zod";

const requestSchema = z.object({
  text: z.string().min(1).max(5000),
  voice: z.string().min(1).max(120),
  format: z.enum(["mp3", "opus", "wav"]).optional().default("mp3"),
  speed: z.number().min(0.25).max(4.0).optional().default(1.0),
});

export const config = {
  api: { responseLimit: false },
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ error: "Method not allowed" });
    return;
  }
  const parsed = requestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: "Invalid request body",
      details: parsed.error.flatten(),
    });
    return;
  }

  const { text, voice, format, speed } = parsed.data;

  let tts: MsEdgeTTS;
  try {
    tts = new MsEdgeTTS();
    const outputFormat =
      format === "opus"
        ? OUTPUT_FORMAT.WEBM_24KHZ_16BIT_MONO_OPUS
        : OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3;
    await tts.setMetadata(voice, outputFormat);
  } catch (err) {
    res
      .status(502)
      .json({ error: "Failed to initialise Edge TTS", details: String(err) });
    return;
  }

  // Build SSML with the requested speech rate.
  const ratePct = Math.round((speed - 1) * 100);
  const rate = ratePct === 0 ? "default" : `${ratePct > 0 ? "+" : ""}${ratePct}%`;
  const ssml = `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="en-US">
  <voice name="${voice}">
    <prosody rate="${rate}">${escapeXml(text)}</prosody>
  </voice>
</speak>`;

  const { audioStream } = tts.rawToStream(ssml);

  res.setHeader(
    "Content-Type",
    format === "opus" ? "audio/ogg" : "audio/mpeg"
  );
  res.setHeader("Cache-Control", "no-store");

  audioStream.on("data", (chunk: Buffer) => {
    res.write(chunk);
  });
  audioStream.on("end", () => {
    res.end();
  });
  audioStream.on("error", (err: Error) => {
    if (!res.headersSent) {
      res.status(502).json({ error: "Edge TTS stream error", details: err.message });
    } else {
      res.end();
    }
  });
  req.on("close", () => {
    try {
      tts.close();
    } catch {
      /* ignore */
    }
  });
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
