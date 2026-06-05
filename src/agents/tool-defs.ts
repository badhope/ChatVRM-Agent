/**
 * Shared zod schemas for the default tool set.
 *
 * L13 (W18): the CLI (`src/cli/index.ts`) and the server
 * (`server/tools-setup.ts`) both register the same default tools
 * (writeFile, readFile, shell, search, remember, analyze, respond,
 * webFetch, webSearch, plus the document-tool set). They used to
 * ship parallel copies of the zod schemas, with no shared source of
 * truth. That meant a schema change (e.g. a new optional field,
 * or a more strict `path` validator) had to be applied twice, and
 * nothing enforced that the two copies stayed in lock-step.
 *
 * Both sides now import from this module. The schemas here are the
 * canonical definitions; the server is the side with the richer
 * `.describe(...)` annotations and `.refine(...)` rules because it
 * is the only side that ever hands the schemas to a real LLM via
 * native function-calling. The CLI uses the same schemas to keep
 * `tools.register(...)` calls uniform across both entrypoints.
 */
import { z } from 'zod';

export const writeFileSchema = z
  .object({
    path: z.string().min(1).optional().describe('Absolute or workspace-relative file path'),
    filePath: z.string().min(1).optional().describe('Alias for `path`'),
    content: z.string().optional().describe('Explicit file content; if omitted, the previous step output is used'),
    previousOutput: z.string().optional(),
  })
  .refine((v) => Boolean(v.path ?? v.filePath), { message: 'path (or filePath) is required' });

export const readFileSchema = z
  .object({
    path: z.string().min(1).optional(),
    filePath: z.string().min(1).optional(),
  })
  .refine((v) => Boolean(v.path ?? v.filePath), { message: 'path (or filePath) is required' });

export const shellSchema = z.object({
  command: z.string().min(1).describe('Shell command to execute'),
  timeout: z.number().int().positive().optional().describe('Timeout in ms, default 60000'),
});

export const searchSchema = z.object({
  pattern: z.string().optional(),
  query: z.string().optional(),
});

export const rememberSchema = z.object({
  input: z.string().min(1).describe('Original user input / context to remember'),
  output: z.string().optional(),
  content: z.string().optional(),
  tags: z.array(z.string()).optional(),
  model: z.string().optional(),
  provider: z.string().optional(),
});

export const analyzeSchema = z.object({
  text: z.string().optional(),
  target: z.string().optional(),
  detail: z.string().optional(),
  instruction: z.string().optional(),
  provider: z.string().optional(),
  model: z.string().optional(),
});

export const respondSchema = z.object({
  input: z.string().optional(),
  message: z.string().optional(),
  prompt: z.string().optional(),
  context: z.union([z.string(), z.record(z.unknown())]).optional(),
  previousOutput: z.string().optional(),
  style: z.string().optional(),
  maxLength: z.number().int().positive().optional(),
  provider: z.string().optional(),
  model: z.string().optional(),
});

export const webFetchSchema = z.object({
  url: z.string().min(1).describe('http(s) URL to fetch'),
  maxBytes: z.number().int().positive().max(5_242_880).optional().describe('Cap response size; default 1 MB'),
});

export const webSearchSchema = z.object({
  query: z.string().min(1).describe('Search query'),
  maxResults: z.number().int().positive().max(20).optional().describe('Max results to return, default 5'),
});
