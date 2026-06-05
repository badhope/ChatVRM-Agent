import { Router } from 'express';
import type { IMemoryPort } from '../../src/ports/memory.port.js';

export function graphRoutes(memory: IMemoryPort): Router {
  const r = Router();

  r.get('/', async (_req, res) => {
    const all = await memory.loadAll();
    const nodes = new Map<string, { id: string; label: string; type: 'memory' | 'tag'; weight: number }>();
    const edgeSet = new Map<string, { source: string; target: string; weight: number; type: 'tag' | 'temporal' }>();

    for (const m of all) {
      nodes.set(m.id, {
        id: m.id,
        label: m.input.slice(0, 40),
        type: 'memory',
        weight: 1,
      });
      for (const tag of m.tags) {
        const tagId = `tag:${tag}`;
        if (!nodes.has(tagId)) {
          nodes.set(tagId, { id: tagId, label: `#${tag}`, type: 'tag', weight: 0 });
        }
        const edgeKey = `${m.id}->${tagId}`;
        const existing = edgeSet.get(edgeKey);
        edgeSet.set(edgeKey, {
          source: m.id,
          target: tagId,
          weight: (existing?.weight ?? 0) + 1,
          type: 'tag',
        });
        const tagNode = nodes.get(tagId)!;
        tagNode.weight += 1;
      }
    }

    const sortedMemories = [...all].sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));
    for (let i = 0; i < sortedMemories.length - 1; i += 1) {
      const a = sortedMemories[i];
      const b = sortedMemories[i + 1];
      if (Math.abs(a.timestamp - b.timestamp) > 1000 * 60 * 60 * 24 * 30) continue;
      const edgeKey = `${a.id}-${b.id}`;
      edgeSet.set(edgeKey, {
        source: a.id,
        target: b.id,
        weight: 1,
        type: 'temporal',
      });
    }

    res.json({
      nodes: [...nodes.values()].slice(0, 200),
      edges: [...edgeSet.values()].slice(0, 500),
    });
  });

  return r;
}
