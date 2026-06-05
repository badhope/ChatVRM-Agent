import { Router, type Request, type Response } from 'express';
import type { IMemoryPort } from '../../src/ports/memory.port.js';

export function memoryRoutes(memory: IMemoryPort): Router {
  const r = Router();

  r.get('/', async (req, res) => {
    const q = (req.query.q as string | undefined)?.trim() ?? '';
    const limit = Math.min(parseInt((req.query.limit as string) ?? '200', 10) || 200, 1000);
    const all = await memory.loadAll();
    const filtered = q
      ? all
          .filter(
            (m) =>
              m.input.toLowerCase().includes(q.toLowerCase()) ||
              m.output.toLowerCase().includes(q.toLowerCase()) ||
              m.tags.some((t) => t.toLowerCase().includes(q.toLowerCase())),
          )
      : all;
    const sorted = [...filtered].sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));
    res.json({
      total: all.length,
      count: sorted.length,
      items: sorted.slice(0, limit).map((m) => ({
        id: m.id,
        input: m.input,
        output: m.output,
        provider: m.provider,
        model: m.model,
        tags: m.tags,
        createdAt: new Date(m.timestamp).toISOString(),
        importance: 0.5,
      })),
    });
  });

  r.get('/tags', async (_req, res) => {
    const all = await memory.loadAll();
    const map = new Map<string, number>();
    for (const m of all) {
      for (const tag of m.tags) {
        map.set(tag, (map.get(tag) ?? 0) + 1);
      }
    }
    const list = [...map.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([tag, count]) => ({ tag, count }));
    res.json(list);
  });

  r.get('/stats', async (_req, res) => {
    const stats = await memory.stats();
    res.json(stats);
  });

  r.get('/:id', async (req, res) => {
    const id = req.params.id;
    const all = await memory.loadAll();
    const found = all.find((m) => m.id === id);
    if (!found) {
      res.status(404).json({ error: 'not found' });
      return;
    }
    res.json({
      id: found.id,
      input: found.input,
      output: found.output,
      provider: found.provider,
      model: found.model,
      tags: found.tags,
      createdAt: new Date(found.timestamp).toISOString(),
      importance: 0.5,
    });
  });

  /**
   * POST /api/memory
   * Manually create a memory record. Body: { input, output, tags?, provider?, model? }
   */
  r.post('/', async (req: Request, res: Response) => {
    const body = req.body as {
      input?: string;
      output?: string;
      tags?: unknown;
      provider?: string;
      model?: string;
    };
    if (typeof body.input !== 'string' || body.input.trim().length === 0) {
      res.status(400).json({ error: 'input is required' });
      return;
    }
    if (typeof body.output !== 'string') {
      res.status(400).json({ error: 'output is required' });
      return;
    }
    const tags = Array.isArray(body.tags)
      ? (body.tags as unknown[]).filter((t): t is string => typeof t === 'string').slice(0, 10)
      : ['manual'];
    try {
      await memory.remember({
        input: body.input.slice(0, 4000),
        output: body.output.slice(0, 8000),
        tags,
        provider: typeof body.provider === 'string' ? body.provider.slice(0, 60) : 'manual',
        model: typeof body.model === 'string' ? body.model.slice(0, 60) : 'manual',
      });
      res.status(201).json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  /**
   * PATCH /api/memory/:id
   * Edit an existing record. Body: any subset of { input, output, tags }
   */
  r.patch('/:id', async (req: Request, res: Response) => {
    const id = req.params.id;
    if (!id) {
      res.status(400).json({ error: 'id is required' });
      return;
    }
    const body = req.body as {
      input?: string;
      output?: string;
      tags?: unknown;
    };
    const patch: { input?: string; output?: string; tags?: string[] } = {};
    if (typeof body.input === 'string') patch.input = body.input.slice(0, 4000);
    if (typeof body.output === 'string') patch.output = body.output.slice(0, 8000);
    if (Array.isArray(body.tags)) {
      patch.tags = (body.tags as unknown[]).filter((t): t is string => typeof t === 'string').slice(0, 10);
    }
    if (Object.keys(patch).length === 0) {
      res.status(400).json({ error: 'no fields to update' });
      return;
    }
    try {
      const updateFn = memory.update;
      if (!updateFn) {
        res.status(501).json({ error: 'memory adapter does not support update' });
        return;
      }
      const updated = await updateFn.call(memory, id, patch);
      if (!updated) {
        res.status(404).json({ error: 'not found' });
        return;
      }
      res.json({
        ok: true,
        id: updated.id,
        input: updated.input,
        output: updated.output,
        provider: updated.provider,
        model: updated.model,
        tags: updated.tags,
        createdAt: new Date(updated.timestamp).toISOString(),
        importance: 0.5,
      });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  r.delete('/:id', async (req, res) => {
    const id = req.params.id;
    if (!id) {
      res.status(400).json({ error: 'id is required' });
      return;
    }
    try {
      const ok = await memory.forget(id);
      if (!ok) {
        res.status(404).json({ error: 'not found' });
        return;
      }
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  r.post('/bulk-delete', async (req: Request, res: Response) => {
    const body = req.body as { ids?: unknown };
    if (!Array.isArray(body.ids)) {
      res.status(400).json({ error: 'ids must be an array of strings' });
      return;
    }
    const ids = (body.ids as unknown[]).filter((x): x is string => typeof x === 'string');
    let removed = 0;
    const errors: Array<{ id: string; error: string }> = [];
    for (const id of ids) {
      try {
        const ok = await memory.forget(id);
        if (ok) removed++;
        else errors.push({ id, error: 'not found' });
      } catch (err) {
        errors.push({ id, error: err instanceof Error ? err.message : String(err) });
      }
    }
    res.json({ ok: true, removed, total: ids.length, errors });
  });

  r.post('/clear', async (_req, res) => {
    try {
      const all = await memory.loadAll();
      await Promise.all(all.map((m) => memory.forget(m.id)));
      res.json({ ok: true, removed: all.length });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  r.post('/search', async (req: Request, res: Response) => {
    const { q, limit } = req.body as { q?: string; limit?: number };
    if (typeof q !== 'string' || q.trim().length === 0) {
      res.status(400).json({ error: 'q is required' });
      return;
    }
    const max = Math.min(limit ?? 20, 100);
    const results = await memory.recall(q, max);
    res.json({
      query: q,
      count: results.length,
      items: results.map((m) => ({
        id: m.id,
        input: m.input,
        output: m.output,
        provider: m.provider,
        model: m.model,
        tags: m.tags,
        createdAt: new Date(m.timestamp).toISOString(),
        importance: 0.5,
      })),
    });
  });

  return r;
}
