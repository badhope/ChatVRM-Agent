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
  // L10 (W19): when the caller passes `skipSsrfCheck: true`,
  // the URL is accepted even if it points at a private / loopback
  // address. The route forwards the flag to the WebhookRouter
  // so the L10 fire-and-forget validation does not reject the
  // registration. Use only for in-process tests; production
  // callers should set this to `false` (or omit it).
  skipSsrfCheck: z.boolean().optional().default(false),
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

  router.post('/', async (req: Request, res: Response) => {
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
    // M13 (W19): the router's `register` is now async because it
    // awaits the SSRF pre-check before binding the webhook. The
    // route handler is naturally async, so we just `await` and
    // surface a 400 with the underlying error if the URL is
    // rejected (the pre-W19 code returned 201 and the SSRF
    // error would have been swallowed inside a void Promise).
    try {
      const w = await rt.webhookRouter.register(parsed.data);
      res.status(201).json({
        name: w.name,
        url: w.url,
        events: w.events,
        method: w.method,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // The SSRF pre-check throws an Error whose message starts
      // with "refusing" or "invalid URL" / "unsupported URL
      // scheme" — all 4xx. Anything else is a 500 (the binding
      // itself can't really fail in a way the user can fix).
      const isClientError =
        /^(refusing|invalid URL|unsupported URL scheme|refusing URL)/.test(message);
      res.status(isClientError ? 400 : 500).json({
        error: message,
        ssrfRefused: isClientError,
      });
    }
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
