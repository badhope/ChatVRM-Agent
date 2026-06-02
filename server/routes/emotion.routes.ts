import { Router } from 'express';
import { EmotionService } from '../../src/domain/personality/emotion.service.js';

const STORE = {
  emotion: EmotionService.createDefaultEmotion(),
};

export function emotionRoutes(): Router {
  const r = Router();

  r.get('/', (_req, res) => {
    res.json(STORE.emotion);
  });

  r.post('/update', (req, res) => {
    const { name, intensity, lastUpdated, triggers } = req.body as Record<string, unknown>;
    const next: typeof STORE.emotion = { ...STORE.emotion };
    if (typeof name === 'string') next.name = name as typeof next.name;
    if (typeof intensity === 'number') {
      next.intensity = Math.max(0, Math.min(100, intensity));
    }
    if (Array.isArray(triggers)) {
      next.triggers = triggers.filter((t) => typeof t === 'string') as string[];
    } else {
      next.triggers = [...next.triggers, `update:${new Date().toISOString()}`].slice(-10);
    }
    next.lastUpdated = new Date().toISOString();
    if (typeof lastUpdated === 'string') next.lastUpdated = lastUpdated;
    STORE.emotion = next;
    res.json(STORE.emotion);
  });

  return r;
}

export function updateEmotionFromInteraction(
  delta: { intensity?: number; name?: string } = {},
): void {
  const base = STORE.emotion;
  const nextIntensity =
    typeof delta.intensity === 'number'
      ? Math.max(0, Math.min(100, base.intensity + delta.intensity))
      : base.intensity;
  STORE.emotion = {
    name: delta.name ?? base.name,
    intensity: nextIntensity,
    lastUpdated: new Date().toISOString(),
    triggers: [...base.triggers, `interaction:${new Date().toISOString()}`].slice(-10),
  };
}

export function getEmotionState() {
  return STORE.emotion;
}
