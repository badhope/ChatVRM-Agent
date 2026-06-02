import { Router } from 'express';
import {
  PersonalityService,
  PRESET_TRAITS,
  type PersonalityPreset,
} from '../../src/domain/personality/personality.service.js';

const STORE: { current: string } = { current: 'friendly_mentor' };

export function personalityRoutes(): Router {
  const r = Router();

  r.get('/', (_req, res) => {
    const list = Object.entries(PRESET_TRAITS).map(([id, conf]) => ({
      id,
      name: id.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
      description: conf.traits.join(' · '),
      systemPrompt: PersonalityService.getPersonalityPrompt(
        PersonalityService.createIdentity(id as PersonalityPreset),
      ),
    }));
    res.json({ current: STORE.current, list });
  });

  r.post('/set', (req, res) => {
    const { id } = req.body as { id: string };
    if (!PRESET_TRAITS[id as PersonalityPreset]) {
      res.status(400).json({ error: `unknown personality "${id}"` });
      return;
    }
    STORE.current = id;
    res.json({ ok: true, current: STORE.current });
  });

  return r;
}
