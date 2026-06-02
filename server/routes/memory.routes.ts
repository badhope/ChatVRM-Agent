import { Router } from 'express';
import type { MemoryAdapter } from '../../src/adapters/memory.adapter.js';

export function memoryRoutes(memory: MemoryAdapter): Router {
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

  r.post('/clear', async (_req, res) => {
    try {
      const all = await memory.loadAll();
      await Promise.all(all.map((m) => memory.forget(m.id)));
      res.json({ ok: true, removed: all.length });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  return r;
}
