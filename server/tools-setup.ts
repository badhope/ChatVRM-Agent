import type { ILLMPort } from '../src/ports/llm.port.js';
import type { IStoragePort } from '../src/ports/storage.port.js';
import type { IMemoryPort } from '../src/ports/memory.port.js';
import type { IShellPort } from '../src/ports/shell.port.js';
import type { IConfigPort } from '../src/ports/config.port.js';
import type { IToolsPort } from '../src/ports/tools.port.js';
import type { ProviderType } from '../src/ports/config.port.js';
import { sandboxPath } from '../src/shared/sandbox.js';
import { z } from 'zod';
import { WebClient } from '../src/integration/web-client.js';
// L13 (W18): shared zod schemas for the default tool set. The CLI
// (`src/cli/index.ts`) and the server both register the same tools;
// the schemas used to live in two parallel copies. We keep the
// document / chart / report schemas (wordProcess, excelRead,
// chartGenerate, reportBuild, etc.) defined locally because the CLI
// does not register those tools.
import {
  writeFileSchema,
  readFileSchema,
  shellSchema,
  searchSchema,
  rememberSchema,
  analyzeSchema,
  respondSchema,
  webFetchSchema,
  webSearchSchema,
} from '../src/agents/tool-defs.js';

// ----- zod schemas for the default tool set -----
// The ReAct agent only forwards tools that declare an `inputSchema`
// to the LLM. Without these, the agent throws "no tools with
// inputSchema registered" and we fall back to the prompt-only
// heuristic in agents-runtime.routes.ts. Adding zod schemas to
// every default tool makes native function-calling actually
// usable.
// L13 (W18): writeFileSchema, readFileSchema, shellSchema,
// searchSchema, rememberSchema, analyzeSchema, respondSchema,
// webFetchSchema, webSearchSchema now live in
// `src/agents/tool-defs.ts` and are imported above. Document
// / chart / report tools stay here because the CLI does not
// register them.


const wordProcessSchema = z.object({
  op: z.enum(['read', 'create', 'append', 'replace', 'info', 'search', 'to-text']),
  path: z.string().min(1).optional(),
  output: z.string().min(1).optional(),
  find: z.string().optional(),
  replaceWith: z.string().optional(),
  query: z.string().optional(),
  regex: z.boolean().optional(),
  heading: z.string().optional(),
  headingLevel: z.number().int().min(1).max(6).optional(),
  content: z.string().optional(),
  text: z.string().optional(),
  body: z.string().optional(),
  title: z.string().optional(),
  table: z.string().optional(),
  cell: z.string().optional(),
  paragraph: z.string().optional(),
  paragraphCount: z.number().int().positive().optional(),
});

const excelReadSchema = z.object({
  path: z.string().min(1),
  sheet: z.string().optional(),
});

const excelListSchema = z.object({
  path: z.string().min(1),
});

const pdfReadSchema = z.object({
  path: z.string().min(1),
});

const chartGenerateSchema = z.object({
  x: z.string().min(1).describe('Comma-separated x labels'),
  series: z.string().min(1).describe('Pipe-separated series, e.g. "A=1,2,3|B=4,5,6"'),
  output: z.string().min(1),
  title: z.string().optional(),
  ylabel: z.string().optional(),
});

const chartBarSchema = z.object({
  x: z.string().min(1),
  y: z.string().min(1).describe('Comma-separated y values'),
  output: z.string().min(1),
  title: z.string().optional(),
  ylabel: z.string().optional(),
});

const reportBuildSchema = z.object({
  uploads: z.string().min(1).describe('Folder containing source files'),
  out: z.string().optional(),
  charts: z.string().optional(),
  company: z.string().optional(),
  quarter: z.string().optional(),
});

/** Cap on stderr / stdout we forward back to the agent. */
const PY_STDERR_CAP = 4_000;
const PY_STDOUT_CAP = 256_000;

/** Truncate a long string with a marker so the LLM can see it was clipped. */
function truncate(s: string, cap: number): string {
  if (s.length <= cap) return s;
  return s.slice(0, cap) + `\n... [truncated ${s.length - cap} chars]`;
}

/**
 * Parse the python script's stdout. The scripts always emit a single
 * JSON object on success, so we surface parsed data when valid; if
 * parsing fails we still return the raw truncated text so the agent
 * can see what happened. The function never throws — invalid JSON is
 * a tool-level error, not a system-level one.
 */
function parsePythonStdout(stdout: string): { json: unknown | null; raw: string } {
  const raw = truncate(stdout, PY_STDOUT_CAP);
  const trimmed = raw.trim();
  if (trimmed.length === 0) return { json: null, raw };
  // Python may emit *some* stderr noise on stdout when warnings are
  // unbuffered. Find the first `{` or `[` and try to parse from there.
  const start = trimmed[0] === '{' || trimmed[0] === '[' ? 0 : trimmed.search(/[{[]/);
  if (start === -1) return { json: null, raw };
  const candidate = trimmed.slice(start);
  try {
    return { json: JSON.parse(candidate) as unknown, raw };
  } catch {
    return { json: null, raw };
  }
}

interface Tools {
  llm: ILLMPort;
  storage: IStoragePort;
  memory: IMemoryPort;
  shell: IShellPort;
  config: IConfigPort;
  tools: IToolsPort;
}

export function registerDefaultTools(opts: Tools): void {
  const { llm, storage, memory, shell, config, tools } = opts;

  // helper: parse args with a zod schema, returning a graceful error
  // so a malformed LLM call never throws out of the agent.
  const parseArgs = <T>(schema: z.ZodType<T>, raw: Record<string, unknown>): { ok: true; args: T } | { ok: false; error: string } => {
    const parsed = schema.safeParse(raw);
    if (parsed.success) return { ok: true, args: parsed.data };
    return { ok: false, error: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') };
  };

  // Single WebClient instance per registry. Keeps the DNS cache warm
  // and lets tests inject a stub.
  const web = new WebClient();

  // The web tools are *the* gap W16 surfaced: the project shipped with
  // zero internet access, so the LLM hallucinated on every
  // current-events question. webFetch runs SSRF checks
  // (private/loopback/`.local` denied, IP literals checked twice to
  // defeat DNS-rebinding) and caps responses at 1 MB so a malicious
  // site can't OOM the agent. webSearch uses DuckDuckGo's HTML
  // endpoint so no API key is required; a future PR can add a
  // BRAVE_API_KEY path via WebClient options.
  tools.register({
    name: 'webFetch',
    description: 'Fetch a URL over HTTP(S) and return its body as plain text. Private IPs, loopback, .local, and .internal hostnames are refused to prevent SSRF.',
    inputSchema: webFetchSchema,
    handler: async (args) => {
      const parsed = parseArgs(webFetchSchema, args);
      if (!parsed.ok) return { success: false, error: parsed.error };
      const v = parsed.args as { url: string; maxBytes?: number };
      // M15 (W18): run the trust gate over the URL *and* the
      // post-fetch body. The URL gate is a quick pre-check for
      // known prompt-injection markers hidden in the query
      // string (e.g. `?cmd=ignore%20previous%20instructions`),
      // and the body gate runs after the fetch so an injected
      // payload that arrived over a clean URL doesn't slip
      // through. The body gate is opt-in via a non-throwing
      // summary: it never blocks the fetch, but the result
      // includes the trust verdict so the execute stage can
      // surface it to the user / apply its own post-fetch
      // policy. H14 (W18) made `strict: true` the default,
      // so we no longer need to pass it explicitly.
      const { TrustService } = await import('../src/domain/trust/trust.service.js');
      const urlVerdict = TrustService.evaluate(v.url, { intent: 'webFetch url', toolUsed: 'webFetch' });
      if (TrustService.shouldConfirm(urlVerdict)) {
        return { success: false, error: `Trust gate refused URL: ${urlVerdict.summary}` };
      }
      const result = await web.fetch(v.url, v.maxBytes ? { maxBytes: v.maxBytes } : {});
      if (!result.ok) {
        return { success: false, error: result.error };
      }
      const bodyVerdict = TrustService.evaluate(result.text.slice(0, 8_000), { intent: 'webFetch body', toolUsed: 'webFetch' });
      const warnSuffix = TrustService.shouldConfirm(bodyVerdict)
        ? `\n\n[trust-warning] body: ${bodyVerdict.summary}`
        : '';
      return {
        success: true,
        output: `URL: ${result.url}\nFinal URL: ${result.finalUrl}\nStatus: ${result.status}\nContent-Type: ${result.contentType}\n\n${result.text}${warnSuffix}`,
      };
    },
  });

  tools.register({
    name: 'webSearch',
    description: 'Search the public web and return up to N results (title, url, snippet). No API key required.',
    inputSchema: webSearchSchema,
    handler: async (args) => {
      const parsed = parseArgs(webSearchSchema, args);
      if (!parsed.ok) return { success: false, error: parsed.error };
      const v = parsed.args as { query: string; maxResults?: number };
      const result = await web.search(v.query, v.maxResults ? { maxResults: v.maxResults } : {});
      if (!result.ok) {
        return { success: false, error: result.error };
      }
      if (result.results.length === 0) {
        return { success: true, output: 'No results.' };
      }
      const lines = result.results.map((r, i) => `[${i + 1}] ${r.title}\n    ${r.url}\n    ${r.snippet}`);
      return { success: true, output: lines.join('\n\n') };
    },
  });

  tools.register({
    name: 'wordProcess',
    description:
      'Process .docx files via the Python word_process.py engine. ' +
      'Args: op (read|create|append|replace|info|search|to-text), path/output/find/replaceWith/query/heading/content/... — see the python script for the full schema.',
    inputSchema: wordProcessSchema,
    handler: async (args) => {
      const { spawn } = await import('node:child_process');
      const { existsSync } = await import('node:fs');
      const { fileURLToPath } = await import('node:url');
      const { dirname, resolve: resolvePath } = await import('node:path');
      const __dirname = dirname(fileURLToPath(import.meta.url));
      const pyScript = resolvePath(__dirname, '..', 'scripts', 'word_process.py');
      if (!existsSync(pyScript)) {
        return { success: false, error: `Python script not found: ${pyScript}` };
      }
      const op = (args.op as string) ?? '';
      if (!op) return { success: false, error: 'op is required (read|create|append|replace|info|search|to-text)' };
      // Defense-in-depth: even though the zod schema on this tool
      // restricts `op` to the seven whitelisted values, the python
      // script also accepts a positional subcommand, and we'd rather
      // catch a stray value at the boundary than trust a single
      // layer of validation.
      const ALLOWED_OPS = new Set(['read', 'create', 'append', 'replace', 'info', 'search', 'to-text']);
      if (!ALLOWED_OPS.has(op)) {
        return { success: false, error: `op "${op}" is not in the whitelist: ${[...ALLOWED_OPS].join(', ')}` };
      }
      // Build CLI args from the tool call. Map camelCase → kebab-case for python.
      const argMap: Record<string, string> = {
        output: '--output',
        find: '--find',
        replaceWith: '--replace-with',
        query: '--query',
        regex: '--regex',
        heading: '--heading',
        headingLevel: '--heading-level',
        content: '--content',
        text: '--text',
        body: '--body',
        title: '--title',
        table: '--table',
        cell: '--cell',
        paragraph: '--paragraph',
        paragraphCount: '--paragraph-count',
      };
      const cliArgs: string[] = [pyScript, op];
      // The execute stage automatically injects `input`, `message`, `context`,
      // and `previousOutput` into every tool call. Those are bookkeeping fields
      // and are not part of the wordProcess schema — skip them so we don't
      // pass stray --input / --context [object Object] to the python script.
      //
      // `path` and `output` are also skipped here because the python
      // script declares them as *positional* args (e.g. `p.add_argument("path")`),
      // and we forward them as positional via `sandboxPath` below. Pushing
      // them as `--path` flags here would produce "unrecognized argument: --path".
      const STAGE_INJECTED = new Set(['input', 'message', 'context', 'previousOutput']);
      const POSITIONAL_KEYS = new Set(['path', 'output']);
      for (const [k, v] of Object.entries(args)) {
        if (k === 'op' || STAGE_INJECTED.has(k) || POSITIONAL_KEYS.has(k) || v === undefined || v === null) continue;
        const flag = argMap[k] ?? `--${k.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase())}`;
        if (typeof v === 'boolean') {
          if (v) cliArgs.push(flag);
        } else {
          cliArgs.push(flag, String(v));
        }
      }
      // path/output positional for ops that need it (sandboxed)
      // H4 (W19): the sandbox module supports an `allowAbsolute` mode
      // that re-checks the resolved path against the configured
      // workspace-roots allowlist (PA_WORKSPACE_ROOTS) — that check
      // was previously dead code because every tool here called
      // `sandboxPath(path)` without the option, so the allowlist
      // branch in sandbox.ts was unreachable. We now opt in, so a
      // user who points wordProcess at `/srv/data/foo.docx` is
      // explicitly vetted against the allowlist. The default
      // behaviour for non-allow-listed callers is still to reject
      // (the sandbox still returns `ok: false` for paths that don't
      // resolve under the configured root).
      //
      // H9 (W19): explicit mutual-exclusion check. The old code
      // silently dropped `output` when both `path` and `output`
      // were set, because the `if/else` branch only kept the
      // first one. A user who passes both is almost certainly
      // confused (or, worse, the second value was meant to be a
      // separate flag). We now return a 400-style error explaining
      // the conflict instead of letting one path be ignored.
      if (typeof args.path === 'string' && typeof args.output === 'string') {
        return { success: false, error: 'wordProcess: pass either `path` or `output`, not both' };
      }
      if (typeof args.path === 'string') {
        const safe = sandboxPath(args.path, { allowAbsolute: true });
        if (!safe.ok) return { success: false, error: safe.error };
        cliArgs.push(safe.resolved);
      } else if (typeof args.output === 'string') {
        const safe = sandboxPath(args.output, { allowAbsolute: true });
        if (!safe.ok) return { success: false, error: safe.error };
        cliArgs.push(safe.resolved);
      }
      // M2 (W19): a per-tool AbortController that we link to the
      // executor stage's signal via the agent pipeline. The agent
      // stage passes a signal to the tool handler; we honour it
      // by killing the python child (and its process group) when
      // the user aborts the run. Without this, a long python
      // script keeps running for 60s after the user has
      // disconnected — the timeout above is the only cleanup
      // path, and that timer doesn't start until the request
      // reaches us.
      const abortController = new AbortController();
      const maybeSignal = (args as { signal?: AbortSignal }).signal;
      if (maybeSignal) {
        if (maybeSignal.aborted) {
          return { success: false, error: 'wordProcess: aborted before start' };
        }
        maybeSignal.addEventListener('abort', () => {
          try { abortController.abort(); } catch { /* ignore */ }
        }, { once: true });
      }
      return await new Promise<{ success: boolean; output?: string; error?: string }>((res) => {
        // `detached: true` makes the child a process-group leader on
        // POSIX. We then signal the negative PID to kill the whole
        // group, so a Python script that itself shells out (e.g.
        // `chartGenerate` spawning matplotlib with a temp file) is
        // reaped on timeout instead of leaking.
        const proc = spawn('python3', cliArgs, { stdio: ['ignore', 'pipe', 'pipe'], detached: true });
        let stdout = '';
        let stderr = '';
        proc.stdout.on('data', (d) => (stdout += d.toString()));
        proc.stderr.on('data', (d) => (stderr += d.toString()));
        const killGroup = () => {
          if (proc.pid !== undefined) {
            try {
              process.kill(-proc.pid, 'SIGKILL');
            } catch {
              try { proc.kill('SIGKILL'); } catch { /* already gone */ }
            }
          }
        };
        const timer = setTimeout(() => {
          killGroup();
          res({ success: false, error: `wordProcess timed out after 60s` });
        }, 60_000);
        // M2 (W19): if the local AbortController is signalled
        // (because the agent or HTTP client disconnected), kill
        // the child immediately and resolve with a clean error
        // rather than waiting for the 60s timeout.
        let aborted = false;
        abortController.signal.addEventListener('abort', () => {
          if (aborted) return;
          aborted = true;
          killGroup();
          res({ success: false, error: 'wordProcess: aborted by caller' });
        });
        proc.on('close', (code) => {
          clearTimeout(timer);
          if (aborted) return; // already resolved
          if (code === 0) {
            // word_process.py always returns a JSON payload on
            // stdout. Surface the parsed object so the agent can
            // read `paragraphs`, `tables`, etc. without re-parsing.
            const parsed = parsePythonStdout(stdout);
            res({ success: true, output: parsed.json !== null ? JSON.stringify(parsed.json) : parsed.raw });
          } else {
            // Try to surface the JSON error from the python script
            const parsed = parsePythonStdout(stdout);
            const errMsg = parsed.json && typeof parsed.json === 'object' && parsed.json !== null && 'error' in parsed.json
              ? String((parsed.json as { error: unknown }).error)
              : null;
            res({
              success: false,
              error: errMsg ?? truncate(stderr || stdout || `exit ${code}`, PY_STDERR_CAP),
              output: parsed.raw,
            });
          }
        });
        proc.on('error', (err) => {
          clearTimeout(timer);
          if (aborted) return;
          res({ success: false, error: `spawn failed: ${err.message}` });
        });
      });
    },
  });

  // ----------------------------- Data tools ----------------------------- //
  // Each data tool = a small wrapper that spawns fin_data_tools.py with a
  // specific subcommand, forwarding the rest of the args. We filter out
  // bookkeeping fields the execute stage auto-injects.
  const registerPySubTool = (toolName: string, subcommand: string, description: string, schema: z.ZodTypeAny) => {
    tools.register({
      name: toolName,
      description,
      inputSchema: schema,
      handler: async (args) => {
        const { spawn } = await import('node:child_process');
        const { existsSync } = await import('node:fs');
        const { fileURLToPath } = await import('node:url');
        const { dirname, resolve: resolvePath } = await import('node:path');
        const __dirname = dirname(fileURLToPath(import.meta.url));
        const pyScript = resolvePath(__dirname, '..', 'scripts', 'fin_data_tools.py');
        if (!existsSync(pyScript)) {
          return { success: false, error: `Python script not found: ${pyScript}` };
        }
        const STAGE_INJECTED = new Set(['input', 'message', 'context', 'previousOutput']);
        const argMap: Record<string, string> = {
          path: '--path', sheet: '--sheet', uploads: '--uploads', out: '--out', charts: '--charts',
          company: '--company', quarter: '--quarter',
          x: '--x', y: '--y', series: '--series', output: '--output', title: '--title', ylabel: '--ylabel',
        };
        // Arg keys whose values are filesystem paths and must be sandboxed
        // to the workspace root before being forwarded to the python script.
        const PATH_KEYS = new Set(['path', 'output', 'uploads', 'out', 'charts']);
        const cliArgs: string[] = [pyScript, subcommand];
        for (const [k, v] of Object.entries(args)) {
          if (STAGE_INJECTED.has(k) || v === undefined || v === null) continue;
          const flag = argMap[k] ?? `--${k.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase())}`;
          if (typeof v === 'boolean') {
            if (v) cliArgs.push(flag);
          } else if (Array.isArray(v)) {
            cliArgs.push(flag, v.join(','));
          } else {
            if (PATH_KEYS.has(k) && typeof v === 'string') {
              // H4 (W19): see the comment on the wordProcess path/output
              // branch — we pass `allowAbsolute: true` so the allowlist
              // check in sandbox.ts actually runs.
              const safe = sandboxPath(v, { allowAbsolute: true });
              if (!safe.ok) return { success: false, error: safe.error };
              cliArgs.push(flag, safe.resolved);
            } else {
              cliArgs.push(flag, String(v));
            }
          }
        }
        return await new Promise<{ success: boolean; output?: string; error?: string }>((res) => {
          // See wordProcess above: detached + negative-PID kill so a
          // python script that spawns its own subprocesses is reaped
          // cleanly on timeout.
          const proc = spawn('python3', cliArgs, { stdio: ['ignore', 'pipe', 'pipe'], detached: true });
          let stdout = '';
          let stderr = '';
          proc.stdout.on('data', (d) => (stdout += d.toString()));
          proc.stderr.on('data', (d) => (stderr += d.toString()));
          const killGroup = () => {
            if (proc.pid !== undefined) {
              try {
                process.kill(-proc.pid, 'SIGKILL');
              } catch {
                try { proc.kill('SIGKILL'); } catch { /* already gone */ }
              }
            }
          };
          const timer = setTimeout(() => {
            killGroup();
            res({ success: false, error: `${toolName} timed out` });
          }, 120_000);
          proc.on('close', (code) => {
            clearTimeout(timer);
            if (code === 0) {
              const parsed = parsePythonStdout(stdout);
              res({ success: true, output: parsed.json !== null ? JSON.stringify(parsed.json) : parsed.raw });
            } else {
              const parsed = parsePythonStdout(stdout);
              const errMsg = parsed.json && typeof parsed.json === 'object' && parsed.json !== null && 'error' in parsed.json
                ? String((parsed.json as { error: unknown }).error)
                : null;
              res({
                success: false,
                error: errMsg ?? truncate(stderr || stdout || `exit ${code}`, PY_STDERR_CAP),
                output: parsed.raw,
              });
            }
          });
          proc.on('error', (err) => {
            clearTimeout(timer);
            res({ success: false, error: `spawn failed: ${err.message}` });
          });
        });
      },
    });
  };

  registerPySubTool(
    'excelRead',
    'excel-read',
    'Read an .xlsx file. Args: path (required), sheet (optional). Returns JSON {rows: [...]} with all non-empty rows as arrays of strings.',
    excelReadSchema,
  );
  registerPySubTool(
    'excelList',
    'excel-list',
    'List sheet names of an .xlsx file. Args: path (required). Returns JSON {sheets: [...]}',
    excelListSchema,
  );
  registerPySubTool(
    'pdfRead',
    'pdf-read',
    'Extract text from a .pdf file. Args: path (required). Returns JSON {pages:[{page,text}], full_text}',
    pdfReadSchema,
  );
  registerPySubTool(
    'chartGenerate',
    'chart-line',
    'Generate a line chart PNG with matplotlib. Args: x (comma labels), series ("name=v1,v2|v2=v1,v2"), output (PNG path), title?, ylabel?',
    chartGenerateSchema,
  );
  registerPySubTool(
    'chartBar',
    'chart-bar',
    'Generate a bar chart PNG. Args: x (comma labels), y (comma values), output (PNG path), title?, ylabel?',
    chartBarSchema,
  );
  registerPySubTool(
    'reportBuild',
    'report-build',
    'Build a full financial report bundle (Markdown + Word + PDF + PPT) from a folder of source files. ' +
    'Args: uploads (required folder), out (default e2e-output/fin-report/reports), charts (default e2e-output/fin-report/charts), company, quarter.',
    reportBuildSchema,
  );

  tools.register({
    name: 'writeFile',
    description: 'Write content to a file',
    inputSchema: writeFileSchema,
    handler: async (args) => {
      const parsed = parseArgs(writeFileSchema, args);
      if (!parsed.ok) return { success: false, error: parsed.error };
      const v = parsed.args as { path?: string; filePath?: string; content?: string; previousOutput?: string };
      const filePath = v.filePath ?? v.path ?? '';
      const explicitContent = v.content ?? '';
      const previousOutput = v.previousOutput ?? '';
      const content = explicitContent && explicitContent.length > 0 ? explicitContent : previousOutput;
      if (!filePath) return { success: false, error: 'filePath is required' };
      if (!content) return { success: false, error: 'No content provided (neither args.content nor previous step output)' };
      // H4 (W19): opt in to the absolute-path allowlist branch so an
      // operator-configured PA_WORKSPACE_ROOTS is actually consulted
      // when the tool is given an absolute path. Without this the
      // sandbox was effectively a "workspace-root only" check.
      const safe = sandboxPath(filePath, { allowAbsolute: true });
      if (!safe.ok) return { success: false, error: safe.error };
      await storage.write(safe.resolved, content);
      return { success: true, output: `Written ${content.length} bytes to ${safe.resolved}` };
    },
  });

  tools.register({
    name: 'readFile',
    description: 'Read the contents of a file',
    inputSchema: readFileSchema,
    handler: async (args) => {
      const parsed = parseArgs(readFileSchema, args);
      if (!parsed.ok) return { success: false, error: parsed.error };
      const v = parsed.args as { path?: string; filePath?: string };
      const filePath = v.filePath ?? v.path ?? '';
      if (!filePath) return { success: false, error: 'filePath is required' };
      // H4 (W19): see writeFile above — pass `allowAbsolute: true`
      // so the operator-configured workspace-root allowlist is
      // consulted.
      const safe = sandboxPath(filePath, { allowAbsolute: true });
      if (!safe.ok) return { success: false, error: safe.error };
      if (!(await storage.exists(safe.resolved))) {
        return { success: false, error: `File not found: ${filePath}` };
      }
      const content = await storage.read(safe.resolved);
      return { success: true, output: content };
    },
  });

  tools.register({
    name: 'shell',
    description: 'Execute a shell command',
    inputSchema: shellSchema,
    handler: async (args) => {
      const parsed = parseArgs(shellSchema, args);
      if (!parsed.ok) return { success: false, error: parsed.error };
      const v = parsed.args as { command: string; timeout?: number };
      const command = v.command;
      const timeoutMs = v.timeout ?? 60_000;
      if (!command) return { success: false, error: 'command is required' };
      const result = await shell.execute(command, { timeout: timeoutMs });
      return {
        success: result.exitCode === 0,
        output: result.stdout,
        error: result.exitCode !== 0 ? result.stderr : undefined,
      };
    },
  });

  tools.register({
    name: 'search',
    description: 'Search memory for a query',
    inputSchema: searchSchema,
    handler: async (args) => {
      const pattern = (args.pattern as string) ?? (args.query as string) ?? '';
      const memoryResults = await memory.recall(pattern, 5);
      const lines = memoryResults.map((r) => `[${r.id.slice(0, 8)}] ${r.input} → ${r.output.slice(0, 80)}`);
      return { success: true, output: lines.length > 0 ? lines.join('\n') : 'No matches' };
    },
  });

  tools.register({
    name: 'remember',
    description: 'Store an entry in long-term memory',
    inputSchema: rememberSchema,
    handler: async (args) => {
      const input = (args.input as string) ?? '';
      const output = (args.output as string) ?? (args.content as string) ?? '';
      const provider = (args.provider as ProviderType) ?? (await config.getDefaultProvider());
      await memory.remember({
        input,
        output,
        provider,
        model: (args.model as string) ?? 'default',
        tags: Array.isArray(args.tags) ? (args.tags as string[]) : ['tool'],
      });
      return { success: true, output: `Remembered: "${input.slice(0, 60)}"` };
    },
  });

  tools.register({
    name: 'analyze',
    description: 'Use the LLM to analyze text',
    inputSchema: analyzeSchema,
    handler: async (args) => {
      const text = (args.text as string) ?? (args.target as string) ?? '';
      const instruction = (args.instruction as string) ?? 'Summarize the following text:';
      const provider = (args.provider as ProviderType) ?? (await config.getDefaultProvider());
      const model = (args.model as string) ?? (await config.getChatConfig())?.model ?? undefined;
      const response = await llm.chat({
        provider,
        model,
        messages: [
          { role: 'system', content: 'You are a precise text analyzer.' },
          { role: 'user', content: `${instruction}\n\n${text}` },
        ],
        temperature: 0.3,
        maxTokens: 1024,
      });
      return { success: true, output: response.content };
    },
  });

  tools.register({
    name: 'respond',
    description: 'Generate a conversational response via the LLM',
    inputSchema: respondSchema,
    handler: async (args) => {
      const prompt = typeof args.prompt === 'string'
        ? args.prompt
        : typeof args.message === 'string'
        ? args.message
        : '';
      // The execute stage passes a structured context object; we need to
      // flatten it to a string before sending to the LLM because aliyun
      // (and the OpenAI-compatible API in general) require content to be
      // a string or an array of typed parts — never a plain object.
      const rawContext = args.context;
      let context: string;
      if (typeof rawContext === 'string') {
        context = rawContext;
      } else if (rawContext && typeof rawContext === 'object') {
        const obj = rawContext as Record<string, unknown>;
        const parts: string[] = [];
        if (obj.taskInput) parts.push(`Task input: ${obj.taskInput}`);
        if (obj.intent) parts.push(`Intent: ${obj.intent}`);
        if (obj.stepDescription) parts.push(`Current step: ${obj.stepDescription}`);
        if (obj.knowledgeContext) parts.push(`Knowledge context:\n${obj.knowledgeContext}`);
        if (obj.previousOutput) parts.push(`Previous step output:\n${obj.previousOutput}`);
        context = parts.join('\n\n');
      } else {
        context = '';
      }
      if (!context && typeof args.previousOutput === 'string') {
        context = args.previousOutput as string;
      }
      const provider = (args.provider as ProviderType) ?? (await config.getDefaultProvider());
      const model = (args.model as string) ?? (await config.getChatConfig())?.model ?? undefined;
      const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [];
      if (context) messages.push({ role: 'system', content: context });
      messages.push({ role: 'user', content: prompt });
      const response = await llm.chat({ provider, model, messages, temperature: 0.7, maxTokens: 1024 });
      return { success: true, output: response.content };
    },
  });
}
