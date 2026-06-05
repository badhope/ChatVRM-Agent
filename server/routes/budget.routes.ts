/**
 * Token budget routes — inspect and reset per-session usage.
 *
 *   GET  /api/budget             → full snapshot { sessionId: TokenUsage }
 *   GET  /api/budget/:sessionId  → single-session usage
 *   POST /api/budget/reset       → reset { sessionId: string } (or all)
 *
 * Wired in app.ts: every LLM call in the server goes through
 * `wiring.budget`, so this view reflects real, accumulated cost.
 */

import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import type { Wiring } from '../wiring.js';

const ResetSchema = z.object({
  sessionId: z.string().min(1),
});

export function budgetRoutes(wiring: Wiring): Router {
  const router = Router();

  router.get('/', (_req: Request, res: Response) => {
    res.json({
      snapshot: wiring.budgetSnapshot(),
    });
  });

  router.get('/:sessionId', (req: Request, res: Response) => {
    const id = req.params.sessionId ?? 'default';
    res.json({ sessionId: id, usage: wiring.budget.get(id) });
  });

  router.post('/reset', (req: Request, res: Response) => {
    const parsed = ResetSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid_request', issues: parsed.error.issues });
      return;
    }
    wiring.budget.reset(parsed.data.sessionId);
    res.json({ reset: parsed.data.sessionId });
  });

  return router;
}
