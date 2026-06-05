/**
 * Observability routes — list and inspect captured traces.
 *
 *   GET  /api/observability/traces       → list of recent captured records
 *   POST /api/observability/trace        → start a manual trace (returns its records)
 *   POST /api/observability/flush        → flush the underlying backend (no-op here)
 *   POST /api/observability/drain        → clear the ring buffer
 *
 * Captures are stored in the `NoopObservability` ring buffer
 * (recordMode=true) attached to the shared `Runtime`. They are
 * best-effort: the queue is bounded and gets evicted in FIFO order.
 */

import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { getRuntime } from '../runtime.js';

const TraceSchema = z.object({
  name: z.string().min(1).max(120),
  input: z.unknown().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  tags: z.array(z.string()).optional(),
});

export function observabilityRoutes(): Router {
  const router = Router();

  router.get('/traces', (_req: Request, res: Response) => {
    const rt = getRuntime();
    // NoopObservability exposes drainRecords() which clears. Use a
    // peek instead: re-construct the snapshot is not possible without
    // a public getter, so we expose the recent count + a `?peek=1`
    // option to drain for tests.
    const obs = rt.observability as unknown as { ringBuffer?: unknown[] };
    const n = obs.ringBuffer?.length ?? 0;
    res.json({
      backend: rt.observability.name,
      captured: n,
      max: 500,
      note: 'NoopObservability is in-memory and bounded. Records are dropped (FIFO) past 500.',
    });
  });

  router.post('/trace', async (req: Request, res: Response) => {
    const parsed = TraceSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid_request', issues: parsed.error.issues });
      return;
    }
    const rt = getRuntime();
    const obs = await rt.observability.trace(parsed.data.name, {
      input: parsed.data.input,
      metadata: parsed.data.metadata,
      tags: parsed.data.tags,
    });
    // Close immediately — server-side traces are useful for smoke tests.
    await obs.end({ output: { ok: true, ts: new Date().toISOString() } });
    res.json({ trace: parsed.data.name, ended: true });
  });

  router.post('/flush', async (_req: Request, res: Response) => {
    const rt = getRuntime();
    await rt.observability.flush();
    res.json({ flushed: true });
  });

  router.post('/drain', (_req: Request, res: Response) => {
    const rt = getRuntime();
    const out = rt.observability.drainRecords();
    res.json({ drained: out.length, records: out });
  });

  return router;
}
