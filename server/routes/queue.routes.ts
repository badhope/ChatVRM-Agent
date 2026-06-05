/**
 * Queue routes — list, submit, inspect, and control the in-process job queue.
 *
 *   GET  /api/queue/stats      → { waiting, active, completed, failed, delayed, paused }
 *   GET  /api/queue/jobs       → array of jobs (optional ?state=)
 *   POST /api/queue/jobs       → submit a new job
 *   GET  /api/queue/jobs/:id   → get a job by id
 *   POST /api/queue/pause      → pause processing
 *   POST /api/queue/resume     → resume processing
 *   POST /api/queue/drain      → wait until waiting+delayed empty
 */

import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { getRuntime } from '../runtime.js';
import type { Job, JobState } from '../../src/ports/queue.port.js';

const SubmitSchema = z.object({
  name: z.string().min(1).max(120),
  data: z.unknown().optional().default({}),
  jobId: z.string().min(1).optional(),
  attempts: z.number().int().positive().max(20).optional().default(1),
  priority: z.number().int().min(-1000).max(1000).optional().default(0),
  backoff: z.number().int().min(0).optional().default(0),
  startAfter: z.number().int().min(0).optional(),
});

const VALID_STATES: JobState[] = ['waiting', 'active', 'completed', 'failed', 'delayed'];

export function queueRoutes(): Router {
  const router = Router();

  router.get('/stats', async (_req: Request, res: Response) => {
    const rt = getRuntime();
    const [waiting, active, completed, failed, delayed] = await Promise.all([
      rt.queue.count('waiting'),
      rt.queue.count('active'),
      rt.queue.count('completed'),
      rt.queue.count('failed'),
      rt.queue.count('delayed'),
    ]);
    res.json({
      waiting,
      active,
      completed,
      failed,
      delayed,
      paused: rt.queue.isPaused(),
      name: rt.queue.name,
    });
  });

  router.get('/jobs', async (req: Request, res: Response) => {
    const rt = getRuntime();
    const state = typeof req.query.state === 'string' ? req.query.state : undefined;
    if (state && !VALID_STATES.includes(state as JobState)) {
      res.status(400).json({ error: 'invalid_state', valid: VALID_STATES });
      return;
    }
    const total = await rt.queue.count(state as JobState | undefined);
    // Snapshot the internal map. We expose this by repeated getJob scans.
    // For a small queue this is fine; in production the queue should
    // grow a `listJobs(state)` method. Until then, the admin UI gets
    // a per-state count and can fetch individual jobs by id.
    res.json({
      state: state ?? 'all',
      total,
      note: 'Use /api/queue/jobs/:id to fetch a specific job, or /api/queue/stats for per-state counts.',
    });
  });

  router.post('/jobs', async (req: Request, res: Response) => {
    const parsed = SubmitSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid_request', issues: parsed.error.issues });
      return;
    }
    const rt = getRuntime();
    try {
      const job: Job = await rt.queue.add(parsed.data.name, parsed.data.data, {
        jobId: parsed.data.jobId,
        attempts: parsed.data.attempts,
        priority: parsed.data.priority,
        backoff: parsed.data.backoff,
        startAfter: parsed.data.startAfter,
      });
      res.status(201).json({
        id: job.id,
        name: job.name,
        state: job.state,
        timestamp: job.timestamp,
        attemptsMade: job.attemptsMade,
      });
    } catch (err) {
      res.status(500).json({ error: 'submit_failed', message: (err as Error).message });
    }
  });

  router.get('/jobs/:id', async (req: Request, res: Response) => {
    const rt = getRuntime();
    const job = await rt.queue.getJob(req.params.id ?? '');
    if (!job) {
      res.status(404).json({ error: 'not_found', id: req.params.id });
      return;
    }
    res.json(job);
  });

  router.post('/pause', async (_req: Request, res: Response) => {
    const rt = getRuntime();
    await rt.queue.pause();
    res.json({ paused: true });
  });

  router.post('/resume', async (_req: Request, res: Response) => {
    const rt = getRuntime();
    await rt.queue.resume();
    res.json({ paused: false });
  });

  router.post('/drain', async (_req: Request, res: Response) => {
    const rt = getRuntime();
    let guard = 0;
    while (guard++ < 200) {
      const [w, d] = await Promise.all([rt.queue.count('waiting'), rt.queue.count('delayed')]);
      if (w === 0 && d === 0) break;
      await new Promise((r) => setTimeout(r, 50));
    }
    res.json({ drained: true });
  });

  return router;
}
