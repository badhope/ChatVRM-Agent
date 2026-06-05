/**
 * Structured output (JSON mode) helper.
 *
 * Lets the agent request a typed, validated response from the LLM.
 * Two strategies, used in combination:
 *
 *   1. **Schema-in-prompt** — append a clear, compact JSON-Schema
 *      description to the user message. Works on every model, no
 *      provider-specific flag required.
 *   2. **Response extraction** — given the raw text from the model,
 *      robustly extract the first JSON object/array, parse it, and
 *      validate against the zod schema. Repairs common LLM mistakes
 *      (trailing commas, single-line comments, code-fenced JSON).
 *
 * This module is model-agnostic. Providers that support
 * `response_format: { type: 'json_object' }` can set that flag
 * directly via ILLMPort. The helper is the *fallback path* that
 * works without it.
 */

import { z } from 'zod';
import type { Message } from '../ports/llm.port.js';

export interface StructuredRequest<T> {
  /** The zod schema describing the expected response. */
  schema: z.ZodType<T>;
  /** Optional name for the schema (for nicer error messages). */
  schemaName?: string;
  /** The plain-text user prompt. */
  prompt: string;
  /** Optional prior conversation messages (system, etc.). */
  priorMessages?: Message[];
  /** Optional description of the model. */
  modelDescription?: string;
  /** When true, ask the model to wrap JSON in ```json fences. */
  fence?: boolean;
}

export interface StructuredResponse<T> {
  /** The parsed, validated value. */
  value: T;
  /** The raw text the model returned. */
  raw: string;
}

/**
 * Build a chat-ready message list that primes the model to answer in
 * a parseable JSON form. Returns the messages; you still need to call
 * the LLM yourself with the schema-aware prompt.
 */
export function buildStructuredMessages<T>(req: StructuredRequest<T>): Message[] {
  const jsonShape = describeZod(req.schema);
  const sys = `You are a function that returns STRICT JSON. Output ONLY the JSON — no prose, no markdown, no preamble. The JSON must match this JSON-Schema:\n\n${jsonShape}${req.fence ? '\n\nWrap the JSON in a ```json``` code block.' : ''}`;
  const msgs: Message[] = [];
  if (req.priorMessages) msgs.push(...req.priorMessages);
  msgs.push({ role: 'system', content: sys });
  msgs.push({ role: 'user', content: req.prompt });
  return msgs;
}

/**
 * Parse a model's raw text into a structured value. Tries:
 *   1. fenced ```json``` block
 *   2. first balanced JSON object/array
 *   3. entire string as JSON
 *
 * If all three fail, throws a StructuredError carrying the underlying
 * parse error and the original text.
 */
export function parseStructured<T>(raw: string, schema: z.ZodType<T>, schemaName = 'value'): StructuredResponse<T> {
  const candidate = extractJsonCandidate(raw);
  if (candidate === null) {
    throw new StructuredError(`No JSON object/array found in model output`, raw, schemaName);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(candidate);
  } catch (err) {
    const repaired = tryRepair(candidate);
    if (repaired === null) {
      throw new StructuredError(`JSON parse failed: ${(err as Error).message}`, raw, schemaName);
    }
    try {
      parsed = JSON.parse(repaired);
    } catch (err2) {
      throw new StructuredError(`JSON parse failed after repair: ${(err2 as Error).message}`, raw, schemaName);
    }
  }
  const result = schema.safeParse(parsed);
  if (!result.success) {
    throw new StructuredError(`Schema validation failed: ${result.error.message}`, raw, schemaName);
  }
  return { value: result.data, raw };
}

export class StructuredError extends Error {
  readonly code = 'STRUCTURED_OUTPUT_INVALID';
  constructor(message: string, public readonly raw: string, public readonly schemaName: string) {
    super(`[${schemaName}] ${message}`);
  }
}

/* ----------------------------------------------------------------- */
/* Internals                                                          */
/* ----------------------------------------------------------------- */

function extractJsonCandidate(s: string): string | null {
  // 1. fenced ```json ... ```
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) return fence[1]!.trim();
  // 2. first balanced {...} or [...]
  const first = s.search(/[[{]/);
  if (first === -1) return null;
  const open = s[first]!;
  const close = open === '{' ? '}' : ']';
  let depth = 0;
  let inStr = false;
  let escape = false;
  for (let i = first; i < s.length; i += 1) {
    const c = s[i]!;
    if (inStr) {
      if (escape) { escape = false; continue; }
      if (c === '\\') { escape = true; continue; }
      if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') { inStr = true; continue; }
    if (c === open) depth += 1;
    else if (c === close) {
      depth -= 1;
      if (depth === 0) return s.slice(first, i + 1);
    }
  }
  // 3. fallback: entire string
  const trimmed = s.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) return trimmed;
  return null;
}

/**
 * Strip // line comments and /* block comments *​/ without touching
 * string literals. A regex like `/(^|[^:"'\\])\/\/.*$/gm` looks
 * correct at a glance but happily eats `http://` inside a quoted
 * string (the char before `//` is the letter `p`, not a quote).
 * The only safe way is to walk the string with a tiny lexer state
 * machine that knows about `"`, `'`, and template literal backticks.
 */
function stripJsonComments(s: string): string {
  let out = '';
  let i = 0;
  const n = s.length;
  let inString: '"' | "'" | '`' | null = null;
  while (i < n) {
    const c = s[i];
    if (inString !== null) {
      out += c;
      // Handle escape sequences inside the active string.
      if (c === '\\' && i + 1 < n) {
        out += s[i + 1]!;
        i += 2;
        continue;
      }
      if (c === inString) inString = null;
      i += 1;
      continue;
    }
    // Not in a string: look for comment starts.
    if (c === '"' || c === "'" || c === '`') {
      inString = c;
      out += c;
      i += 1;
      continue;
    }
    if (c === '/' && s[i + 1] === '/') {
      // line comment — skip to end of line (or end of input)
      while (i < n && s[i] !== '\n') i += 1;
      continue;
    }
    if (c === '/' && s[i + 1] === '*') {
      // block comment — skip to */
      i += 2;
      while (i < n - 1 && !(s[i] === '*' && s[i + 1] === '/')) i += 1;
      i += 2; // consume the closing */
      continue;
    }
    out += c;
    i += 1;
  }
  return out;
}

function tryRepair(s: string): string | null {
  let out = s;
  // Strip // line comments and /* */ block comments *outside* strings.
  out = stripJsonComments(out);
  // Trailing commas before } or ]
  out = out.replace(/,(\s*[}\]])/g, '$1');
  // Python None / True / False → null / true / false
  out = out.replace(/\bNone\b/g, 'null').replace(/\bTrue\b/g, 'true').replace(/\bFalse\b/g, 'false');
  return out.trim() || null;
}

function describeZod(schema: z.ZodType<unknown>): string {
  // Use zod's built-in describe where possible; fall back to a hand-rolled hint.
  try {
    // The standard zod v3 -> JSON-Schema path: zod-to-json-schema, but we
    // don't want a hard dependency, so describe shapes manually for
    // the common cases.
    return manualDescribe(schema);
  } catch {
    return '{}';
  }
}

function manualDescribe(schema: z.ZodType<unknown>): string {
  // For unknown unions / refinements / lazy schemas, fall back to {}.
  // For object schemas, the most common case, emit a hand-rolled hint.
  const def = (schema as unknown as { _def?: { typeName?: string; shape?: () => Record<string, z.ZodType<unknown>>; innerType?: z.ZodType<unknown>; values?: unknown[]; options?: Array<z.ZodType<unknown>> } })._def;
  if (!def) return 'JSON object';
  switch (def.typeName) {
    case 'ZodObject': {
      const props: Record<string, unknown> = {};
      const required: string[] = [];
      if (def.shape) {
        for (const [k, v] of Object.entries(def.shape())) {
          props[k] = describeInner(v as z.ZodType<unknown>);
          if (!isOptional(v as z.ZodType<unknown>)) required.push(k);
        }
      }
      return JSON.stringify({ type: 'object', properties: props, required, additionalProperties: false });
    }
    case 'ZodArray':
      return JSON.stringify({ type: 'array', items: def.innerType ? describeInner(def.innerType) : {} });
    case 'ZodEnum':
      return JSON.stringify({ type: 'string', enum: def.values ?? [] });
    case 'ZodUnion':
    case 'ZodDiscriminatedUnion': {
      // Better than "{}": actually enumerate each branch's shape.
      const branches = (def.options ?? []).map((o) => {
        try {
          return JSON.parse(manualDescribe(o));
        } catch {
          return describeInner(o);
        }
      });
      if (branches.length === 0) return JSON.stringify({ description: 'one of multiple shapes' });
      return JSON.stringify({ oneOf: branches });
    }
    case 'ZodIntersection': {
      // Merge both sides' properties best-effort.
      const left = (() => { try { return JSON.parse(manualDescribe(def.innerType as z.ZodType<unknown>)); } catch { return {}; } })();
      const inner: { innerType?: z.ZodType<unknown> } = def as { innerType?: z.ZodType<unknown> };
      const rightSchema = (inner as { left?: z.ZodType<unknown>; right?: z.ZodType<unknown> });
      const right = rightSchema.right ? (() => { try { return JSON.parse(manualDescribe(rightSchema.right!)); } catch { return {}; } })() : {};
      const merged: Record<string, unknown> = { ...(left as Record<string, unknown>), ...(right as Record<string, unknown>) };
      return JSON.stringify(merged);
    }
    case 'ZodRecord':
      return JSON.stringify({ type: 'object', additionalProperties: def.innerType ? describeInner(def.innerType) : {} });
    case 'ZodTuple':
      return JSON.stringify({ type: 'array', prefixItems: def.innerType ? [describeInner(def.innerType)] : [] });
    case 'ZodEffects':
    case 'ZodPipeline':
    case 'ZodLazy':
      // Peel off the wrapper.
      if (def.innerType) return manualDescribe(def.innerType);
      return JSON.stringify(describeInner(schema));
    default:
      return JSON.stringify(describeInner(schema));
  }
}

function describeInner(schema: z.ZodType<unknown>): Record<string, unknown> {
  const def = (schema as unknown as { _def?: { typeName?: string; innerType?: z.ZodType<unknown>; values?: unknown[]; minLength?: number; maxLength?: number } })._def;
  if (!def) return {};
  switch (def.typeName) {
    case 'ZodString': {
      const out: Record<string, unknown> = { type: 'string' };
      if (def.minLength !== undefined) out['minLength'] = def.minLength;
      if (def.maxLength !== undefined) out['maxLength'] = def.maxLength;
      return out;
    }
    case 'ZodNumber': return { type: 'number' };
    case 'ZodBoolean': return { type: 'boolean' };
    case 'ZodNull': return { type: 'null' };
    case 'ZodEnum': return { type: 'string', enum: def.values ?? [] };
    case 'ZodArray': return { type: 'array', items: def.innerType ? describeInner(def.innerType) : {} };
    case 'ZodOptional':
    case 'ZodNullable':
      return def.innerType ? describeInner(def.innerType) : {};
    case 'ZodLiteral':
      return { const: (def.values as unknown[] | undefined)?.[0] };
    default:
      return {};
  }
}

function isOptional(schema: z.ZodType<unknown>): boolean {
  const def = (schema as unknown as { _def?: { typeName?: string } })._def;
  return def?.typeName === 'ZodOptional' || def?.typeName === 'ZodNullable';
}
