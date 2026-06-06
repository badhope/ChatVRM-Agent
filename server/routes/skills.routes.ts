import { Router, type Request, type Response } from 'express';
import { randomUUID } from 'node:crypto';

interface SkillParam {
  name: string;
  type: 'string' | 'number' | 'boolean';
  description: string;
  required: boolean;
}

interface Skill {
  id: string;
  name: string;
  slug: string;
  summary: string;
  trigger: string;
  steps: string[];
  tools: string[];
  guardrails: string;
  params: SkillParam[];
  builtin: boolean;
  createdAt: string;
  updatedAt: string;
}

const BUILTIN_SKILLS: Skill[] = [
  {
    id: 'skl-code-review',
    name: 'Code review',
    slug: 'code-review',
    summary: 'Review a file or diff for bugs, smells, and improvement opportunities.',
    trigger: 'Activate when the user pastes code, opens a file, or asks for a review.',
    steps: [
      'Step 1: read the file or diff with readFile.',
      'Step 2: identify the language and main purpose.',
      'Step 3: scan for bugs, style issues, and missing tests.',
      'Step 4: write a prioritized, actionable review.',
    ],
    tools: ['readFile', 'search', 'analyze'],
    guardrails: 'Never modify the file. Stay focused on the most important issues; do not nitpick.',
    params: [
      { name: 'path', type: 'string', description: 'File or directory to review', required: true },
      { name: 'focus', type: 'string', description: 'security | performance | style | correctness', required: false },
    ],
    builtin: true,
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
  },
  {
    id: 'skl-research-summarize',
    name: 'Research & summarize',
    slug: 'research-summarize',
    summary: 'Search memory, then produce a one-paragraph synthesis of the most relevant items.',
    trigger: 'Activate when the user asks a question that might be answered by previous conversations.',
    steps: [
      'Step 1: search memory for the user\'s topic with at least 3 keyword variations.',
      'Step 2: select the 3-5 most relevant results.',
      'Step 3: write a concise synthesis, citing which memory it came from.',
    ],
    tools: ['search', 'analyze', 'respond'],
    guardrails: 'Do not invent facts that are not in the retrieved memories. Cite input/output by timestamp.',
    params: [
      { name: 'topic', type: 'string', description: 'What the user is asking about', required: true },
      { name: 'maxResults', type: 'number', description: 'Cap results to consider (default 5)', required: false },
    ],
    builtin: true,
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
  },
  {
    id: 'skl-test-authoring',
    name: 'Author tests',
    slug: 'test-authoring',
    summary: 'Write a unit test for a given function or module.',
    trigger: 'Activate when the user asks to add tests, or after writing significant new code.',
    steps: [
      'Step 1: read the source file to understand the surface area.',
      'Step 2: pick the testing framework from the repo (heuristic).',
      'Step 3: write a test that covers happy path + 1-2 edge cases.',
      'Step 4: run the test with shell and report back.',
    ],
    tools: ['readFile', 'shell', 'writeFile'],
    guardrails: 'Do not commit or push. Do not run the full test suite unless asked.',
    params: [
      { name: 'targetFile', type: 'string', description: 'File to test', required: true },
      { name: 'functionName', type: 'string', description: 'Specific function to focus on (optional)', required: false },
    ],
    builtin: true,
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
  },
];

const STORE: { items: Map<string, Skill> } = {
  items: new Map(BUILTIN_SKILLS.map((s) => [s.id, s])),
};

// L16 (W19): serialise every read-then-write of the STORE so
// two concurrent POSTs to `/api/skills/:id/duplicate` (or a
// POST + DELETE racing) can't both pass the "does the id
// exist?" check and then both call `.set()`. Express runs
// route handlers synchronously in the same event-loop turn
// for in-memory I/O, but the moment a handler does *any*
// `await` (a future DB call, a log flush, etc.) two requests
// can interleave. We don't await here, so the lock is
// effectively a no-op today — but the contract it enforces
// ("at most one mutation runs at a time") keeps the next
// person who adds a `await` from silently corrupting the
// store. The queue is an in-place FIFO; an attempt that
// arrives while the lock is held is enqueued and runs after
// the in-flight mutation settles.
let _storeLock: Promise<void> = Promise.resolve();
function withStoreLock<T>(fn: () => T): Promise<T> {
  const release = _storeLock;
  let resolveNext!: () => void;
  const next = new Promise<void>((resolve) => {
    resolveNext = resolve;
  });
  _storeLock = next;
  return release.then(() => fn()).finally(() => resolveNext());
}

const SLUG_RE = /^[a-z][a-z0-9-]{0,40}$/;
const ID_RE = /^[a-z][a-z0-9_]{0,40}$/;

function now(): string {
  return new Date().toISOString();
}

function isSkill(v: unknown): v is Skill {
  if (typeof v !== 'object' || v === null) return false;
  const s = v as Skill;
  return typeof s.id === 'string' && typeof s.name === 'string' && Array.isArray(s.steps);
}

export function skillsRoutes(): Router {
  const r = Router();

  r.get('/', (_req, res) => {
    res.json({
      total: STORE.items.size,
      items: [...STORE.items.values()].sort((a, b) => {
        if (a.builtin !== b.builtin) return a.builtin ? -1 : 1;
        return a.name.localeCompare(b.name);
      }),
    });
  });

  r.get('/:id', (req, res) => {
    const s = STORE.items.get(req.params.id);
    if (!s) {
      res.status(404).json({ error: `skill "${req.params.id}" not found` });
      return;
    }
    res.json(s);
  });

  r.post('/', (req: Request, res: Response) => {
    void withStoreLock(() => {
      doPostSkill(req, res);
    });
  });
  function doPostSkill(req: Request, res: Response): void {
    const body = req.body as {
      id?: string;
      name?: string;
      slug?: string;
      summary?: string;
      trigger?: string;
      steps?: unknown;
      tools?: unknown;
      guardrails?: string;
      params?: unknown;
    };
    const id = typeof body.id === 'string' ? body.id.trim() : '';
    if (!ID_RE.test(id)) {
      res.status(400).json({ error: 'id must be snake_case (≤40 chars, start with letter)' });
      return;
    }
    if (STORE.items.has(id)) {
      res.status(409).json({ error: `skill "${id}" already exists` });
      return;
    }
    if (typeof body.name !== 'string' || body.name.trim().length === 0) {
      res.status(400).json({ error: 'name is required' });
      return;
    }
    const slug = typeof body.slug === 'string' && SLUG_RE.test(body.slug)
      ? body.slug
      : id.replace(/_/g, '-');
    if (!SLUG_RE.test(slug)) {
      res.status(400).json({ error: 'slug must be kebab-case (≤40 chars, start with letter)' });
      return;
    }
    const steps = Array.isArray(body.steps)
      ? (body.steps as unknown[]).filter((x): x is string => typeof x === 'string').map((s) => s.trim()).filter(Boolean).slice(0, 10)
      : [];
    if (steps.length < 1) {
      res.status(400).json({ error: 'at least one step is required' });
      return;
    }
    const tools = Array.isArray(body.tools)
      ? (body.tools as unknown[]).filter((x): x is string => typeof x === 'string').map((s) => s.trim()).filter(Boolean).slice(0, 16)
      : [];
    const params = Array.isArray(body.params)
      ? (body.params as unknown[]).map((raw) => {
          if (typeof raw !== 'object' || raw === null) return null;
          const p = raw as Record<string, unknown>;
          if (typeof p.name !== 'string' || typeof p.type !== 'string') return null;
          if (!['string', 'number', 'boolean'].includes(p.type)) return null;
          return {
            name: p.name.slice(0, 40),
            type: p.type as 'string' | 'number' | 'boolean',
            description: typeof p.description === 'string' ? p.description.slice(0, 200) : '',
            required: p.required === true,
          };
        }).filter((x): x is SkillParam => x !== null).slice(0, 8)
      : [];

    const ts = now();
    const skill: Skill = {
      id,
      name: body.name.trim().slice(0, 80),
      slug,
      summary: typeof body.summary === 'string' ? body.summary.slice(0, 200) : '',
      trigger: typeof body.trigger === 'string' ? body.trigger.slice(0, 300) : '',
      steps,
      tools,
      guardrails: typeof body.guardrails === 'string' ? body.guardrails.slice(0, 400) : '',
      params,
      builtin: false,
      createdAt: ts,
      updatedAt: ts,
    };
    STORE.items.set(id, skill);
    res.status(201).json({ ok: true, ...skill });
  }

  r.patch('/:id', (req, res) => {
    void withStoreLock(() => {
      doPatchSkill(req, res);
    });
  });
  function doPatchSkill(req: Request, res: Response): void {
    const s = STORE.items.get(req.params.id);
    if (!s) {
      res.status(404).json({ error: `skill "${req.params.id}" not found` });
      return;
    }
    if (s.builtin) {
      // Built-in skills: only allow description / trigger / guardrails edits.
      const body = req.body as { summary?: string; trigger?: string; guardrails?: string };
      if (typeof body.summary === 'string') s.summary = body.summary.slice(0, 200);
      if (typeof body.trigger === 'string') s.trigger = body.trigger.slice(0, 300);
      if (typeof body.guardrails === 'string') s.guardrails = body.guardrails.slice(0, 400);
      s.updatedAt = now();
      res.json({ ok: true, ...s });
      return;
    }
    const body = req.body as {
      name?: string;
      summary?: string;
      trigger?: string;
      steps?: unknown;
      tools?: unknown;
      guardrails?: string;
      params?: unknown;
    };
    if (typeof body.name === 'string' && body.name.trim().length > 0) s.name = body.name.trim().slice(0, 80);
    if (typeof body.summary === 'string') s.summary = body.summary.slice(0, 200);
    if (typeof body.trigger === 'string') s.trigger = body.trigger.slice(0, 300);
    if (typeof body.guardrails === 'string') s.guardrails = body.guardrails.slice(0, 400);
    if (Array.isArray(body.steps)) {
      s.steps = (body.steps as unknown[]).filter((x): x is string => typeof x === 'string').map((x) => x.trim()).filter(Boolean).slice(0, 10);
    }
    if (Array.isArray(body.tools)) {
      s.tools = (body.tools as unknown[]).filter((x): x is string => typeof x === 'string').map((x) => x.trim()).filter(Boolean).slice(0, 16);
    }
    if (Array.isArray(body.params)) {
      s.params = (body.params as unknown[])
        .map((raw) => {
          if (typeof raw !== 'object' || raw === null) return null;
          const p = raw as Record<string, unknown>;
          if (typeof p.name !== 'string' || typeof p.type !== 'string') return null;
          if (!['string', 'number', 'boolean'].includes(p.type)) return null;
          return {
            name: p.name.slice(0, 40),
            type: p.type as 'string' | 'number' | 'boolean',
            description: typeof p.description === 'string' ? p.description.slice(0, 200) : '',
            required: p.required === true,
          };
        })
        .filter((x): x is SkillParam => x !== null)
        .slice(0, 8);
    }
    s.updatedAt = now();
    res.json({ ok: true, ...s });
  }

  r.delete('/:id', (req, res) => {
    void withStoreLock(() => {
      doDeleteSkill(req, res);
    });
  });
  function doDeleteSkill(req: Request, res: Response): void {
    const s = STORE.items.get(req.params.id);
    if (!s) {
      res.status(404).json({ error: `skill "${req.params.id}" not found` });
      return;
    }
    if (s.builtin) {
      res.status(403).json({ error: 'built-in skills cannot be deleted; clone it instead' });
      return;
    }
    STORE.items.delete(req.params.id);
    res.json({ ok: true, removed: req.params.id });
  }

  r.post('/:id/duplicate', (req, res) => {
    void withStoreLock(() => {
      doDuplicateSkill(req, res);
    });
  });
  function doDuplicateSkill(req: Request, res: Response): void {
    const s = STORE.items.get(req.params.id);
    if (!s) {
      res.status(404).json({ error: `skill "${req.params.id}" not found` });
      return;
    }
    const { newId, newName } = req.body as { newId?: string; newName?: string };
    if (typeof newId !== 'string' || !ID_RE.test(newId)) {
      res.status(400).json({ error: 'newId must be snake_case (≤40 chars, start with letter)' });
      return;
    }
    if (STORE.items.has(newId)) {
      res.status(409).json({ error: `skill "${newId}" already exists` });
      return;
    }
    const ts = now();
    const cloned: Skill = {
      ...s,
      id: newId,
      name: (typeof newName === 'string' && newName.trim().length > 0 ? newName : s.name + ' (Copy)').slice(0, 80),
      slug: newId.replace(/_/g, '-'),
      builtin: false,
      steps: [...s.steps],
      tools: [...s.tools],
      params: s.params.map((p) => ({ ...p })),
      createdAt: ts,
      updatedAt: ts,
    };
    STORE.items.set(newId, cloned);
    res.status(201).json({ ok: true, ...cloned });
  }

  // Silence unused-var warnings
  void randomUUID; void isSkill;

  return r;
}
