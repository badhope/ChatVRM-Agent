import { koeiromapFreeV1 } from "@/features/koeiromap/koeiromap";
import { z } from "zod";

import type { NextApiRequest, NextApiResponse } from "next";

/**
 * Legacy /api/tts endpoint — kept for backward compatibility with
 * older frontends. New code should call `synthesizeSpeech()` from
 * `@/features/tts/tts` directly from the browser, which dispatches
 * to the user-selected provider.
 */
const talkStyleSchema = z.enum(["talk", "happy", "sad"]);

const requestSchema = z.object({
  message: z.string().min(1).max(2000),
  speakerX: z.number().min(-10).max(10),
  speakerY: z.number().min(-10).max(10),
  style: talkStyleSchema.optional().default("talk"),
  apiKey: z.string().min(1),
});

type Data = {
  audio: string;
};

type ErrorData = {
  error: string;
  details?: unknown;
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<Data | ErrorData>
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

  try {
    const voice = await koeiromapFreeV1(
      parsed.data.message,
      parsed.data.speakerX,
      parsed.data.speakerY,
      parsed.data.style,
      parsed.data.apiKey
    );
    res.status(200).json(voice);
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Unknown error from Koeiromap.";
    res
      .status(502)
      .json({ error: "Upstream TTS call failed", details: message });
  }
}
