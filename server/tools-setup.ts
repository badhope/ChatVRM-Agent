import type { ILLMPort } from '../src/ports/llm.port.js';
import type { IStoragePort } from '../src/ports/storage.port.js';
import type { IMemoryPort } from '../src/ports/memory.port.js';
import type { IShellPort } from '../src/ports/shell.port.js';
import type { IConfigPort } from '../src/ports/config.port.js';
import type { IToolsPort } from '../src/ports/tools.port.js';
import type { ProviderType } from '../src/ports/config.port.js';
import { sandboxPath } from '../src/shared/sandbox.js';

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

  tools.register({
    name: 'wordProcess',
    description:
      'Process .docx files via the Python word_process.py engine. ' +
      'Args: op (read|create|append|replace|info|search|to-text), path/output/find/replaceWith/query/heading/content/... — see the python script for the full schema.',
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
      const STAGE_INJECTED = new Set(['input', 'message', 'context', 'previousOutput']);
      for (const [k, v] of Object.entries(args)) {
        if (k === 'op' || STAGE_INJECTED.has(k) || v === undefined || v === null) continue;
        const flag = argMap[k] ?? `--${k.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase())}`;
        if (typeof v === 'boolean') {
          if (v) cliArgs.push(flag);
        } else {
          cliArgs.push(flag, String(v));
        }
      }
      // path/output positional for ops that need it
      if (typeof args.path === 'string') {
        const safe = sandboxPath(args.path);
        if (!safe.ok) return { success: false, error: safe.error };
        cliArgs.push(safe.resolved);
      } else if (typeof args.output === 'string') {
        const safe = sandboxPath(args.output);
        if (!safe.ok) return { success: false, error: safe.error };
        cliArgs.push(safe.resolved);
      }
      return await new Promise<{ success: boolean; output?: string; error?: string }>((res) => {
        const proc = spawn('python3', cliArgs, { stdio: ['ignore', 'pipe', 'pipe'] });
        let stdout = '';
        let stderr = '';
        proc.stdout.on('data', (d) => (stdout += d.toString()));
        proc.stderr.on('data', (d) => (stderr += d.toString()));
        const timer = setTimeout(() => {
          proc.kill('SIGKILL');
          res({ success: false, error: `wordProcess timed out after 60s` });
        }, 60_000);
        proc.on('close', (code) => {
          clearTimeout(timer);
          if (code === 0) {
            res({ success: true, output: stdout });
          } else {
            // Try to surface the JSON error from the python script
            try {
              const j = JSON.parse(stdout);
              res({ success: false, error: j.error ?? `exit ${code}`, output: stdout });
            } catch {
              res({ success: false, error: stderr || stdout || `exit ${code}` });
            }
          }
        });
        proc.on('error', (err) => {
          clearTimeout(timer);
          res({ success: false, error: `spawn failed: ${err.message}` });
        });
      });
    },
  });

  // ----------------------------- Data tools ----------------------------- //
  // Each data tool = a small wrapper that spawns fin_data_tools.py with a
  // specific subcommand, forwarding the rest of the args. We filter out
  // bookkeeping fields the execute stage auto-injects.
  const registerPySubTool = (toolName: string, subcommand: string, description: string) => {
    tools.register({
      name: toolName,
      description,
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
              const safe = sandboxPath(v);
              if (!safe.ok) return { success: false, error: safe.error };
              cliArgs.push(flag, safe.resolved);
            } else {
              cliArgs.push(flag, String(v));
            }
          }
        }
        return await new Promise<{ success: boolean; output?: string; error?: string }>((res) => {
          const proc = spawn('python3', cliArgs, { stdio: ['ignore', 'pipe', 'pipe'] });
          let stdout = '';
          let stderr = '';
          proc.stdout.on('data', (d) => (stdout += d.toString()));
          proc.stderr.on('data', (d) => (stderr += d.toString()));
          const timer = setTimeout(() => {
            proc.kill('SIGKILL');
            res({ success: false, error: `${toolName} timed out` });
          }, 120_000);
          proc.on('close', (code) => {
            clearTimeout(timer);
            if (code === 0) {
              res({ success: true, output: stdout });
            } else {
              try {
                const j = JSON.parse(stdout);
                res({ success: false, error: j.error ?? `exit ${code}`, output: stdout });
              } catch {
                res({ success: false, error: stderr || stdout || `exit ${code}` });
              }
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
  );
  registerPySubTool(
    'excelList',
    'excel-list',
    'List sheet names of an .xlsx file. Args: path (required). Returns JSON {sheets: [...]}',
  );
  registerPySubTool(
    'pdfRead',
    'pdf-read',
    'Extract text from a .pdf file. Args: path (required). Returns JSON {pages:[{page,text}], full_text}',
  );
  registerPySubTool(
    'chartGenerate',
    'chart-line',
    'Generate a line chart PNG with matplotlib. Args: x (comma labels), series ("name=v1,v2|v2=v1,v2"), output (PNG path), title?, ylabel?',
  );
  registerPySubTool(
    'chartBar',
    'chart-bar',
    'Generate a bar chart PNG. Args: x (comma labels), y (comma values), output (PNG path), title?, ylabel?',
  );
  registerPySubTool(
    'reportBuild',
    'report-build',
    'Build a full financial report bundle (Markdown + Word + PDF + PPT) from a folder of source files. ' +
    'Args: uploads (required folder), out (default e2e-output/fin-report/reports), charts (default e2e-output/fin-report/charts), company, quarter.',
  );

  tools.register({
    name: 'writeFile',
    description: 'Write content to a file',
    handler: async (args) => {
      const filePath = (args.filePath as string) ?? (args.path as string);
      const explicitContent = (args.content as string) ?? '';
      const previousOutput = (args.previousOutput as string) ?? '';
      const content = explicitContent && explicitContent.length > 0 ? explicitContent : previousOutput;
      if (!filePath) return { success: false, error: 'filePath is required' };
      if (!content) return { success: false, error: 'No content provided (neither args.content nor previous step output)' };
      const safe = sandboxPath(filePath);
      if (!safe.ok) return { success: false, error: safe.error };
      await storage.write(safe.resolved, content);
      return { success: true, output: `Written ${content.length} bytes to ${safe.resolved}` };
    },
  });

  tools.register({
    name: 'readFile',
    description: 'Read the contents of a file',
    handler: async (args) => {
      const filePath = (args.filePath as string) ?? (args.path as string);
      if (!filePath) return { success: false, error: 'filePath is required' };
      const safe = sandboxPath(filePath);
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
    handler: async (args) => {
      const command = args.command as string;
      const timeoutMs = (args.timeout as number) ?? 60_000;
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
    handler: async (args) => {
      const text = (args.text as string) ?? '';
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
