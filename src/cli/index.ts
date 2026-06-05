#!/usr/bin/env node
import { Command } from 'commander';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout, exit } from 'node:process';
import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'eventemitter3';
import chalk from 'chalk';
import {
  ConfigAdapter,
  LLMAdapter,
  StorageAdapter,
  MemoryAdapter,
  ShellExecutor,
  ToolsRegistry,
  TrustServiceAdapter,
} from '../adapters/index.js';
import { createDefaultStages } from '../stages/index.js';
import { EmotionService } from '../domain/personality/emotion.service.js';
import { PersonalityService } from '../domain/personality/personality.service.js';
import type { ProviderType } from '../ports/config.port.js';
import type { ChatResponse } from '../ports/llm.port.js';
import type { PipelineContext, PipelineEvents } from '../core/types.js';
import { sandboxPath } from '../shared/sandbox.js';
import { z } from 'zod';
import { WebClient } from '../integration/web-client.js';

// Same zod schemas as the server. The CLI and the server register the
// same default tools; if we used different (or no) schemas the ReAct
// agent would only see schemas in server mode, leaving CLI runs to
// fall back to the prompt-only path.
const writeFileSchema = z.object({
  path: z.string().min(1).optional(),
  filePath: z.string().min(1).optional(),
  content: z.string().optional(),
  previousOutput: z.string().optional(),
});
const readFileSchema = z.object({
  path: z.string().min(1).optional(),
  filePath: z.string().min(1).optional(),
});
const shellSchema = z.object({
  command: z.string().min(1),
  timeout: z.number().int().positive().optional(),
});
const searchSchema = z.object({
  pattern: z.string().optional(),
  query: z.string().optional(),
});
const rememberSchema = z.object({
  input: z.string().min(1).optional(),
  output: z.string().optional(),
  content: z.string().optional(),
  provider: z.string().optional(),
  tags: z.array(z.string()).optional(),
});
const analyzeSchema = z.object({
  text: z.string().optional(),
  target: z.string().optional(),
  detail: z.string().optional(),
});
const respondSchema = z.object({
  input: z.string().optional(),
  message: z.string().optional(),
  style: z.string().optional(),
  maxLength: z.number().int().positive().optional(),
});

const webFetchSchema = z.object({
  url: z.string().min(1),
  maxBytes: z.number().int().positive().max(5_242_880).optional(),
});
const webSearchSchema = z.object({
  query: z.string().min(1),
  maxResults: z.number().int().positive().max(20).optional(),
});

interface RegisterToolsOptions {
  llm: LLMAdapter;
  storage: StorageAdapter;
  memory: MemoryAdapter;
  shell: ShellExecutor;
  config: ConfigAdapter;
}

export function registerDefaultTools(opts: RegisterToolsOptions): ToolsRegistry {
  const tools = new ToolsRegistry();
  const { llm, storage, memory, shell, config } = opts;

  // The CLI registers the same web tools as the server. Without them
  // an `agent` command that needs current data can only hallucinate.
  const web = new WebClient();

  tools.register({
    name: 'webFetch',
    description: 'Fetch a URL over HTTP(S) and return its body as plain text. Private IPs and loopback hostnames are refused.',
    inputSchema: webFetchSchema,
    handler: async (args) => {
      const url = args.url as string;
      if (!url) return { success: false, error: 'url is required' };
      const result = await web.fetch(url, args.maxBytes ? { maxBytes: args.maxBytes as number } : {});
      if (!result.ok) return { success: false, error: result.error };
      return {
        success: true,
        output: `URL: ${result.url}\nFinal URL: ${result.finalUrl}\nStatus: ${result.status}\nContent-Type: ${result.contentType}\n\n${result.text}`,
      };
    },
  });

  tools.register({
    name: 'webSearch',
    description: 'Search the public web and return up to N results (title, url, snippet).',
    inputSchema: webSearchSchema,
    handler: async (args) => {
      const query = args.query as string;
      if (!query) return { success: false, error: 'query is required' };
      const result = await web.search(query, args.maxResults ? { maxResults: args.maxResults as number } : {});
      if (!result.ok) return { success: false, error: result.error };
      if (result.results.length === 0) return { success: true, output: 'No results.' };
      const lines = result.results.map((r, i) => `[${i + 1}] ${r.title}\n    ${r.url}\n    ${r.snippet}`);
      return { success: true, output: lines.join('\n\n') };
    },
  });

  tools.register({
    name: 'writeFile',
    description: 'Write content to a file',
    inputSchema: writeFileSchema,
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
    inputSchema: readFileSchema,
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
    inputSchema: shellSchema,
    handler: async (args) => {
      const command = args.command as string;
      const timeoutMs = (args.timeout as number) ?? 60_000;
      if (!command) return { success: false, error: 'command is required' };
      // CLI shell goes through the same ShellExecutor the agent pipeline
      // uses; if a trustService is wired into the executor the dangerous-
      // command check runs here too. The executor itself enforces the
      // allowlist env and timeout.
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
        model: 'manual',
        tags: Array.isArray(args.tags) ? (args.tags as string[]) : ['manual'],
      });
      return { success: true, output: 'Stored in memory' };
    },
  });

  tools.register({
    name: 'analyze',
    description: 'Use the LLM to analyze a target',
    inputSchema: analyzeSchema,
    handler: async (args) => {
      const target = (args.target as string) ?? (args.text as string) ?? '';
      const detail = (args.detail as string) ?? 'standard';
      const prompt = `Analyze the following target. Detail level: ${detail}\n\nTarget: ${target}\n\nProduce a structured report.`;
      const response = await llm.chat({ messages: [{ role: 'user', content: prompt }] });
      return { success: true, output: response.content };
    },
  });

  tools.register({
    name: 'respond',
    description: 'Generate a response using the LLM',
    inputSchema: respondSchema,
    handler: async (args) => {
      const input = (args.input as string) ?? (args.message as string) ?? '';
      const style = (args.style as string) ?? 'conversational';
      const maxLength = (args.maxLength as number) ?? 4000;
      const styleHint =
        style === 'code' ? 'Return code only, in a single fenced block.' :
        style === 'text' ? 'Return plain text content.' :
        style === 'conversational' ? 'Be conversational and concise.' :
        '';
      const prompt = `${styleHint}\nKeep response under ${maxLength} characters.\n\nUser: ${input}`;
      const response = await llm.chat({ messages: [{ role: 'user', content: prompt }] });
      return { success: true, output: response.content };
    },
  });

  return tools;
}

async function bootstrap(): Promise<{
  config: ConfigAdapter;
  llm: LLMAdapter;
  storage: StorageAdapter;
  memory: MemoryAdapter;
  shell: ShellExecutor;
  tools: ToolsRegistry;
  emitter: EventEmitter<PipelineEvents>;
}> {
  const config = new ConfigAdapter();
  await config.init();
  const llm = new LLMAdapter(config);
  const storage = new StorageAdapter();
  const memory = new MemoryAdapter();
  // CLI also requires a trust service. Wires the same dangerous-
  // command checks used by the server, so the CLI never spawns a
  // shell command the agent would have refused.
  const trust = new TrustServiceAdapter();
  const shell = new ShellExecutor({ trustService: trust });
  const tools = registerDefaultTools({ llm, storage, memory, shell, config });
  const emitter = new EventEmitter<PipelineEvents>();
  return { config, llm, storage, memory, shell, tools, emitter };
}

function setupEventForwarding(emitter: EventEmitter<PipelineEvents>): void {
  emitter.on('output', ({ text }) => {
    process.stdout.write(`  ${text}\n`);
  });
  emitter.on('llm:call', ({ provider, model, tokens }) => {
    process.stdout.write(`  ${chalk.cyan('🤖')} ${chalk.dim(`${provider}/${model} (${tokens ?? 0} tokens)`)}\n`);
  });
  emitter.on('stage:error', ({ stage, error }) => {
    process.stdout.write(`  ${chalk.red(`✗ error in ${stage}:`)} ${error.message}\n`);
  });
}

function getProviderHelp(): string {
  return [
    '  openai        OpenAI (api.openai.com)',
    '  anthropic     Anthropic Claude (api.anthropic.com)',
    '  google        Google Gemini (generativelanguage.googleapis.com)',
    '  deepseek      DeepSeek (api.deepseek.com)',
    '  siliconflow   SiliconFlow (api.siliconflow.cn) — default',
    '  aliyun        Alibaba Qwen (dashscope.aliyuncs.com)',
    '  zhipu         Zhipu GLM (open.bigmodel.cn)',
    '  baidu         Baidu Ernie (aip.baidubce.com)',
    '  ollama        Ollama local (localhost:11434)',
    '  lmstudio      LM Studio local (localhost:1234)',
  ].join('\n');
}

async function resolveApiKeyFromEnv(provider: ProviderType): Promise<string | undefined> {
  const envCandidates = [
    `PERSONAL_ASSISTANT_${provider.toUpperCase()}`,
    `${provider.toUpperCase()}_API_KEY`,
  ];
  for (const key of envCandidates) {
    const val = process.env[key];
    if (val && val.length > 0) return val;
  }
  return undefined;
}

async function main(): Promise<void> {
  const program = new Command();
  program
    .name('personal-assistant')
    .description('AI-powered personal assistant with pipeline architecture')
    .version('2.0.0');

  program
    .command('chat')
    .description('Start an interactive chat session')
    .option('-p, --provider <provider>', 'LLM provider (overrides config default)')
    .option('-m, --model <model>', 'Model identifier')
    .action(async (options) => {
      const { config, llm, memory, tools, emitter } = await bootstrap();
      const provider = (options.provider as ProviderType) ?? (await config.getDefaultProvider());
      let apiKey = await config.getApiKey(provider);
      if (!apiKey) apiKey = await resolveApiKeyFromEnv(provider);
      if (!apiKey && provider !== 'ollama' && provider !== 'lmstudio') {
        process.stdout.write(`${chalk.red('✗')} No API key configured for provider "${provider}".\n`);
        process.stdout.write(`Run: ${chalk.cyan('personal-assistant config set-key ' + provider + ' <YOUR_KEY>')}\n`);
        process.stdout.write(`Or set the env var: ${chalk.cyan(`PERSONAL_ASSISTANT_${provider.toUpperCase()}`)} / ${chalk.cyan(provider.toUpperCase() + '_API_KEY')}\n\n`);
        process.stdout.write(getProviderHelp() + '\n');
        exit(1);
      }
      await runChat({ provider, model: options.model, llm, config, memory, tools, emitter });
    });

  program
    .command('agent <task>')
    .description('Run a single task through the full pipeline')
    .option('-p, --provider <provider>', 'LLM provider (overrides config default)')
    .option('-m, --model <model>', 'Model identifier')
    .action(async (task, options) => {
      const { config, llm, storage, memory, shell, tools, emitter } = await bootstrap();
      const provider = (options.provider as ProviderType) ?? (await config.getDefaultProvider());
      let apiKey = await config.getApiKey(provider);
      if (!apiKey) apiKey = await resolveApiKeyFromEnv(provider);
      if (!apiKey && provider !== 'ollama' && provider !== 'lmstudio') {
        process.stdout.write(`${chalk.red('✗')} No API key configured for provider "${provider}".\n`);
        process.stdout.write(`Run: ${chalk.cyan('personal-assistant config set-key ' + provider + ' <YOUR_KEY>')}\n\n`);
        process.stdout.write(getProviderHelp() + '\n');
        exit(1);
      }
      await runAgent({ task, provider, model: options.model, llm, config, storage, memory, shell, tools, emitter });
    });

  const configCmd = program.command('config').description('Manage configuration');
  configCmd
    .command('show')
    .description('Show current configuration')
    .action(async () => {
      const { config } = await bootstrap();
      const all = await config.getAllConfig();
      const defaultProvider = await config.getDefaultProvider();
      process.stdout.write(`${chalk.bold('Configuration:')}\n`);
      process.stdout.write(`  Default provider: ${chalk.cyan(defaultProvider)}\n`);
      const keys = (all.apiKeys as Record<string, unknown>) ?? {};
      const configuredProviders = Object.keys(keys);
      process.stdout.write(`  Configured providers: ${configuredProviders.length > 0 ? configuredProviders.join(', ') : chalk.dim('(none)')}\n`);
    });

  configCmd
    .command('set-key <provider> [key]')
    .description('Set API key for a provider (pass key as 2nd arg or via stdin)')
    .action(async (provider, key) => {
      if (!key) {
        process.stdout.write(`Enter API key for ${provider}: `);
        const rl = createInterface({ input: stdin, output: stdout, terminal: false });
        for await (const line of rl) {
          key = line.trim();
          break;
        }
        rl.close();
      }
      if (!key) {
        process.stdout.write(`${chalk.red('✗')} No key provided.\n`);
        exit(1);
      }
      const { config } = await bootstrap();
      await config.setApiKey(provider as ProviderType, key);
      process.stdout.write(`${chalk.green('✓')} API key set for ${provider}.\n`);
    });

  configCmd
    .command('remove-key <provider>')
    .description('Remove API key for a provider')
    .action(async (provider) => {
      const { config } = await bootstrap();
      await config.removeApiKey(provider as ProviderType);
      process.stdout.write(`${chalk.green('✓')} Removed API key for ${provider}.\n`);
    });

  configCmd
    .command('set-default <provider>')
    .description('Set the default LLM provider')
    .action(async (provider) => {
      const { config } = await bootstrap();
      await config.setDefaultProvider(provider as ProviderType);
      process.stdout.write(`${chalk.green('✓')} Default provider set to ${provider}.\n`);
    });

  configCmd
    .command('providers')
    .description('List all supported LLM providers')
    .action(() => {
      process.stdout.write(`${chalk.bold('Supported providers:')}\n`);
      process.stdout.write(getProviderHelp() + '\n');
    });

  program
    .command('ingest <path>')
    .description('Ingest documents into the local vector store (chunk + embed + store)')
    .option('-o, --out <file>', 'Output vector store file', '~/.personal-assistant/vectors.json')
    .option('-b, --batch <size>', 'Embedding batch size', '32')
    .option('--tag <tag>', 'Source tag attached to every chunk')
    .action(async (target, options) => {
      const { IngestionPipeline } = await import('../integration/ingestion-pipeline.js');
      const { HashingEmbedder } = await import('../adapters/embedder.hashing.js');
      const { RecursiveTextChunker } = await import('../adapters/text-chunker.js');
      const { AutoLoader } = await import('../loaders/auto.loader.js');
      const { InMemoryVectorStore } = await import('../adapters/vector-store.memory.js');
      const { resolveEmbedDim } = await import('../config/embedder.js');
      const outPath = (options.out as string).replace(/^~/, process.env.HOME ?? '');
      // Use the same dim the server uses, so vectors ingested by the
      // CLI can be loaded by the server's `Runtime.loadVectors()`.
      const dim = resolveEmbedDim();
      const vectorStore = new InMemoryVectorStore(dim);
      const embedder = new HashingEmbedder({ dim });
      const chunker = new RecursiveTextChunker({ chunkSize: 500, chunkOverlap: 50 });
      const loader = new AutoLoader();
      const pipeline = new IngestionPipeline({ embedder, vectorStore, chunker, loader, sourceTag: options.tag });

      // Show progress on stderr to keep stdout clean for piping.
      const onProgress = (p: { stage: string; current?: number; total?: number; message?: string }) => {
        const pct = p.total && p.total > 0 ? ` (${p.current ?? 0}/${p.total})` : '';
        process.stderr.write(`[${p.stage}]${pct} ${p.message ?? ''}\n`);
      };

      try {
        const r = await pipeline.ingestPath(target, onProgress);
        // Persist to a JSON file so the user can pick it up later.
        await vectorStore.saveToFile(outPath);
        process.stdout.write(`${chalk.green('✓')} Ingested ${r.documents} document(s) → ${r.chunks} chunk(s) (${r.vectors} vector(s)). Saved to ${outPath}\n`);
        if (r.errors.length > 0) {
          process.stdout.write(`${chalk.yellow('!')} ${r.errors.length} error(s):\n`);
          for (const e of r.errors) process.stdout.write(`  - ${e.document}: ${e.error}\n`);
          exit(1);
        }
      } catch (err) {
        process.stderr.write(`${chalk.red('✗')} Ingestion failed: ${err instanceof Error ? err.message : String(err)}\n`);
        exit(1);
      }
    });

  await program.parseAsync(process.argv);
}

interface ChatCtx {
  provider: ProviderType;
  model?: string;
  llm: LLMAdapter;
  config: ConfigAdapter;
  memory: MemoryAdapter;
  tools: ToolsRegistry;
  emitter: EventEmitter<PipelineEvents>;
}

async function runChat(ctx: ChatCtx): Promise<void> {
  process.stdout.write(`\n${chalk.bold('🤖 Personal Assistant')} ${chalk.dim(`(${ctx.provider})`)}\n`);
  process.stdout.write(`${chalk.dim('Type /help for commands, /exit to quit')}\n\n`);

  const personality = PersonalityService.createDefaultIdentity();
  const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
    {
      role: 'system',
      content: `${PersonalityService.getPersonalityPrompt(personality)}\n\nBe direct, helpful, and warm. Respond in the user's language.`,
    },
  ];

  let emotion = EmotionService.createDefaultEmotion();

  const inputQueue: string[] = [];
  let pendingResolve: ((v: string) => void) | null = null;
  let closed = false;

  const rl = createInterface({ input: stdin, output: stdout, terminal: true });
  rl.on('line', (line) => {
    if (pendingResolve) {
      const r = pendingResolve;
      pendingResolve = null;
      r(line);
      return;
    }
    inputQueue.push(line);
  });
  rl.on('close', () => {
    closed = true;
    if (pendingResolve) {
      const r = pendingResolve;
      pendingResolve = null;
      r('__EOF__');
    }
  });

  const askQuestion = (): Promise<string> => {
    if (inputQueue.length > 0) return Promise.resolve(inputQueue.shift()!);
    if (closed) return Promise.resolve('__EOF__');
    return new Promise((resolve) => { pendingResolve = resolve; });
  };

  let turnCount = 0;
  let running = true;

  while (running) {
    process.stdout.write('  🧑 You: ');
    const input = await askQuestion();
    if (input === '__EOF__') break;
    if (!input.trim()) continue;

    if (input.startsWith('/')) {
      const cmd = input.trim().toLowerCase();
      if (cmd === '/exit' || cmd === '/quit') {
        running = false;
        break;
      }
      if (cmd === '/help') {
        process.stdout.write(`${chalk.dim('Commands: /exit /quit /help /emotion /clear')}\n`);
        continue;
      }
      if (cmd === '/emotion') {
        process.stdout.write(`${chalk.dim(`Current emotion: ${emotion.name} (${emotion.intensity}/100)`)}\n`);
        continue;
      }
      if (cmd === '/clear') {
        messages.length = 1;
        process.stdout.write(`${chalk.dim('Conversation cleared.')}\n`);
        continue;
      }
      process.stdout.write(`${chalk.dim(`Unknown command: ${cmd}`)}\n`);
      continue;
    }

    turnCount++;
    messages.push({ role: 'user', content: input });

    let response: ChatResponse;
    try {
      response = await ctx.llm.chat({
        provider: ctx.provider,
        model: ctx.model,
        messages,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      process.stdout.write(`\n  ${chalk.red('✗ LLM error:')} ${msg}\n\n`);
      messages.pop();
      continue;
    }

    messages.push({ role: 'assistant', content: response.content });
    process.stdout.write(`  🤖 Assistant: ${response.content}\n\n`);

    try {
      emotion = await EmotionService.onUserInteraction(input, emotion, ctx.llm);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      process.stdout.write(`  ${chalk.dim(`(emotion update skipped: ${msg})`)}\n`);
    }

    try {
      await ctx.memory.remember({
        input,
        output: response.content,
        provider: ctx.provider,
        model: ctx.model ?? 'default',
        tags: ['chat', emotion.name, `turn-${turnCount}`],
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      process.stdout.write(`  ${chalk.dim(`(memory write skipped: ${msg})`)}\n`);
    }
  }

  process.stdout.write(`\n${chalk.dim('👋 Goodbye!')}\n`);
  process.stdout.write(`${chalk.dim(`📊 Session: ${turnCount} turn(s), final emotion: ${emotion.name} (intensity ${emotion.intensity}/100)`)}\n`);
  rl.close();
}

interface AgentCtx {
  task: string;
  provider: ProviderType;
  model?: string;
  llm: LLMAdapter;
  config: ConfigAdapter;
  storage: StorageAdapter;
  memory: MemoryAdapter;
  shell: ShellExecutor;
  tools: ToolsRegistry;
  emitter: EventEmitter<PipelineEvents>;
}

async function runAgent(ctx: AgentCtx): Promise<void> {
  process.stdout.write(`\n${chalk.bold('🎯 Task:')} ${ctx.task}\n`);
  process.stdout.write(`${chalk.dim(`🌐 Provider: ${ctx.provider}${ctx.model ? ' / ' + ctx.model : ''}`)}\n`);
  process.stdout.write(`${chalk.dim(`🔧 Tools: ${ctx.tools.listAll().map((t) => t.name).join(', ')}`)}\n\n`);

  setupEventForwarding(ctx.emitter);

  const stages = createDefaultStages({
    llm: ctx.llm,
    config: ctx.config,
    storage: ctx.storage,
    memory: ctx.memory,
    shell: ctx.shell,
    tools: ctx.tools,
    eventBus: ctx.emitter,
  });

  const initialCtx: PipelineContext = {
    taskId: randomUUID(),
    input: ctx.task,
    errors: [],
    metadata: { provider: ctx.provider, model: ctx.model ?? 'default' },
    createdFiles: [],
    modifiedFiles: [],
    phaseHistory: [],
    shouldConfirm: false,
  };

  let currentCtx: PipelineContext = initialCtx;
  let failed: string | null = null;

  for (const stage of stages) {
    process.stdout.write(`\n${chalk.bold(`📍 ${stage.name}`)}\n`);
    try {
      currentCtx = await stage.execute(currentCtx);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      process.stdout.write(`  ${chalk.red('✗ failed:')} ${msg}\n`);
      failed = stage.name;
      break;
    }
  }

  if (failed) {
    process.stdout.write(`\n${chalk.red('✗ Pipeline failed at stage:')} ${failed}\n`);
    exit(1);
  }

  process.stdout.write(`\n${chalk.green('✓ Pipeline completed.')}\n`);
}

main().catch((err) => {
  process.stderr.write(`${chalk.red('Fatal:')} ${err instanceof Error ? err.stack ?? err.message : String(err)}\n`);
  exit(1);
});
