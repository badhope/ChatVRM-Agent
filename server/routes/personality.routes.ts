import { Router, type Request, type Response } from 'express';
import { randomUUID } from 'node:crypto';
import {
  PersonalityService,
  PRESET_TRAITS,
  isValidPersonalityPreset,
  type PersonalityProfile,
  type PersonalityPreset,
} from '../../src/domain/personality/personality.service.js';

interface CustomPersonality {
  id: string;
  profile: PersonalityProfile;
  createdAt: string;
  updatedAt: string;
}

interface Store {
  current: string; // refers to either a preset id or a custom id
  custom: Map<string, CustomPersonality>;
}

const STORE: Store = {
  current: 'friendly_mentor',
  custom: new Map<string, CustomPersonality>(),
};

const SNAKE_CASE = /^[a-z][a-z0-9_]{0,40}$/;

function isValidCustomId(id: string): boolean {
  return SNAKE_CASE.test(id) && !isValidPersonalityPreset(id);
}

function now(): string {
  return new Date().toISOString();
}

function buildPresetListItem(id: PersonalityPreset) {
  const conf = PRESET_TRAITS[id];
  const profile = PersonalityService.createIdentity(id);
  return {
    kind: 'preset' as const,
    id,
    name: id
      .split('_')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' '),
    description: conf.traits.join(' · '),
    traits: conf.traits,
    preferences: conf.preferences,
    systemPrompt: PersonalityService.getPersonalityPrompt(profile),
  };
}

function buildCustomListItem(c: CustomPersonality) {
  return {
    kind: 'custom' as const,
    id: c.id,
    name: c.profile.name,
    description: c.profile.traits.join(' · '),
    traits: c.profile.traits,
    preferences: c.profile.preferences,
    systemPrompt: PersonalityService.getPersonalityPrompt(c.profile),
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  };
}

function resolveCurrent(): { kind: 'preset' | 'custom'; id: string; profile: PersonalityProfile } {
  const id = STORE.current;
  if (isValidPersonalityPreset(id)) {
    return { kind: 'preset', id, profile: PersonalityService.createIdentity(id) };
  }
  const custom = STORE.custom.get(id);
  if (custom) {
    return { kind: 'custom', id, profile: custom.profile };
  }
  // Fallback
  STORE.current = 'friendly_mentor';
  return { kind: 'preset', id: 'friendly_mentor', profile: PersonalityService.createIdentity('friendly_mentor') };
}

export function personalityRoutes(): Router {
  const r = Router();

  /**
   * GET /api/personality
   * Returns: { current, kind, presets: [...], custom: [...] }
   */
  r.get('/', (_req, res) => {
    const resolved = resolveCurrent();
    res.json({
      current: resolved.id,
      kind: resolved.kind,
      systemPrompt: PersonalityService.getPersonalityPrompt(resolved.profile),
      presets: (Object.keys(PRESET_TRAITS) as PersonalityPreset[]).map(buildPresetListItem),
      custom: [...STORE.custom.values()].map(buildCustomListItem),
    });
  });

  /**
   * GET /api/personality/current
   */
  r.get('/current', (_req, res) => {
    const resolved = resolveCurrent();
    res.json({
      current: resolved.id,
      kind: resolved.kind,
      profile: resolved.profile,
      systemPrompt: PersonalityService.getPersonalityPrompt(resolved.profile),
    });
  });

  /**
   * POST /api/personality/set
   * Body: { id: string }
   */
  r.post('/set', (req, res) => {
    const { id } = req.body as { id: string };
    if (typeof id !== 'string') {
      res.status(400).json({ error: 'id is required' });
      return;
    }
    if (isValidPersonalityPreset(id) || STORE.custom.has(id)) {
      STORE.current = id;
      const resolved = resolveCurrent();
      res.json({
        ok: true,
        current: id,
        kind: resolved.kind,
        systemPrompt: PersonalityService.getPersonalityPrompt(resolved.profile),
      });
      return;
    }
    res.status(404).json({ error: `Unknown personality "${id}".` });
  });

  /**
   * POST /api/personality/custom
   * Body: { id, name, traits: string[], preferences: Record<string, number>, systemPrompt? }
   * The `systemPrompt` is stored alongside as the canonical description of the personality.
   */
  r.post('/custom', (req: Request, res: Response) => {
    const body = req.body as {
      id?: string;
      name?: string;
      traits?: unknown;
      preferences?: unknown;
      systemPrompt?: string;
    };

    const id = typeof body.id === 'string' ? body.id.trim() : '';
    if (!isValidCustomId(id)) {
      res.status(400).json({
        error:
          'id must be snake_case (lowercase, digits, underscores, ≤40 chars, start with letter) and not collide with a built-in preset',
      });
      return;
    }
    if (STORE.custom.has(id)) {
      res.status(409).json({ error: `Custom personality "${id}" already exists` });
      return;
    }

    const name = typeof body.name === 'string' && body.name.trim().length > 0
      ? body.name.trim().slice(0, 60)
      : id
          .split('_')
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
          .join(' ');

    const traits: string[] = Array.isArray(body.traits)
      ? (body.traits as unknown[]).filter((t): t is string => typeof t === 'string').map((t) => t.trim()).filter(Boolean).slice(0, 12)
      : ['adaptive'];

    const preferences: Record<string, number> = {};
    if (body.preferences && typeof body.preferences === 'object') {
      for (const [k, v] of Object.entries(body.preferences as Record<string, unknown>)) {
        if (typeof v === 'number' && Number.isFinite(v)) {
          preferences[k.slice(0, 40)] = Math.max(0, Math.min(100, Math.round(v)));
        }
      }
    }
    if (Object.keys(preferences).length === 0) {
      Object.assign(preferences, { verbosity: 50, humor: 30, formality: 40, creativity: 50, precision: 60 });
    }

    const ts = now();
    const profile: PersonalityProfile = {
      id: randomUUID(),
      name,
      traits,
      preferences,
      interactionCount: 0,
      createdAt: ts,
      updatedAt: ts,
    };

    STORE.custom.set(id, {
      id,
      profile,
      createdAt: ts,
      updatedAt: ts,
    });

    const item = buildCustomListItem(STORE.custom.get(id)!);
    res.status(201).json({ ok: true, ...item });
  });

  /**
   * PATCH /api/personality/custom/:id
   * Body: any subset of { name, traits, preferences, systemPrompt }
   */
  r.patch('/custom/:id', (req, res) => {
    const id = req.params.id;
    const existing = STORE.custom.get(id);
    if (!existing) {
      res.status(404).json({ error: `Custom personality "${id}" not found` });
      return;
    }
    const body = req.body as {
      name?: string;
      traits?: unknown;
      preferences?: unknown;
    };

    if (typeof body.name === 'string' && body.name.trim().length > 0) {
      existing.profile.name = body.name.trim().slice(0, 60);
    }
    if (Array.isArray(body.traits)) {
      existing.profile.traits = (body.traits as unknown[])
        .filter((t): t is string => typeof t === 'string')
        .map((t) => t.trim())
        .filter(Boolean)
        .slice(0, 12);
      if (existing.profile.traits.length === 0) existing.profile.traits = ['adaptive'];
    }
    if (body.preferences && typeof body.preferences === 'object') {
      const next: Record<string, number> = { ...existing.profile.preferences };
      for (const [k, v] of Object.entries(body.preferences as Record<string, unknown>)) {
        if (typeof v === 'number' && Number.isFinite(v)) {
          next[k.slice(0, 40)] = Math.max(0, Math.min(100, Math.round(v)));
        }
      }
      existing.profile.preferences = next;
    }
    existing.profile.updatedAt = now();
    existing.updatedAt = existing.profile.updatedAt;

    res.json({ ok: true, ...buildCustomListItem(existing) });
  });

  /**
   * DELETE /api/personality/custom/:id
   */
  r.delete('/custom/:id', (req, res) => {
    const id = req.params.id;
    const existing = STORE.custom.get(id);
    if (!existing) {
      res.status(404).json({ error: `Custom personality "${id}" not found` });
      return;
    }
    STORE.custom.delete(id);
    if (STORE.current === id) STORE.current = 'friendly_mentor';
    res.json({ ok: true, removed: id, current: STORE.current });
  });

  /**
   * POST /api/personality/duplicate
   * Body: { sourceId, newId }
   * Clones a preset or custom personality into a new custom one.
   */
  r.post('/duplicate', (req, res) => {
    const { sourceId, newId } = req.body as { sourceId?: string; newId?: string };
    if (typeof sourceId !== 'string' || typeof newId !== 'string') {
      res.status(400).json({ error: 'sourceId and newId are required' });
      return;
    }
    if (!isValidCustomId(newId)) {
      res.status(400).json({ error: 'newId must be valid snake_case and not collide with a preset' });
      return;
    }
    if (STORE.custom.has(newId)) {
      res.status(409).json({ error: `Custom personality "${newId}" already exists` });
      return;
    }
    let base: PersonalityProfile;
    if (isValidPersonalityPreset(sourceId)) {
      base = PersonalityService.createIdentity(sourceId);
    } else {
      const c = STORE.custom.get(sourceId);
      if (!c) {
        res.status(404).json({ error: `Source personality "${sourceId}" not found` });
        return;
      }
      base = { ...c.profile, id: randomUUID() };
    }
    const ts = now();
    const cloned: CustomPersonality = {
      id: newId,
      profile: { ...base, name: base.name + ' (Copy)', createdAt: ts, updatedAt: ts },
      createdAt: ts,
      updatedAt: ts,
    };
    STORE.custom.set(newId, cloned);
    res.status(201).json({ ok: true, ...buildCustomListItem(cloned) });
  });

  /**
   * POST /api/personality/reset
   * Wipe all custom personalities and reset current to friendly_mentor.
   */
  r.post('/reset', (_req, res) => {
    STORE.custom.clear();
    STORE.current = 'friendly_mentor';
    res.json({ ok: true, current: STORE.current });
  });

  return r;
}
