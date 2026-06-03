import { Router } from 'express';
import {
  PersonalityService,
  PRESET_TRAITS,
  isValidPersonalityPreset,
} from '../../src/domain/personality/personality.service.js';

const STORE: { current: string } = { current: 'friendly_mentor' };

export function personalityRoutes(): Router {
  const r = Router();

  r.get('/', (_req, res) => {
    const list = Object.entries(PRESET_TRAITS).map(([id, conf]) => {
      if (!isValidPersonalityPreset(id)) return null;
      return {
        id,
        name: id
          .split('_')
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
          .join(' '),
        description: conf.traits.join(' · '),
        systemPrompt: PersonalityService.getPersonalityPrompt(
          PersonalityService.createIdentity(id),
        ),
      };
    }).filter((x): x is NonNullable<typeof x> => x !== null);
    res.json({ current: STORE.current, list });
  });

  r.post('/set', (req, res) => {
    const { id } = req.body as { id: string };
    if (!isValidPersonalityPreset(id)) {
      res.status(400).json({ error: `Unknown personality preset "${id}".` });
      return;
    }
    const identity = PersonalityService.createIdentity(id);
    STORE.current = id;
    res.json({ ok: true, current: STORE.current, preset: identity });
  });

  return r;
}
