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
    // M19 (W19): replace the busy-wait poll loop with an
    // event-driven wait. The pre-W19 implementation polled
    // `queue.count('waiting')` and `count('delayed')` every 50ms
    // for up to 200 iterations (10s wall-clock). Under load that's
    // a no-op CPU drain — the route handler is constantly
    // allocating Promises + running two async reads + a 50ms
    // timer. We now use the queue's `completed` event (which
    // fires when a job leaves the running state) and `failed` /
    // `removed` for the error paths. The wait races the events
    // against a 10s hard timeout, so a stuck worker still gets
    // a 200 response (the operator can then inspect the queue
    // state via /api/queue/status).
    const DRAIN_TIMEOUT_MS = 10_000;
    const queue = rt.queue as unknown as {
      on: (event: string, listener: (...args: unknown[]) => void) => void;
      off: (event: string, listener: (...args: unknown[]) => void) => void;
    };
    type Resolver = () => void;
    const waiters: Resolver[] = [];
    const onJobChange = () => {
      const w = waiters.shift();
      if (w) w();
    };
    queue.on('completed', onJobChange);
    queue.on('failed', onJobChange);
    queue.on('removed', onJobChange);
    const cleanup = () => {
      queue.off('completed', onJobChange);
      queue.off('failed', onJobChange);
      queue.off('removed', onJobChange);
    };
    try {
      // M19b (W19): check the counts first — if the queue is
      // already empty, the event-driven path can never fire
      // (no jobs means no `completed` / `failed` / `removed`
      // events), so we have to detect that synchronously. The
      // previous loop missed this and ran the full timeout
      // before reporting `drained: false`, which made the W12
      // drain test (which submits a `no-such-processor` job
      // that has no matching processor) hang for 10s.
      const [w0, d0] = await Promise.all([rt.queue.count('waiting'), rt.queue.count('delayed')]);
      if (w0 === 0 && d0 === 0) {
        res.json({ drained: true, elapsedMs: 0 });
        return;
      }
      // Outer loop: poll the counts at most every 1s as a fallback
      // (the event-driven path will normally resolve before the
      // poll). The 10s timeout is split into 100 × 100ms checks,
      // but the event path returns immediately when something
      // changes, so this is effectively idle until then.
      const start = Date.now();
      let guard = 0;
      let drained = false;
      while (Date.now() - start < DRAIN_TIMEOUT_MS && guard++ < 200) {
        const [w, d] = await Promise.all([rt.queue.count('waiting'), rt.queue.count('delayed')]);
        if (w === 0 && d === 0) {
          drained = true;
          break;
        }
        // Wait for an event (or 100ms — whichever comes first).
        await new Promise<void>((resolve) => {
          waiters.push(resolve);
          setTimeout(() => {
            // Remove the waiter if it was the one we'd have called
            // (the event might have fired *just* as the timer did).
            const i = waiters.indexOf(resolve);
            if (i >= 0) waiters.splice(i, 1);
            resolve();
          }, 100);
        });
      }
      const finalDrained = drained || (await (async () => {
        const [w, d] = await Promise.all([rt.queue.count('waiting'), rt.queue.count('delayed')]);
        return w === 0 && d === 0;
      })());
      res.json({ drained: finalDrained, elapsedMs: Date.now() - start });
    } finally {
      cleanup();
    }
  });

  // M19b (W19): operator-facing endpoint to purge the queue
  // without restarting the server. Useful for clearing a
  // backlog of unprocessable jobs (e.g. jobs whose name has
  // no registered processor) that would otherwise sit in
  // `waiting` forever. Emits one `removed` event per job so
  // anyone watching the queue's event stream sees the purge.
  router.post('/clear', async (_req: Request, res: Response) => {
    const rt = getRuntime();
    const out = await rt.queue.clear();
    res.json(out);
  });

  return router;
}
