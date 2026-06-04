import type { Stage, PipelineContext, PipelineEvents } from '../core/types.js';
import { EventEmitter } from 'eventemitter3';
import type { RAGService } from '../domain/memory/rag.service.js';
import type { LLMAdapter } from '../adapters/llm.adapter.js';
import { StorageAdapter } from '../adapters/storage.adapter.js';

const INTENT_PATTERNS: Array<{ pattern: RegExp; intent: string }> = [
  { pattern: /\bdocx|\.docx|wordProcess|word\s+document|word\s+doc\b/i, intent: 'word-op' },
  { pattern: /financ|财报|财务报告|financial\s+report|annual\s+report|quarterly\s+report|board\s+minutes|board-ready|board\s+ready|investor\s+letter|auditor|合规报告|合规|revenue|profit|损益|营收|盈利|EBITDA|balance\s+sheet|income\s+statement|cash\s+flow|AR\s+aging|churn\s+rate|headcount|pipeline|funnel|forecast|budget/i, intent: 'finance' },
  { pattern: /\bcode\b|\bwrite\s+code|\bimplement\b|\bprogram\b|\bfunction\b|\bclass\b|\brefactor\b|\bbug\b|\bfix\s+a\s+bug|\brun\s+tests?\b/i, intent: 'code' },
  { pattern: /file|read|write|create|delete|edit|open|save/i, intent: 'file-op' },
  { pattern: /search|find|look|grep|locate/i, intent: 'search' },
  { pattern: /chat|hello|hi|help|explain|what|how|tell|ask/i, intent: 'chat' },
];

const INTENT_SYSTEM_PROMPT = `You are an intent classifier. Classify the user's request into exactly one category.
Return ONLY the category name, nothing else.
Categories:
- "code": writing, implementing, refactoring, debugging, or testing code
- "word-op": processing Word documents (.docx) — create, read, append, replace, search, info
- "finance": financial reporting — read mixed PDF/Excel/Word/CSV company files, generate a report bundle (Markdown + Word + PDF + PPT) using the reportBuild tool. Triggered by requests about revenue, expense, profit, balance sheet, AR aging, churn, headcount, board minutes, investor letters, auditor reports, financial summaries, 财务报告, 财报, 整理报告.
- "file-op": reading, writing, creating, deleting, or editing non-docx files
- "search": searching, finding, locating, or looking up information
- "chat": casual conversation, questions, explanations, greetings
- "general": anything that doesn't fit the above categories

Examples:
"Write a function to sort an array" -> code
"Create a new .docx with title and content" -> word-op
"Read the document and tell me what's in it" -> word-op
"Append a paragraph to the report" -> word-op
"Here are 12 files I uploaded, please make me a financial report" -> finance
"Read these PDFs and Excels and give me a board-ready summary" -> finance
"整理这些文件,生成一份财务报告" -> finance
"Generate a chart of revenue by quarter" -> finance
"Create a new file called config.json" -> file-op
"Find all TODO comments in the project" -> search
"Hello, how are you?" -> chat
"Tell me about the history of AI" -> chat
"Fix the bug in the login handler" -> code`;

function recognizeIntentRegex(input: string): string {
  for (const { pattern, intent } of INTENT_PATTERNS) {
    if (pattern.test(input)) {
      return intent;
    }
  }
  return 'general';
}

async function recognizeIntentLLM(llm: LLMAdapter, input: string): Promise<string> {
  try {
    const response = await llm.chat({
      messages: [
        { role: 'system', content: INTENT_SYSTEM_PROMPT },
        { role: 'user', content: input },
      ],
      temperature: 0,
      maxTokens: 10,
    });
    const result = response.content.trim().toLowerCase();
    if (['code', 'word-op', 'file-op', 'search', 'chat', 'general', 'finance'].includes(result)) {
      return result;
    }
    return recognizeIntentRegex(input);
  } catch {
    return recognizeIntentRegex(input);
  }
}

export class UnderstandStage implements Stage {
  readonly name = 'understand';
  readonly required = true;
  private storage: StorageAdapter;
  private rag?: RAGService;
  private llm?: LLMAdapter;
  private emitter: EventEmitter<PipelineEvents>;

  constructor(
    storage: StorageAdapter | null,
    rag?: RAGService | null,
    llm?: LLMAdapter | null,
    emitter?: EventEmitter<PipelineEvents>,
  ) {
    this.storage = storage ?? new StorageAdapter();
    this.rag = rag ?? undefined;
    this.llm = llm ?? undefined;
    this.emitter = emitter ?? new EventEmitter<PipelineEvents>();
  }

  async execute(ctx: PipelineContext): Promise<PipelineContext> {
    let intent: string;
    let intentMethod: string;

    // Regex patterns are tried first. The docx/word patterns are highly
    // specific and must not be overridden by the LLM mis-classifying
    // "create a .docx" as a code task.
    const regexIntent = recognizeIntentRegex(ctx.input);
    const regexWasSpecific = regexIntent !== 'general';
    if (regexWasSpecific && this.llm) {
      intent = regexIntent;
      intentMethod = 'regex-priority';
    } else if (this.llm) {
      intent = await recognizeIntentLLM(this.llm, ctx.input);
      intentMethod = 'llm';
    } else {
      intent = regexIntent;
      intentMethod = 'regex';
    }

    this.emitter.emit('output', { text: `Intent recognized: ${intent} (via ${intentMethod})` });

    const contextFiles = await this.storage.list('.');

    let knowledgeContext = '';
    if (this.rag) {
      try {
        const results = await this.rag.search({ query: ctx.input, topK: 5, minConfidence: 30 });
        if (results.length > 0) {
          knowledgeContext = this.rag.generateContext(results);
        }
      } catch {
        knowledgeContext = '';
      }
    }

    this.emitter.emit('output', { text: `Found ${contextFiles.length} file(s) in workspace, knowledge context: ${knowledgeContext ? 'available' : 'none'}` });

    const intentConfidence = intentMethod === 'llm' ? 'high' : (intent === 'general' ? 'low' : 'medium');

    const updatedCtx: PipelineContext = {
      ...ctx,
      intent,
      metadata: {
        ...ctx.metadata,
        intent: intent,
        intentConfidence,
        intentMethod,
        contextFiles,
        knowledgeContext,
        contextBuilt: true,
        buildTime: Date.now(),
      },
    };

    return updatedCtx;
  }
}