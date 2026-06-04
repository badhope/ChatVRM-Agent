/**
 * Minimal zod → JSON Schema (draft-07) converter.
 *
 * We intentionally do NOT pull in zod-to-json-schema (~80KB, dozens of
 * transitive deps). This handles the subset that real LLM tool schemas
 * actually need:
 *   - z.string / z.number / z.integer / z.boolean
 *   - z.enum([...])
 *   - z.array(z.X)
 *   - z.object({ ... })  (incl. .optional / .describe / .default)
 *   - z.union([...])
 *   - z.literal(v)
 *
 * Anything more exotic falls back to { type: 'object' } and a warning.
 * Real-world tool authors in this project use only the above subset.
 */
import type { z } from 'zod';

const PRIMITIVE: Record<string, string> = {
  ZodString: 'string',
  ZodNumber: 'number',
  ZodBoolean: 'boolean',
  ZodNull: 'null',
  ZodBigInt: 'integer',
  ZodDate: 'string',
};

interface ZodDefV3 {
  typeName?: string;
  /** Used by ZodOptional / ZodNullable / ZodReadonly / ZodDefault / ZodCatch / ZodBranded. */
  innerType?: z.ZodTypeAny;
  /** Used by ZodUnion / ZodDiscriminatedUnion / ZodLazy / ZodPipeline. */
  schema?: z.ZodTypeAny;
  /** Used by ZodArray / ZodMap / ZodSet / ZodPromise / ZodFunction — the element schema. */
  type?: z.ZodTypeAny;
  values?: unknown[];
  value?: unknown;
  shape?: () => Record<string, z.ZodTypeAny>;
  options?: z.ZodTypeAny[];
  items?: z.ZodTypeAny[];
  checks?: Array<{ kind: string; value?: number }>;
}

/**
 * Get the inner schema of a wrapper (ZodArray, ZodOptional, ZodUnion, …)
 * in a single call, regardless of which `_def` field stores it. The
 * zod v3 API is inconsistent: ZodArray uses `type`, ZodOptional uses
 * `innerType`, ZodUnion uses `options[]`, etc.
 */
function innerOf(schema: z.ZodTypeAny): z.ZodTypeAny | undefined {
  const def = getDef(schema);
  return def.innerType ?? def.schema ?? def.type;
}

function getDef(schema: z.ZodTypeAny): ZodDefV3 {
  // Zod v3 stores the discriminator in `_def.typeName`. We only need v3
  // here because the project pins zod@^3.24.0 in package.json.
  return (schema as unknown as { _def: ZodDefV3 })._def ?? {};
}

function unwrap(schema: z.ZodTypeAny): z.ZodTypeAny {
  let current = schema;
  for (let depth = 0; depth < 10; depth += 1) {
    const def = getDef(current);
    const typeName = def.typeName;
    if (
      typeName === 'ZodOptional' ||
      typeName === 'ZodNullable' ||
      typeName === 'ZodReadonly' ||
      typeName === 'ZodDefault' ||
      typeName === 'ZodCatch' ||
      typeName === 'ZodBranded' ||
      typeName === 'ZodPipeline'
    ) {
      const inner = innerOf(current);
      if (inner) current = inner;
      else break;
    } else {
      break;
    }
  }
  return current;
}

function describe(schema: z.ZodTypeAny): string | undefined {
  return schema.description;
}

function convert(schema: z.ZodTypeAny): Record<string, unknown> {
  const raw = schema;
  const def = getDef(raw);
  const typeName: string = def.typeName ?? 'Unknown';
  const inner: z.ZodTypeAny | undefined = innerOf(raw);
  const desc = describe(raw);
  const out: Record<string, unknown> = {};

  if (typeName === 'ZodString') {
    out.type = 'string';
  } else if (typeName === 'ZodNumber') {
    const checks = def.checks ?? [];
    out.type = checks.some((c) => c.kind === 'int') ? 'integer' : 'number';
  } else if (typeName === 'ZodBoolean') {
    out.type = 'boolean';
  } else if (typeName === 'ZodNull') {
    out.type = 'null';
  } else if (typeName === 'ZodEnum' && Array.isArray(def.values)) {
    out.type = 'string';
    out.enum = def.values;
  } else if (typeName === 'ZodLiteral') {
    const value = def.value;
    if (value !== undefined) {
      out.type = typeof value as 'string' | 'number' | 'boolean';
      out.enum = [value];
    }
  } else if (typeName === 'ZodArray') {
    out.type = 'array';
    out.items = inner ? convert(inner) : {};
  } else if (typeName === 'ZodObject') {
    return convertObject(raw);
  } else if (typeName === 'ZodUnion' || typeName === 'ZodDiscriminatedUnion') {
    if (inner) {
      const opt = def.options;
      if (Array.isArray(opt)) {
        out.anyOf = opt.map((o) => convert(o));
      } else {
        out.anyOf = [convert(inner)];
      }
    }
  } else if (typeName === 'ZodRecord') {
    out.type = 'object';
    out.additionalProperties = inner ? convert(inner) : {};
  } else if (typeName === 'ZodTuple') {
    out.type = 'array';
    const items = def.items;
    out.prefixItems = Array.isArray(items) ? items.map((i) => convert(i)) : [];
  } else {
    out.type = 'object';
  }

  if (desc) out.description = desc;
  return out;
}

function convertObject(schema: z.ZodTypeAny): Record<string, unknown> {
  const def = getDef(schema);
  // In zod v3 the shape() is a method on the schema instance.
  const shapeFn = (schema as unknown as { shape?: () => Record<string, z.ZodTypeAny> }).shape;
  const shape: Record<string, z.ZodTypeAny> = (typeof shapeFn === 'function' ? shapeFn() : undefined)
    ?? def.shape?.()
    ?? {};
  const properties: Record<string, unknown> = {};
  const required: string[] = [];

  for (const [key, value] of Object.entries(shape)) {
    const inner = unwrap(value);
    properties[key] = convert(inner);
    const innerTypeName = getDef(value).typeName;
    if (innerTypeName !== 'ZodOptional' && innerTypeName !== 'ZodDefault') {
      required.push(key);
    }
  }

  const out: Record<string, unknown> = {
    type: 'object',
    properties,
  };
  if (required.length > 0) out.required = required;
  if (schema.description) out.description = schema.description;
  return out;
}

/**
 * Convert a zod schema (or raw shape) to a JSON Schema object suitable
 * for the `parameters` field of an LLM tool spec.
 */
export function zodToJsonSchema(schema: z.ZodTypeAny): Record<string, unknown> {
  return convert(schema);
}

/**
 * Convert an LLMToolSpec (name, description, parameters=JSONSchema or
 * zod schema) to the shape required by a specific provider.
 *
 * - 'openai' / 'openai-compatible': function-calling shape
 * - 'anthropic': input_schema only, top-level name/description
 * - 'google': wraps in functionDeclarations array
 * - 'baidu': function-calling shape (similar to OpenAI)
 */
export type ToolFormat = 'openai' | 'anthropic' | 'google' | 'baidu';

export interface ProviderToolPayload {
  /** For OpenAI/Baidu: `tools` array. For Anthropic: same. For Google: same. */
  tools: unknown[];
  /** Provider-specific tool_choice. */
  toolChoice?: unknown;
}

export function toProviderTools(
  specs: Array<{ name: string; description: string; parameters: Record<string, unknown> | z.ZodTypeAny }>,
  format: ToolFormat,
  toolChoice?: 'auto' | 'required' | 'none' | { name: string },
): ProviderToolPayload {
  const resolved = specs.map((s) => ({
    name: s.name,
    description: s.description,
    parameters:
      s.parameters && typeof (s.parameters as { _def?: unknown })._def === 'object'
        ? zodToJsonSchema(s.parameters as z.ZodTypeAny)
        : (s.parameters as Record<string, unknown>),
  }));

  if (format === 'openai' || format === 'baidu') {
    const tools = resolved.map((s) => ({
      type: 'function',
      function: {
        name: s.name,
        description: s.description,
        parameters: s.parameters,
      },
    }));
    let mapped: unknown = 'auto';
    if (toolChoice === 'required') mapped = 'required';
    else if (toolChoice === 'none') mapped = 'none';
    else if (toolChoice && typeof toolChoice === 'object') mapped = { type: 'function', function: { name: toolChoice.name } };
    return { tools, toolChoice: mapped };
  }

  if (format === 'anthropic') {
    const tools = resolved.map((s) => ({
      name: s.name,
      description: s.description,
      input_schema: s.parameters,
    }));
    let mapped: unknown = { type: 'auto' };
    if (toolChoice === 'required') mapped = { type: 'any' };
    else if (toolChoice === 'none') mapped = { type: 'auto' };
    else if (toolChoice && typeof toolChoice === 'object') mapped = { type: 'tool', name: toolChoice.name };
    return { tools, toolChoice: mapped };
  }

  if (format === 'google') {
    const tools = [
      {
        functionDeclarations: resolved.map((s) => ({
          name: s.name,
          description: s.description,
          parameters: s.parameters,
        })),
      },
    ];
    let mapped: unknown = { mode: 'AUTO' };
    if (toolChoice === 'required') mapped = { mode: 'ANY' };
    else if (toolChoice === 'none') mapped = { mode: 'NONE' };
    else if (toolChoice && typeof toolChoice === 'object') {
      mapped = { mode: 'ANY', allowedFunctionNames: [toolChoice.name] };
    }
    return { tools, toolChoice: mapped };
  }

  return { tools: [] };
}
