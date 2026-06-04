import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { InProcessQueue } from '../../../adapters/queue.in-process.js';
import { BullMqQueue } from '../../../adapters/queue.bullmq.js';

function listIdsByState(q: InProcessQueue, state: string): string[] {
  const ids: string[] = [];
  for (const j of (q as unknown as { jobs: Map<string, { id: string; state: string }> }).jobs.values()) {
    if (j.state === state) ids.push(j.id);
  }
  return ids;
}

describe('InProcessQueue', () => {
  let q: InProcessQueue;

  beforeEach(() => {
    q = new InProcessQueue('test', { defaultConcurrency: 2 });
  });
  afterEach(async () => {
    await q.close();
  });

  it('runs a job and emits completed', async () => {
    q.process<{ n: number }>('double', async (job) => job.data.n * 2);
    const events: Array<{ type: string; id: string; result?: unknown }> = [];
    q.on('completed', (j: unknown, r: unknown) => {
      const job = j as { id: string };
      events.push({ type: 'completed', id: job.id, result: r });
    });
    q.on('active', (j: unknown) => {
      const job = j as { id: string };
      events.push({ type: 'active', id: job.id });
    });
    const job = await q.add('double', { n: 21 });
    await new Promise<void>((resolve) => {
      q.on('completed', () => resolve());
    });
    expect(events.some((e) => e.type === 'active' && e.id === job.id)).toBe(true);
    expect(events.some((e) => e.type === 'completed' && e.result === 42)).toBe(true);
    const final = await q.getJob(job.id);
    expect(final?.state).toBe('completed');
    expect(final?.returnvalue).toBe(42);
  });

  it('retries with exponential backoff and eventually fails', async () => {
    let attempts = 0;
    q.process('flaky', async () => {
      attempts++;
      throw new Error('boom');
    });
    const failures: Error[] = [];
    q.on('failed', (_j: unknown, err: unknown) => failures.push(err as Error));
    await q.add('flaky', {}, { attempts: 3, backoff: 1 });
    await new Promise<void>((resolve) => {
      q.on('failed', () => {
        if (attempts >= 3) resolve();
      });
    });
    expect(attempts).toBe(3);
    const failedId = listIdsByState(q, 'failed')[0];
    const j = await q.getJob(failedId);
    expect(j?.state).toBe('failed');
    expect(j?.failedReason).toBe('boom');
  });

  it('delays jobs with startAfter', async () => {
    q.process('echo', async (job) => job.data);
    const t0 = Date.now();
    const job = await q.add('echo', { x: 1 }, { startAfter: Date.now() + 200 });
    expect(job.state).toBe('delayed');
    await new Promise<void>((resolve) => q.on('completed', () => resolve()));
    expect(Date.now() - t0).toBeGreaterThanOrEqual(190);
  });

  it('respects concurrency', async () => {
    let inflight = 0;
    let peak = 0;
    q.process('slow', async () => {
      inflight++;
      peak = Math.max(peak, inflight);
      await new Promise((r) => setTimeout(r, 30));
      inflight--;
      return 'ok';
    });
    for (let i = 0; i < 5; i++) {
      await q.add('slow', i);
    }
    await new Promise<void>((resolve) => q.on('drained', () => resolve()));
    expect(peak).toBeLessThanOrEqual(2);
  });

  it('pause / resume', async () => {
    let ran = 0;
    q.process('count', async () => {
      ran++;
      return ran;
    });
    await q.pause();
    await q.add('count', {});
    await new Promise((r) => setTimeout(r, 50));
    expect(ran).toBe(0);
    await q.resume();
    await new Promise<void>((resolve) => q.on('completed', () => resolve()));
    expect(ran).toBe(1);
  });

  it('uses custom backoff function', async () => {
    const waits: number[] = [];
    let prev = 0;
    let attempts = 0;
    q.process('cb', async () => {
      attempts++;
      const now = Date.now();
      if (prev > 0) waits.push(now - prev);
      prev = now;
      throw new Error('x');
    });
    await q.add('cb', {}, { attempts: 3, backoff: (made) => made * 5 });
    await new Promise<void>((resolve) => {
      q.on('failed', () => {
        if (attempts >= 3) resolve();
      });
    });
    expect(waits[0]).toBeGreaterThanOrEqual(4);
  });

  it('rejects add() after close', async () => {
    await q.close();
    await expect(q.add('x', {})).rejects.toThrow(/closed/);
  });
});

describe('BullMqQueue', () => {
  it('throws a clear install hint when bullmq is missing', async () => {
    await expect(
      BullMqQueue.open('q', { connection: { host: 'localhost', port: 6379 } }),
    ).rejects.toThrow(/bullmq/);
  });
});
