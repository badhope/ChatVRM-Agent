import type { Stage, PipelineContext, TaskStep, PipelineEvents } from '../core/types.js';
import { EventEmitter } from 'eventemitter3';
import { v4 as uuidv4 } from 'uuid';
import type { LLMAdapter } from '../adapters/llm.adapter.js';
import type { ConfigAdapter } from '../adapters/config.adapter.js';

const PLAN_TEMPLATES: Record<string, Array<Omit<TaskStep, 'id'>>> = {
  code: [
    { description: 'Analyze target code or requirements', tool: 'analyze', args: { target: 'codebase', detail: 'full' }, dependencies: [], status: 'pending' },
    { description: 'Generate the code implementation', tool: 'respond', args: { style: 'code', maxLength: 8000 }, dependencies: [], status: 'pending' },
    { description: 'Write the implementation to a file', tool: 'writeFile', args: { filePath: 'output.ts', language: 'typescript' }, dependencies: [], status: 'pending' },
    { description: 'Run the project tests', tool: 'shell', args: { command: 'npm test', timeout: 60000 }, dependencies: [], status: 'pending' },
  ],
  'file-op': [
    { description: 'Generate the file content', tool: 'respond', args: { style: 'text', maxLength: 8000 }, dependencies: [], status: 'pending' },
    { description: 'Write content to the target file', tool: 'writeFile', args: { filePath: 'output.txt', mode: 'overwrite' }, dependencies: [], status: 'pending' },
    { description: 'Verify the file was created', tool: 'readFile', args: { filePath: 'output.txt' }, dependencies: [], status: 'pending' },
  ],
  'word-op': [
    { description: 'Run the requested wordProcess operation (create/read/append/replace/info/search/to-text)', tool: 'wordProcess', args: { op: 'create', output: 'output.docx', title: 'Generated', content: 'Hello from agent' }, dependencies: [], status: 'pending' },
  ],
  chat: [
    { description: 'Generate conversational response', tool: 'respond', args: { style: 'conversational', maxLength: 2000 }, dependencies: [], status: 'pending' },
  ],
  search: [
    { description: 'Search memory and project files for the query', tool: 'search', args: { pattern: '', recursive: true, caseSensitive: false }, dependencies: [], status: 'pending' },
  ],
  general: [
    { description: 'Analyze the user request', tool: 'analyze', args: { target: 'request', detail: 'standard' }, dependencies: [], status: 'pending' },
    { description: 'Generate a response', tool: 'respond', args: { style: 'conversational', maxLength: 4000 }, dependencies: [], status: 'pending' },
    { description: 'Remember the interaction for future context', tool: 'remember', args: { tags: ['general'] }, dependencies: [], status: 'pending' },
  ],
};

const PLANNING_SYSTEM_PROMPT = `You are a planning agent. Given a user request and context, generate a step-by-step plan.
Return ONLY a JSON array of objects. Each object must have:
- "description" (string): what this step does
- "tool" (string, optional): one of writeFile, shell, search, respond, analyze, wordProcess, readFile, design, implement, test, review, validate, execute, decide, understand, verify
- "args" (object, optional): tool-specific arguments, e.g. {"filePath": "src/main.ts", "language": "typescript"} for writeFile, {"command": "npm install", "timeout": 30000} for shell, {"op": "create", "output": "out.docx", "title": "Hi", "content": "Hello"} for wordProcess
Example: [{"description": "Create the main function in TypeScript", "tool": "writeFile", "args": {"filePath": "src/main.ts", "language": "typescript"}}, {"description": "Verify the implementation compiles", "tool": "shell", "args": {"command": "npx tsc --noEmit", "timeout": 30000}}]
Do not include any other text, markdown formatting, or explanations.`;

function parseLLMPlan(content: string): Array<{ description: string; tool?: string; args?: Record<string, unknown> }> | null {
  const cleaned = content.replace(/```(?:json)?\n?/g, '').trim();
  try {
    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed) && parsed.length > 0 && parsed.every((s: unknown) => typeof (s as Record<string, unknown>).description === 'string')) {
      return parsed as Array<{ description: string; tool?: string; args?: Record<string, unknown> }>;
    }
    return null;
  } catch {
    return null;
  }
}

export class PlanStage implements Stage {
  readonly name = 'plan';
  readonly required = true;
  private llm: LLMAdapter;
  private config: ConfigAdapter;
  private emitter: EventEmitter<PipelineEvents>;

  constructor(llm: LLMAdapter, config: ConfigAdapter, emitter?: EventEmitter<PipelineEvents>) {
    this.llm = llm;
    this.config = config;
    this.emitter = emitter ?? new EventEmitter<PipelineEvents>();
  }

  async execute(ctx: PipelineContext): Promise<PipelineContext> {
    const intent = ctx.intent ?? 'general';
    this.emitter.emit('output', { text: `Generating plan for intent: ${intent}` });

    let steps: TaskStep[] = [];

    try {
      const chatConfig = await this.config.getChatConfig();
      const systemPrompt = chatConfig.systemPrompt ?? '';
      const planningMessages = [
        { role: 'system' as const, content: `${PLANNING_SYSTEM_PROMPT}\n\n${systemPrompt}` },
        { role: 'user' as const, content: `Task: ${ctx.input}\nIntent: ${intent}\nContext files: ${((ctx.metadata.contextFiles as string[]) ?? []).join(', ')}` },
      ];

      // Honour the provider/model the agent route was called with so the
      // planner doesn't fall back to a misconfigured default (e.g. siliconflow
      // without a key) when the caller asked for aliyun/qwen-flash.
      const provider = (ctx.metadata.requestProvider as string | undefined) ?? undefined;
      const model = (ctx.metadata.requestModel as string | undefined) ?? chatConfig.model ?? undefined;

      const response = await this.llm.chat({
        provider,
        model,
        messages: planningMessages,
        temperature: 0.3,
      });

      this.emitter.emit('llm:call', { provider: 'default', model: response.model, tokens: response.usage.totalTokens });
      this.emitter.emit('output', { text: `LLM plan response received (${response.usage.totalTokens} tokens)` });

      const parsed = parseLLMPlan(response.content);
      if (parsed && parsed.length > 0) {
        steps = parsed.map((s) => ({
          id: uuidv4(),
          description: s.description,
          tool: s.tool,
          args: s.args ?? {},
          dependencies: [],
          status: 'pending' as const,
        }));
      }
    } catch {
      this.emitter.emit('output', { text: 'LLM planning failed, using template fallback' });
    }

    if (steps.length === 0) {
      const template = PLAN_TEMPLATES[intent] ?? PLAN_TEMPLATES['general'];
      steps = template.map((step) => ({
        ...step,
        id: uuidv4(),
      }));
    }

    this.emitter.emit('output', { text: `Plan generated with ${steps.length} step(s):` });
    for (const step of steps) {
      this.emitter.emit('output', { text: `  - [${step.id.slice(0, 8)}] ${step.description}${step.tool ? ` (${step.tool})` : ''}` });
    }

    const updatedCtx: PipelineContext = {
      ...ctx,
      plan: steps,
    };

    return updatedCtx;
  }
}