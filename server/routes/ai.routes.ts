import { Router, type Request, type Response } from 'express';
import type { LLMAdapter } from '../../src/adapters/llm.adapter.js';
import type { ConfigAdapter } from '../../src/adapters/config.adapter.js';
import type { ProviderType } from '../../src/ports/config.port.js';
import { PROVIDER_META, resolveApiKey } from '../providers.js';

interface AIDeps {
  llm: LLMAdapter;
  config: ConfigAdapter;
}

/**
 * Type-specific system prompts. The endpoint also accepts an explicit
 * `systemPrompt` override, but most callers want one of the canned
 * generators for personality / tool / memory / skill / agent / emotion /
 * general purpose. These prompts instruct the LLM to return **strict JSON**,
 * so the `/ai/generate` handler can auto-parse and return a `parsed` field.
 */
const TYPE_PROMPTS: Record<string, string> = {
  personality: `You are an expert personality designer for AI assistants.
Return STRICT JSON (no markdown, no commentary, no code fences) with this exact shape:
{
  "id": "snake_case_id_lowercase_under_30_chars",
  "name": "Display Name",
  "traits": ["trait1", "trait2", "trait3", "trait4", "trait5"],
  "tone": "two or three words describing tone",
  "systemPrompt": "Full system prompt that an AI assistant will receive, 80-160 words. Be specific about speaking style, sentence structure, what to do, and what to avoid."
}
The id must be a valid snake_case string, no spaces, no leading numbers. The systemPrompt should be rich and actionable.`,

  tool: `You are an expert API/tool designer.
Return STRICT JSON (no markdown, no commentary, no code fences) with this exact shape:
{
  "name": "snake_case_tool_name",
  "description": "One sentence, ≤80 chars, describing what the tool does and when to use it.",
  "schema": [
    { "name": "param_name", "type": "string|number|boolean|array|object", "description": "...", "required": true|false }
  ],
  "instructions": "Concise instructions (60-120 words) for the LLM on how to use this tool correctly, what edge cases to handle, and what NOT to do."
}
Schema parameters must be ordered; put required ones first.`,

  skill: `You are an expert at designing ReAct-style skills for AI agents.
Return STRICT JSON (no markdown, no commentary, no code fences) with this exact shape:
{
  "name": "PascalCaseSkillName",
  "slug": "kebab-case-slug",
  "summary": "One sentence, ≤100 chars.",
  "trigger": "Describe the user intent that should activate this skill in 1-2 sentences.",
  "steps": ["Step 1: ...", "Step 2: ...", "Step 3: ..."],
  "tools": ["tool_name_1", "tool_name_2"],
  "guardrails": "What the skill must NOT do. 1-2 sentences."
}
steps must be 3-7 entries. tools must reference real tool names when possible.`,

  agent: `You are an expert at designing AI agents.
Return STRICT JSON (no markdown, no commentary, no code fences) with this exact shape:
{
  "name": "Agent Name",
  "role": "1-2 sentence role description",
  "systemPrompt": "Detailed system prompt (100-200 words) describing the agent's expertise, decision-making style, output format preferences, and constraints.",
  "capabilities": ["capability_1", "capability_2", "capability_3"],
  "limitations": ["limitation_1", "limitation_2"]
}
capabilities should be 3-6 short verb phrases.`,

  memory: `You are an expert at summarizing and tagging conversational memories for long-term storage.
Return STRICT JSON (no markdown, no commentary, no code fences) with this exact shape:
{
  "title": "Short title, ≤60 chars",
  "summary": "One-sentence summary, ≤140 chars",
  "tags": ["tag1", "tag2", "tag3"],
  "importance": 0.0,
  "category": "preference|fact|event|instruction|context"
}
importance is a float in [0,1] (higher = more important to remember).
tags should be 1-5 short lowercase words.`,

  emotion: `You are an expert at reading the emotional tone of a short text.
Return STRICT JSON (no markdown, no commentary, no code fences) with this exact shape:
{
  "name": "neutral|excited|confident|cautious|frustrated|tired|curious|happy|thoughtful|exhausted|inspired|focused",
  "intensity": 0,
  "triggers": ["phrase or word that triggered this emotion"],
  "reasoning": "One sentence explaining why."
}
Pick exactly ONE name from the list above. intensity is an integer in [0,100]. triggers should reference specific words/phrases from the input.`,

  json: `You are a precise JSON generator. Return STRICT JSON only (no markdown, no commentary, no code fences). Match the shape the user requests exactly. Use null for missing optional values, [] for missing arrays, {} for missing objects.`,
};

/**
 * Strip ```json ... ``` fences or any other leading/trailing junk so
 * `JSON.parse` has clean input. Falls back to the raw string if no
 * JSON-looking object/array can be located.
 */
function extractJsonString(text: string): string {
  const trimmed = text.trim();
  // Strip ```json ... ``` or ``` ... ``` fences
  const fence = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fence) return fence[1].trim();
  // Locate the first balanced top-level JSON value
  const firstBrace = trimmed.search(/[\[{]/);
  if (firstBrace < 0) return trimmed;
  const open = trimmed[firstBrace];
  const close = open === '[' ? ']' : '}';
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = firstBrace; i < trimmed.length; i++) {
    const ch = trimmed[i];
    if (escape) { escape = false; continue; }
    if (ch === '\\') { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === open) depth++;
    else if (ch === close) {
      depth--;
      if (depth === 0) return trimmed.slice(firstBrace, i + 1);
    }
  }
  return trimmed.slice(firstBrace);
}

export function aiRoutes(deps: AIDeps): Router {
  const r = Router();

  /**
   * POST /api/ai/generate
   *
   * Body:
   *   prompt:        string (required) — the user request
   *   type?:         'personality' | 'tool' | 'skill' | 'agent' | 'memory' | 'emotion' | 'json' | 'general'
   *   systemPrompt?: string — overrides the type-specific prompt
   *   model?:        string — model id (default = chat defaults)
   *   provider?:     ProviderType (default = chat defaults)
   *   temperature?:  number (default 0.7)
   *   maxTokens?:    number (default 1024)
   *   json?:         boolean (default true when type is one of the JSON types)
   *
   * Response:
   *   { ok, content, parsed?, model, provider, usage, latencyMs }
   */
  r.post('/generate', async (req: Request, res: Response) => {
    const {
      prompt,
      type,
      systemPrompt,
      model,
      provider,
      temperature,
      maxTokens,
      json,
    } = req.body as {
      prompt?: string;
      type?: string;
      systemPrompt?: string;
      model?: string;
      provider?: ProviderType;
      temperature?: number;
      maxTokens?: number;
      json?: boolean;
    };

    if (typeof prompt !== 'string' || prompt.trim().length === 0) {
      res.status(400).json({ ok: false, error: 'prompt is required' });
      return;
    }

    const resolvedProvider = (provider ?? (await deps.config.getDefaultProvider())) as ProviderType;
    const meta = PROVIDER_META.find((p) => p.id === resolvedProvider);
    if (!meta) {
      res.status(400).json({ ok: false, error: `unknown provider "${resolvedProvider}"` });
      return;
    }
    if (meta.requiresKey) {
      const key = await resolveApiKey(deps.config, resolvedProvider);
      if (!key) {
        res.status(401).json({
          ok: false,
          error: `No API key for provider "${resolvedProvider}". Configure it in the Config page first.`,
        });
        return;
      }
    }

    const wantsJson = json === true
      || (json === undefined && typeof type === 'string' && TYPE_PROMPTS[type] !== undefined);
    const system = systemPrompt
      ?? (type && TYPE_PROMPTS[type])
      ?? 'You are a helpful assistant. Respond in clear, well-structured text.';

    const resolvedModel = model
      ?? (await deps.config.getChatConfig())?.model
      ?? meta.defaultModel;

    const startedAt = Date.now();
    try {
      const response = await deps.llm.chatExact({
        provider: resolvedProvider,
        model: resolvedModel,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: prompt },
        ],
        temperature: typeof temperature === 'number' ? temperature : 0.7,
        maxTokens: typeof maxTokens === 'number' ? maxTokens : 1024,
      });

      const latencyMs = Date.now() - startedAt;
      const result: Record<string, unknown> = {
        ok: true,
        content: response.content,
        model: response.model,
        provider: resolvedProvider,
        usage: response.usage,
        latencyMs,
      };
      if (wantsJson) {
        try {
          result.parsed = JSON.parse(extractJsonString(response.content));
        } catch (err) {
          result.parsed = null;
          result.parseError = err instanceof Error ? err.message : String(err);
        }
      }
      res.json(result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({
        ok: false,
        error: msg,
        provider: resolvedProvider,
        model: resolvedModel,
        latencyMs: Date.now() - startedAt,
      });
    }
  });

  /**
   * GET /api/ai/types — return the list of supported generator types so the
   * frontend can render a dropdown without hard-coding labels.
   */
  r.get('/types', (_req, res) => {
    res.json(
      Object.keys(TYPE_PROMPTS).map((id) => ({
        id,
        json: true,
        description: TYPE_PROMPTS[id].split('\n')[0] ?? '',
      })),
    );
  });

  return r;
}
