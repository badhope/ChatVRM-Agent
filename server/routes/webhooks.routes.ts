/**
 * Webhook routes — register/unregister/list/drain agent-event webhooks.
 *
 *   GET    /api/webhooks           → list of registered webhooks (summary)
 *   POST   /api/webhooks           → register a new webhook
 *   DELETE /api/webhooks/:name     → unregister by name
 *   POST   /api/webhooks/drain     → wait for in-flight deliveries
 *   POST   /api/webhooks/test      → emit a synthetic event for testing
 */

import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { getRuntime } from '../runtime.js';

const RegisterSchema = z.object({
  name: z.string().min(1).max(100),
  url: z.string().url(),
  events: z.array(z.string().min(1)).min(1),
  method: z.enum(['POST', 'PUT']).optional().default('POST'),
  secret: z.string().optional(),
  customHeaders: z.record(z.string(), z.string()).optional(),
  maxAttempts: z.number().int().positive().max(20).optional().default(3),
  timeoutMs: z.number().int().positive().max(60_000).optional().default(5000),
  queueMode: z.boolean().optional().default(false),
});

const TestSchema = z.object({
  event: z.string().min(1),
  payload: z.unknown().optional().default({}),
});

export function webhooksRoutes(): Router {
  const router = Router();

  router.get('/', (_req: Request, res: Response) => {
    const rt = getRuntime();
    const out = rt.webhookRouter.list().map((w) => ({
      name: w.name,
      url: w.url,
      method: w.method,
      events: w.events,
      deliveredCount: w.deliveredCount,
      failedCount: w.failedCount,
      lastResult: w.lastResult,
    }));
    res.json({ webhooks: out, total: out.length });
  });

  router.post('/', (req: Request, res: Response) => {
    const parsed = RegisterSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid_request', issues: parsed.error.issues });
      return;
    }
    const rt = getRuntime();
    if (rt.webhookRouter.get(parsed.data.name)) {
      res.status(409).json({ error: 'duplicate_name', name: parsed.data.name });
      return;
    }
    const w = rt.webhookRouter.register(parsed.data);
    res.status(201).json({
      name: w.name,
      url: w.url,
      events: w.events,
      method: w.method,
    });
  });

  router.delete('/:name', (req: Request, res: Response) => {
    const rt = getRuntime();
    const ok = rt.webhookRouter.unregister(req.params.name ?? '');
    if (!ok) {
      res.status(404).json({ error: 'not_found', name: req.params.name });
      return;
    }
    res.json({ unregistered: req.params.name });
  });

  router.post('/drain', async (_req: Request, res: Response) => {
    const rt = getRuntime();
    await rt.webhookRouter.drainAll();
    res.json({ drained: rt.webhookRouter.list().length });
  });

  router.post('/test', (req: Request, res: Response) => {
    const parsed = TestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid_request', issues: parsed.error.issues });
      return;
    }
    const rt = getRuntime();
    rt.eventBus.emit(parsed.data.event, parsed.data.payload);
    res.json({ emitted: parsed.data.event });
  });

  return router;
}
