import { Router, type Request, type Response } from 'express';
import { EmotionService } from '../../src/domain/personality/emotion.service.js';

const MAX_HISTORY = 200;

interface EmotionHistoryEntry {
  id: number;
  name: string;
  intensity: number;
  triggers: string[];
  source: 'manual' | 'interaction' | 'reset' | 'ai';
  timestamp: string;
  note?: string;
}

const STORE = {
  emotion: EmotionService.createDefaultEmotion(),
  history: [] as EmotionHistoryEntry[],
  nextId: 1,
};

function now(): string {
  return new Date().toISOString();
}

function pushHistory(prevIntensity: number, prevName: string, source: EmotionHistoryEntry['source'], note?: string) {
  const entry: EmotionHistoryEntry = {
    id: STORE.nextId++,
    name: STORE.emotion.name,
    intensity: STORE.emotion.intensity,
    triggers: [...STORE.emotion.triggers],
    source,
    timestamp: STORE.emotion.lastUpdated,
    note,
  };
  STORE.history.push(entry);
  if (STORE.history.length > MAX_HISTORY) STORE.history.splice(0, STORE.history.length - MAX_HISTORY);
  // Prevent unused-var lint: prevIntensity/prevName retained for potential logging
  void prevIntensity; void prevName;
}

export function emotionRoutes(): Router {
  const r = Router();

  /**
   * GET /api/emotion
   */
  r.get('/', (_req, res) => {
    res.json(STORE.emotion);
  });

  /**
   * GET /api/emotion/history?limit=50
   */
  r.get('/history', (req, res) => {
    const limit = Math.min(parseInt((req.query.limit as string) ?? '50', 10) || 50, MAX_HISTORY);
    const source = req.query.source as string | undefined;
    const filtered = source ? STORE.history.filter((h) => h.source === source) : STORE.history;
    const sorted = [...filtered].sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));
    res.json({
      total: STORE.history.length,
      count: sorted.length,
      items: sorted.slice(0, limit),
    });
  });

  /**
   * POST /api/emotion/update
   * Body: { name?, intensity?, triggers?, note? }
   */
  r.post('/update', (req: Request, res: Response) => {
    const { name, intensity, lastUpdated, triggers, note } = req.body as Record<string, unknown>;
    const prevName = STORE.emotion.name;
    const prevIntensity = STORE.emotion.intensity;
    const next: typeof STORE.emotion = { ...STORE.emotion };
    if (typeof name === 'string') next.name = name as typeof next.name;
    if (typeof intensity === 'number') {
      next.intensity = Math.max(0, Math.min(100, intensity));
    }
    if (Array.isArray(triggers)) {
      next.triggers = (triggers as unknown[]).filter((t): t is string => typeof t === 'string').slice(-10);
    } else {
      next.triggers = [...next.triggers, `update:${now()}`].slice(-10);
    }
    next.lastUpdated = typeof lastUpdated === 'string' ? lastUpdated : now();
    STORE.emotion = next;
    const finalNote = typeof note === 'string' ? note.slice(0, 120) : undefined;
    pushHistory(prevIntensity, prevName, 'manual', finalNote);
    res.json(STORE.emotion);
  });

  /**
   * POST /api/emotion/decay
   * Apply intensity decay (from EmotionService).
   */
  r.post('/decay', (_req, res) => {
    const prevName = STORE.emotion.name;
    const prevIntensity = STORE.emotion.intensity;
    STORE.emotion = EmotionService.applyDecay(STORE.emotion);
    pushHistory(prevIntensity, prevName, 'manual', 'decay');
    res.json(STORE.emotion);
  });

  /**
   * POST /api/emotion/reset
   */
  r.post('/reset', (_req, res) => {
    const prevName = STORE.emotion.name;
    const prevIntensity = STORE.emotion.intensity;
    STORE.emotion = EmotionService.createDefaultEmotion();
    pushHistory(prevIntensity, prevName, 'reset', 'reset to default');
    res.json(STORE.emotion);
  });

  /**
   * DELETE /api/emotion/history
   * Wipe history. Body optionally accepts { id } to delete one entry.
   */
  r.delete('/history', (req, res) => {
    const { id } = (req.body ?? {}) as { id?: number };
    if (typeof id === 'number') {
      const idx = STORE.history.findIndex((h) => h.id === id);
      if (idx < 0) {
        res.status(404).json({ error: 'history entry not found' });
        return;
      }
      STORE.history.splice(idx, 1);
      res.json({ ok: true, removed: 1 });
      return;
    }
    const removed = STORE.history.length;
    STORE.history.length = 0;
    res.json({ ok: true, removed });
  });

  return r;
}

export function updateEmotionFromInteraction(
  delta: { intensity?: number; name?: string } = {},
): void {
  const prevName = STORE.emotion.name;
  const prevIntensity = STORE.emotion.intensity;
  const base = STORE.emotion;
  const nextIntensity =
    typeof delta.intensity === 'number'
      ? Math.max(0, Math.min(100, base.intensity + delta.intensity))
      : base.intensity;
  STORE.emotion = {
    name: (delta.name as typeof base.name) ?? base.name,
    intensity: nextIntensity,
    lastUpdated: now(),
    triggers: [...base.triggers, `interaction:${now()}`].slice(-10),
  };
  pushHistory(prevIntensity, prevName, 'interaction', `delta ${delta.intensity ?? 0}`);
}

export function getEmotionState() {
  return STORE.emotion;
}

export function getEmotionHistory() {
  return STORE.history;
}
