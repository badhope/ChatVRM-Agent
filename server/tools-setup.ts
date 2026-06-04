import type { LLMAdapter } from '../src/adapters/llm.adapter.js';
import type { StorageAdapter } from '../src/adapters/storage.adapter.js';
import type { MemoryAdapter } from '../src/adapters/memory.adapter.js';
import type { ShellExecutor } from '../src/adapters/shell.adapter.js';
import type { ConfigAdapter } from '../src/adapters/config.adapter.js';
import type { ToolsRegistry } from '../src/adapters/tools.registry.js';
import type { ProviderType } from '../src/ports/config.port.js';

interface Tools {
  llm: LLMAdapter;
  storage: StorageAdapter;
  memory: MemoryAdapter;
  shell: ShellExecutor;
  config: ConfigAdapter;
  tools: ToolsRegistry;
}

export function registerDefaultTools(opts: Tools): void {
  const { llm, storage, memory, shell, config, tools } = opts;

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
      await storage.write(filePath, content);
      return { success: true, output: `Written ${content.length} bytes to ${filePath}` };
    },
  });

  tools.register({
    name: 'readFile',
    description: 'Read the contents of a file',
    handler: async (args) => {
      const filePath = (args.filePath as string) ?? (args.path as string);
      if (!filePath) return { success: false, error: 'filePath is required' };
      if (!(await storage.exists(filePath))) {
        return { success: false, error: `File not found: ${filePath}` };
      }
      const content = await storage.read(filePath);
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
      const prompt = (args.prompt as string) ?? (args.message as string) ?? '';
      const context = (args.context as string) ?? '';
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
