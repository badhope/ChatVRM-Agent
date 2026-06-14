import { Configuration, OpenAIApi } from "openai";
import { z } from "zod";

import type { NextApiRequest, NextApiResponse } from "next";

const chatMessageSchema = z.object({
  role: z.enum(["system", "user", "assistant"]),
  content: z.string().min(1).max(8000),
});

const requestSchema = z.object({
  apiKey: z.string().optional(),
  messages: z.array(chatMessageSchema).min(1).max(40),
});

type Data = {
  message: string;
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

  const apiKey = parsed.data.apiKey || process.env.OPEN_AI_KEY;
  if (!apiKey) {
    res.status(400).json({
      error: "Missing API key. Set OPEN_AI_KEY or pass apiKey in the body.",
    });
    return;
  }

  try {
    const configuration = new Configuration({ apiKey });
    const openai = new OpenAIApi(configuration);

    const model = process.env.OPEN_AI_MODEL || "gpt-3.5-turbo";

    const { data } = await openai.createChatCompletion({
      model,
      messages: parsed.data.messages,
    });

    const choice = data.choices?.[0];
    const message = choice?.message?.content || "An error occurred.";

    res.status(200).json({ message });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Unknown error from OpenAI.";
    res
      .status(502)
      .json({ error: "Upstream LLM call failed", details: message });
  }
}
