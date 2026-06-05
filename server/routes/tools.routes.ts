import { Router, type Request, type Response } from 'express';
import { randomUUID } from 'node:crypto';
import type { IToolsPort } from '../../src/ports/tools.port.js';
import type { ILLMPort } from '../../src/ports/llm.port.js';
import type { IStoragePort } from '../../src/ports/storage.port.js';
import type { IMemoryPort } from '../../src/ports/memory.port.js';
import type { IShellPort } from '../../src/ports/shell.port.js';
import type { ITrustPort } from '../../src/ports/trust.port.js';
import { TrustLevel } from '../../src/domain/trust/trust.service.js';
import { incrementToolCall } from './dashboard.routes.js';

interface ToolDeps {
  tools: IToolsPort;
  llm: ILLMPort;
  storage: IStoragePort;
  memory: IMemoryPort;
  shell: IShellPort;
  /**
   * Trust gate. Every tool call routed through `/execute` is
   * evaluated against the trust service. `HighRisk` and
   * `Critical` verdicts are refused before the handler runs. This
   * closes the gap where the HTTP endpoint could trigger `shell`
   * with `rm -rf /` while the in-process agent path was gated.
   */
  trust: ITrustPort;
}

const TOOL_SCHEMAS: Record<string, Array<{ name: string; type: string; description: string; required: boolean }>> = {
  writeFile: [{ name: 'filePath', type: 'string', description: '目标文件路径', required: true }, { name: 'content', type: 'string', description: '写入内容', required: false }, { name: 'previousOutput', type: 'string', description: '前一步输出作为内容（fallback）', required: false }],
  readFile: [{ name: 'filePath', type: 'string', description: '要读取的文件路径', required: true }],
  shell: [{ name: 'command', type: 'string', description: 'shell 命令', required: true }, { name: 'timeout', type: 'number', description: '超时（毫秒），默认 60000', required: false }],
  search: [{ name: 'pattern', type: 'string', description: '搜索关键词', required: true }],
  remember: [{ name: 'input', type: 'string', description: '输入', required: true }, { name: 'output', type: 'string', description: '输出', required: true }, { name: 'tags', type: 'string[]', description: '标签', required: false }],
  analyze: [{ name: 'text', type: 'string', description: '待分析文本', required: true }, { name: 'instruction', type: 'string', description: '分析指令', required: false }],
  respond: [{ name: 'prompt', type: 'string', description: '用户提示', required: true }, { name: 'context', type: 'string', description: '上下文', required: false }],
  wordProcess: [
    { name: 'op', type: 'string', description: 'read | create | append | replace | info | search | to-text', required: true },
    { name: 'path', type: 'string', description: '.docx 路径（read/append/replace/info/search/to-text）', required: false },
    { name: 'output', type: 'string', description: '输出 .docx 路径（create）', required: false },
    { name: 'title', type: 'string', description: '文档标题（create）', required: false },
    { name: 'heading', type: 'string', description: '标题文字（create/append）', required: false },
    { name: 'content', type: 'string', description: '段落内容（create）', required: false },
    { name: 'text', type: 'string', description: '追加文本（append）', required: false },
    { name: 'find', type: 'string', description: '查找（replace）', required: false },
    { name: 'replaceWith', type: 'string', description: '替换为（replace）', required: false },
    { name: 'query', type: 'string', description: '搜索关键词（search）', required: false },
    { name: 'regex', type: 'boolean', description: '把 query 当正则（search）', required: false },
    { name: 'table', type: 'string', description: 'rows,cols（create）', required: false },
    { name: 'cell', type: 'string', description: 'r0c0=hi|r1c1=yo|...（create）', required: false },
  ],
  excelRead: [
    { name: 'path', type: 'string', description: '.xlsx 文件路径', required: true },
    { name: 'sheet', type: 'string', description: '工作表名（默认第一张）', required: false },
  ],
  excelList: [
    { name: 'path', type: 'string', description: '.xlsx 文件路径', required: true },
  ],
  pdfRead: [
    { name: 'path', type: 'string', description: '.pdf 文件路径', required: true },
  ],
  chartGenerate: [
    { name: 'x', type: 'string', description: '逗号分隔的 X 轴标签', required: true },
    { name: 'series', type: 'string', description: '"name=v1,v2,name2=v1,v2"（折线系列）', required: true },
    { name: 'output', type: 'string', description: '输出 PNG 路径', required: true },
    { name: 'title', type: 'string', description: '图表标题', required: false },
    { name: 'ylabel', type: 'string', description: 'Y 轴标签', required: false },
  ],
  chartBar: [
    { name: 'x', type: 'string', description: '逗号分隔的 X 轴标签', required: true },
    { name: 'y', type: 'string', description: '逗号分隔的数值', required: true },
    { name: 'output', type: 'string', description: '输出 PNG 路径', required: true },
    { name: 'title', type: 'string', description: '图表标题', required: false },
    { name: 'ylabel', type: 'string', description: 'Y 轴标签', required: false },
  ],
  reportBuild: [
    { name: 'uploads', type: 'string', description: '源文件目录（含 PDF/Excel/Word/CSV）', required: true },
    { name: 'out', type: 'string', description: '报告输出目录（默认 e2e-output/fin-report/reports）', required: false },
    { name: 'charts', type: 'string', description: '图表输出目录（默认 e2e-output/fin-report/charts）', required: false },
    { name: 'company', type: 'string', description: '公司名（默认 Globex Technologies Inc.）', required: false },
    { name: 'quarter', type: 'string', description: 'as-of 季度（默认最后一个）', required: false },
  ],
};

interface TemplateParam {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  description: string;
  required: boolean;
  default?: unknown;
}

interface ToolTemplate {
  id: string;
  name: string;
  description: string;
  category: 'productivity' | 'data' | 'dev' | 'web' | 'misc' | 'custom';
  params: TemplateParam[];
  instructions: string;
  builtin: boolean;
  createdAt: string;
  updatedAt: string;
}

const BUILTIN_TEMPLATES: ToolTemplate[] = [
  {
    id: 'tpl-writeFile',
    name: 'Write file',
    description: 'Save content to a file path. Use when the user asks to create or overwrite a file.',
    category: 'dev',
    params: [
      { name: 'filePath', type: 'string', description: 'Target file path', required: true },
      { name: 'content', type: 'string', description: 'File content', required: false },
    ],
    instructions: 'Use absolute paths or paths relative to the working directory. Always check the parent directory exists for new files.',
    builtin: true,
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
  },
  {
    id: 'tpl-readFile',
    name: 'Read file',
    description: 'Read a file from disk and return its contents.',
    category: 'dev',
    params: [{ name: 'filePath', type: 'string', description: 'Absolute or relative file path', required: true }],
    instructions: 'For large files, prefer chunked reads. Never read binary files as text.',
    builtin: true,
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
  },
  {
    id: 'tpl-shell',
    name: 'Shell command',
    description: 'Execute a shell command and return stdout/stderr/exit code.',
    category: 'dev',
    params: [
      { name: 'command', type: 'string', description: 'Command to run', required: true },
      { name: 'timeout', type: 'number', description: 'Timeout in ms (default 60000)', required: false, default: 60000 },
    ],
    instructions: 'Never run destructive commands without confirmation. Respect the sandbox allowedCommands list.',
    builtin: true,
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
  },
  {
    id: 'tpl-search',
    name: 'Search memories',
    description: 'Full-text search across the long-term memory store.',
    category: 'data',
    params: [{ name: 'pattern', type: 'string', description: 'Search query', required: true }],
    instructions: 'Prefer narrow queries to avoid noise. The store is indexed by MiniSearch.',
    builtin: true,
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
  },
  {
    id: 'tpl-remember',
    name: 'Save to memory',
    description: 'Persist a new (input, output, tags) memory record for later retrieval.',
    category: 'data',
    params: [
      { name: 'input', type: 'string', description: 'Original user input', required: true },
      { name: 'output', type: 'string', description: 'Assistant response', required: true },
      { name: 'tags', type: 'array', description: 'Lowercase tags', required: false },
    ],
    instructions: 'Avoid saving trivial or ephemeral info. Use tags to make retrieval easy later.',
    builtin: true,
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
  },
  {
    id: 'tpl-analyze',
    name: 'Analyze text',
    description: 'LLM-driven analysis: sentiment, structure, classification, or summarization.',
    category: 'data',
    params: [
      { name: 'text', type: 'string', description: 'Text to analyze', required: true },
      { name: 'instruction', type: 'string', description: 'What to extract or decide', required: false },
    ],
    instructions: 'Default to one concise sentence. Cite quoted phrases when claiming a sentiment.',
    builtin: true,
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
  },
  {
    id: 'tpl-respond',
    name: 'Freeform response',
    description: 'LLM-driven natural language reply with optional context.',
    category: 'productivity',
    params: [
      { name: 'prompt', type: 'string', description: 'User prompt', required: true },
      { name: 'context', type: 'string', description: 'Supporting context', required: false },
    ],
    instructions: 'Default to clear, well-structured Markdown. Match the user\'s language.',
    builtin: true,
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
  },
];

const TEMPLATE_STORE: { items: Map<string, ToolTemplate> } = {
  items: new Map(BUILTIN_TEMPLATES.map((t) => [t.id, t])),
};

const SNAKE_CASE = /^[a-z][a-z0-9_]{0,40}$/;

function isValidTemplateId(id: string): boolean {
  return SNAKE_CASE.test(id);
}

function now(): string {
  return new Date().toISOString();
}

function validateTemplateParams(params: unknown): TemplateParam[] | string {
  if (!Array.isArray(params)) return 'params must be an array';
  const out: TemplateParam[] = [];
  const seen = new Set<string>();
  for (const raw of params as unknown[]) {
    if (!raw || typeof raw !== 'object') return 'each param must be an object';
    const p = raw as Record<string, unknown>;
    if (typeof p.name !== 'string' || p.name.trim().length === 0) return 'param.name is required';
    if (seen.has(p.name)) return `duplicate param name "${p.name}"`;
    seen.add(p.name);
    if (typeof p.type !== 'string') return 'param.type is required';
    if (!['string', 'number', 'boolean', 'array', 'object'].includes(p.type)) {
      return `param.type must be one of string|number|boolean|array|object (got "${p.type}")`;
    }
    out.push({
      name: p.name.slice(0, 40),
      type: p.type as TemplateParam['type'],
      description: typeof p.description === 'string' ? p.description.slice(0, 200) : '',
      required: p.required === true,
      default: p.default,
    });
    if (out.length > 16) return 'max 16 parameters per template';
  }
  return out;
}

export function toolsRoutes(deps: ToolDeps): Router {
  const r = Router();

  r.get('/', (_req, res) => {
    const list = deps.tools.listAll().map((t) => ({
      name: t.name,
      description: t.description,
      schema: TOOL_SCHEMAS[t.name] ?? [],
    }));
    res.json(list);
  });

  r.post('/execute', async (req, res) => {
    const { tool, args } = req.body as { tool: string; args: Record<string, unknown> };
    if (!tool) {
      res.status(400).json({ error: 'tool is required' });
      return;
    }
    if (!deps.tools.has(tool)) {
      res.status(404).json({ error: `tool "${tool}" not registered` });
      return;
    }
    // ---- Trust gate ----
    // H12: the HTTP /execute endpoint was previously unguarded — any
    // authenticated client could POST `{tool:"shell", args:{command:"rm -rf /"}}`
    // and the request would run. Now we evaluate every call against
    // the trust service. HighRisk / Critical verdicts are refused
    // with HTTP 403 before the handler is invoked. RequireConfirmation
    // verdicts are passed through but flagged in the response so the
    // UI can prompt the user.
    const trustInput = JSON.stringify({ tool, args: args ?? {} });
    const verdict = deps.trust.evaluate({ output: trustInput, context: JSON.stringify({ intent: 'http-tool-execute', toolUsed: tool }) });
    if (verdict.level === TrustLevel.HighRisk || verdict.level === TrustLevel.Critical) {
      res.status(403).json({
        success: false,
        error: `Refused by trust gate: ${verdict.level}. ${verdict.summary}`,
        trust: { level: verdict.level, score: verdict.score, issues: verdict.issues.map((i) => ({ type: i.type, description: i.description })) },
        tool,
      });
      return;
    }
    const startedAt = Date.now();
    try {
      const result = await deps.tools.execute(tool, args ?? {});
      incrementToolCall();
      res.json({
        ...result,
        tool,
        durationMs: Date.now() - startedAt,
        startedAt: new Date(startedAt).toISOString(),
        trust: verdict.level === TrustLevel.RequireConfirmation
          ? { level: verdict.level, summary: verdict.summary, requiresConfirmation: true }
          : undefined,
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        error: err instanceof Error ? err.message : String(err),
        tool,
        durationMs: Date.now() - startedAt,
      });
    }
  });

  /**
   * GET /api/tools/templates
   * List all tool templates (built-in + custom).
   */
  r.get('/templates', (_req, res) => {
    res.json({
      total: TEMPLATE_STORE.items.size,
      items: [...TEMPLATE_STORE.items.values()].sort((a, b) => {
        if (a.builtin !== b.builtin) return a.builtin ? -1 : 1;
        return a.name.localeCompare(b.name);
      }),
    });
  });

  /**
   * GET /api/tools/templates/:id
   */
  r.get('/templates/:id', (req, res) => {
    const tpl = TEMPLATE_STORE.items.get(req.params.id);
    if (!tpl) {
      res.status(404).json({ error: `template "${req.params.id}" not found` });
      return;
    }
    res.json(tpl);
  });

  /**
   * POST /api/tools/templates
   * Body: { id, name, description, category, params, instructions }
   */
  r.post('/templates', (req: Request, res: Response) => {
    const body = req.body as {
      id?: string;
      name?: string;
      description?: string;
      category?: string;
      params?: unknown;
      instructions?: string;
    };
    const id = typeof body.id === 'string' ? body.id.trim() : '';
    if (!isValidTemplateId(id)) {
      res.status(400).json({ error: 'id must be snake_case (≤40 chars, start with letter)' });
      return;
    }
    if (TEMPLATE_STORE.items.has(id)) {
      res.status(409).json({ error: `template "${id}" already exists` });
      return;
    }
    if (typeof body.name !== 'string' || body.name.trim().length === 0) {
      res.status(400).json({ error: 'name is required' });
      return;
    }
    const paramsResult = validateTemplateParams(body.params);
    if (typeof paramsResult === 'string') {
      res.status(400).json({ error: paramsResult });
      return;
    }
    const category = (['productivity', 'data', 'dev', 'web', 'misc', 'custom'] as const).find(
      (c) => c === body.category,
    ) ?? 'custom';

    const ts = now();
    const tpl: ToolTemplate = {
      id,
      name: body.name.trim().slice(0, 80),
      description: typeof body.description === 'string' ? body.description.slice(0, 200) : '',
      category,
      params: paramsResult,
      instructions: typeof body.instructions === 'string' ? body.instructions.slice(0, 600) : '',
      builtin: false,
      createdAt: ts,
      updatedAt: ts,
    };
    TEMPLATE_STORE.items.set(id, tpl);
    res.status(201).json({ ok: true, ...tpl });
  });

  /**
   * PATCH /api/tools/templates/:id
   * Body: any subset of { name, description, category, params, instructions }
   */
  r.patch('/templates/:id', (req, res) => {
    const tpl = TEMPLATE_STORE.items.get(req.params.id);
    if (!tpl) {
      res.status(404).json({ error: `template "${req.params.id}" not found` });
      return;
    }
    if (tpl.builtin) {
      // Built-in templates can only have description / instructions / category patched.
      const body = req.body as { description?: string; instructions?: string; category?: string };
      if (typeof body.description === 'string') tpl.description = body.description.slice(0, 200);
      if (typeof body.instructions === 'string') tpl.instructions = body.instructions.slice(0, 600);
      if (typeof body.category === 'string' && ['productivity', 'data', 'dev', 'web', 'misc', 'custom'].includes(body.category)) {
        tpl.category = body.category as ToolTemplate['category'];
      }
      tpl.updatedAt = now();
      res.json({ ok: true, ...tpl });
      return;
    }

    const body = req.body as {
      name?: string;
      description?: string;
      category?: string;
      params?: unknown;
      instructions?: string;
    };
    if (typeof body.name === 'string' && body.name.trim().length > 0) tpl.name = body.name.trim().slice(0, 80);
    if (typeof body.description === 'string') tpl.description = body.description.slice(0, 200);
    if (typeof body.category === 'string' && ['productivity', 'data', 'dev', 'web', 'misc', 'custom'].includes(body.category)) {
      tpl.category = body.category as ToolTemplate['category'];
    }
    if (body.params !== undefined) {
      const paramsResult = validateTemplateParams(body.params);
      if (typeof paramsResult === 'string') {
        res.status(400).json({ error: paramsResult });
        return;
      }
      tpl.params = paramsResult;
    }
    if (typeof body.instructions === 'string') tpl.instructions = body.instructions.slice(0, 600);
    tpl.updatedAt = now();
    res.json({ ok: true, ...tpl });
  });

  /**
   * DELETE /api/tools/templates/:id
   */
  r.delete('/templates/:id', (req, res) => {
    const tpl = TEMPLATE_STORE.items.get(req.params.id);
    if (!tpl) {
      res.status(404).json({ error: `template "${req.params.id}" not found` });
      return;
    }
    if (tpl.builtin) {
      res.status(403).json({ error: 'built-in templates cannot be deleted; clone it instead' });
      return;
    }
    TEMPLATE_STORE.items.delete(req.params.id);
    res.json({ ok: true, removed: req.params.id });
  });

  /**
   * POST /api/tools/templates/:id/duplicate
   * Body: { newId, newName? }
   */
  r.post('/templates/:id/duplicate', (req, res) => {
    const source = TEMPLATE_STORE.items.get(req.params.id);
    if (!source) {
      res.status(404).json({ error: `template "${req.params.id}" not found` });
      return;
    }
    const { newId, newName } = req.body as { newId?: string; newName?: string };
    if (typeof newId !== 'string' || !isValidTemplateId(newId)) {
      res.status(400).json({ error: 'newId must be snake_case (≤40 chars, start with letter)' });
      return;
    }
    if (TEMPLATE_STORE.items.has(newId)) {
      res.status(409).json({ error: `template "${newId}" already exists` });
      return;
    }
    const ts = now();
    const cloned: ToolTemplate = {
      ...source,
      id: newId,
      name: (typeof newName === 'string' && newName.trim().length > 0 ? newName : source.name + ' (Copy)').slice(0, 80),
      builtin: false,
      category: 'custom',
      createdAt: ts,
      updatedAt: ts,
      // Deep clone params to avoid sharing references
      params: source.params.map((p) => ({ ...p })),
    };
    TEMPLATE_STORE.items.set(newId, cloned);
    res.status(201).json({ ok: true, ...cloned });
  });

  /**
   * POST /api/tools/templates/seed-from-builtin
   * Reset built-in templates to factory defaults (idempotent).
   */
  r.post('/templates/seed-from-builtin', (_req, res) => {
    for (const t of BUILTIN_TEMPLATES) {
      TEMPLATE_STORE.items.set(t.id, { ...t });
    }
    res.json({ ok: true, total: TEMPLATE_STORE.items.size });
  });

  return r;
}
