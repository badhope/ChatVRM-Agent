import { Router, type Request, type Response } from 'express';

interface AgentProfile {
  id: string;
  name: string;
  role: string;
  systemPrompt: string;
  capabilities: string[];
  limitations: string[];
  builtin: boolean;
  createdAt: string;
  updatedAt: string;
}

const BUILTIN_AGENTS: AgentProfile[] = [
  {
    id: 'agt-researcher',
    name: 'Researcher',
    role: 'General-purpose researcher: searches memory and the filesystem, then summarizes.',
    systemPrompt: 'You are a careful researcher. Prefer evidence over speculation. Cite the memory or file you got each fact from. Use short paragraphs and bullet points.',
    capabilities: ['search memory', 'read files', 'summarize', 'cross-reference'],
    limitations: ['never modify files', 'never invent citations', 'cap synthesis at 200 words unless asked'],
    builtin: true,
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
  },
  {
    id: 'agt-coder',
    name: 'Coder',
    role: 'Software engineer: plans, writes, and tests code changes in the workspace.',
    systemPrompt: 'You are a senior software engineer. Read before you write. Prefer small, focused changes. Always run tests after a change. Communicate trade-offs in 1-2 sentences before acting.',
    capabilities: ['read & write files', 'run shell commands', 'write tests', 'review diffs'],
    limitations: ['no destructive commands without confirmation', 'no force pushes', 'keep changes scoped to the request'],
    builtin: true,
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
  },
  {
    id: 'agt-writer',
    name: 'Writer',
    role: 'Editorial writer: drafts, edits, and refines prose in the user\'s voice.',
    systemPrompt: 'You are a thoughtful editor. Match the user\'s tone. Prefer short sentences. Strip filler. When rewriting, return the whole passage, not just the changed lines.',
    capabilities: ['draft prose', 'tighten copy', 'adapt tone', 'translate EN↔ZH'],
    limitations: ['do not invent facts', 'do not exceed the user\'s requested length'],
    builtin: true,
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
  },
];

const STORE: { items: Map<string, AgentProfile> } = {
  items: new Map(BUILTIN_AGENTS.map((a) => [a.id, a])),
};

const ID_RE = /^[a-z][a-z0-9_]{0,40}$/;

function now(): string {
  return new Date().toISOString();
}

export function agentsRoutes(): Router {
  const r = Router();
  // C1 (W18): auth is applied globally in app.ts.

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
    const a = STORE.items.get(req.params.id);
    if (!a) {
      res.status(404).json({ error: `agent "${req.params.id}" not found` });
      return;
    }
    res.json(a);
  });

  r.post('/', (req: Request, res: Response) => {
    const body = req.body as {
      id?: string;
      name?: string;
      role?: string;
      systemPrompt?: string;
      capabilities?: unknown;
      limitations?: unknown;
    };
    const id = typeof body.id === 'string' ? body.id.trim() : '';
    if (!ID_RE.test(id)) {
      res.status(400).json({ error: 'id must be snake_case (≤40 chars, start with letter)' });
      return;
    }
    if (STORE.items.has(id)) {
      res.status(409).json({ error: `agent "${id}" already exists` });
      return;
    }
    if (typeof body.name !== 'string' || body.name.trim().length === 0) {
      res.status(400).json({ error: 'name is required' });
      return;
    }
    const capabilities = Array.isArray(body.capabilities)
      ? (body.capabilities as unknown[]).filter((x): x is string => typeof x === 'string').map((s) => s.trim()).filter(Boolean).slice(0, 8)
      : [];
    const limitations = Array.isArray(body.limitations)
      ? (body.limitations as unknown[]).filter((x): x is string => typeof x === 'string').map((s) => s.trim()).filter(Boolean).slice(0, 8)
      : [];

    const ts = now();
    const agent: AgentProfile = {
      id,
      name: body.name.trim().slice(0, 80),
      role: typeof body.role === 'string' ? body.role.slice(0, 200) : '',
      systemPrompt: typeof body.systemPrompt === 'string' ? body.systemPrompt.slice(0, 4000) : '',
      capabilities,
      limitations,
      builtin: false,
      createdAt: ts,
      updatedAt: ts,
    };
    STORE.items.set(id, agent);
    res.status(201).json({ ok: true, ...agent });
  });

  r.patch('/:id', (req, res) => {
    const a = STORE.items.get(req.params.id);
    if (!a) {
      res.status(404).json({ error: `agent "${req.params.id}" not found` });
      return;
    }
    // C4 (W19): built-in agents are immutable. The PATCH handler
    // used to silently overwrite `systemPrompt` / `role` / `name`
    // on built-in entries, which let a malicious caller replace
    // the default-assistant / coder system prompt with a
    // prompt-injection payload. All subsequent LLM calls would
    // then inherit the corrupted prompt. Clone the agent (POST
    // /:id/duplicate) to get a mutable copy.
    if (a.builtin) {
      res.status(403).json({
        error: 'built-in agents are immutable; clone via POST /:id/duplicate to get a mutable copy',
      });
      return;
    }
    const body = req.body as {
      name?: string;
      role?: string;
      systemPrompt?: string;
      capabilities?: unknown;
      limitations?: unknown;
    };
    if (typeof body.name === 'string' && body.name.trim().length > 0) a.name = body.name.trim().slice(0, 80);
    if (typeof body.role === 'string') a.role = body.role.slice(0, 200);
    if (typeof body.systemPrompt === 'string') a.systemPrompt = body.systemPrompt.slice(0, 4000);
    if (Array.isArray(body.capabilities)) {
      a.capabilities = (body.capabilities as unknown[])
        .filter((x): x is string => typeof x === 'string').map((s) => s.trim()).filter(Boolean).slice(0, 8);
    }
    if (Array.isArray(body.limitations)) {
      a.limitations = (body.limitations as unknown[])
        .filter((x): x is string => typeof x === 'string').map((s) => s.trim()).filter(Boolean).slice(0, 8);
    }
    a.updatedAt = now();
    res.json({ ok: true, ...a });
  });

  r.delete('/:id', (req, res) => {
    const a = STORE.items.get(req.params.id);
    if (!a) {
      res.status(404).json({ error: `agent "${req.params.id}" not found` });
      return;
    }
    if (a.builtin) {
      res.status(403).json({ error: 'built-in agents cannot be deleted; clone it instead' });
      return;
    }
    STORE.items.delete(req.params.id);
    res.json({ ok: true, removed: req.params.id });
  });

  r.post('/:id/duplicate', (req, res) => {
    const a = STORE.items.get(req.params.id);
    if (!a) {
      res.status(404).json({ error: `agent "${req.params.id}" not found` });
      return;
    }
    const { newId, newName } = req.body as { newId?: string; newName?: string };
    if (typeof newId !== 'string' || !ID_RE.test(newId)) {
      res.status(400).json({ error: 'newId must be snake_case (≤40 chars, start with letter)' });
      return;
    }
    if (STORE.items.has(newId)) {
      res.status(409).json({ error: `agent "${newId}" already exists` });
      return;
    }
    const ts = now();
    const cloned: AgentProfile = {
      ...a,
      id: newId,
      name: (typeof newName === 'string' && newName.trim().length > 0 ? newName : a.name + ' (Copy)').slice(0, 80),
      builtin: false,
      capabilities: [...a.capabilities],
      limitations: [...a.limitations],
      createdAt: ts,
      updatedAt: ts,
    };
    STORE.items.set(newId, cloned);
    res.status(201).json({ ok: true, ...cloned });
  });

  return r;
}
