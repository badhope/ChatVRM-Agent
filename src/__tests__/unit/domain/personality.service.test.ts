import { describe, it, expect, vi } from 'vitest';
import {
  PersonalityService,
  PRESET_TRAITS,
  isValidPersonalityPreset,
} from '../../../domain/personality/personality.service.js';
import type {
  PersonalityProfile,
  PersonalityPreset,
} from '../../../domain/personality/personality.service.js';

describe('PersonalityService', () => {
  describe('should create default friendly_mentor identity', () => {
    it('should create friendly_mentor as default', () => {
      const profile = PersonalityService.createDefaultIdentity();

      expect(profile.name).toBe('Friendly Mentor');
      expect(profile.traits).toContain('patient');
      expect(profile.traits).toContain('encouraging');
      expect(profile.traits).toContain('empathetic');
      expect(profile.interactionCount).toBe(0);
    });

    it('should have default preferences', () => {
      const profile = PersonalityService.createDefaultIdentity();

      expect(profile.preferences.verbosity).toBe(60);
      expect(profile.preferences.precision).toBe(70);
      expect(profile.preferences.creativity).toBe(40);
    });
  });

  describe('should create tech_expert identity', () => {
    it('should create tech_expert profile', () => {
      const profile = PersonalityService.createIdentity('tech_expert');

      expect(profile.name).toBe('Tech Expert');
      expect(profile.traits).toContain('analytical');
      expect(profile.traits).toContain('precise');
      expect(profile.traits).toContain('logical');
      expect(profile.preferences.precision).toBe(95);
      expect(profile.preferences.creativity).toBe(30);
    });
  });

  describe('should create creative_genius identity', () => {
    it('should create creative_genius profile', () => {
      const profile = PersonalityService.createIdentity('creative_genius');

      expect(profile.name).toBe('Creative Genius');
      expect(profile.traits).toContain('imaginative');
      expect(profile.traits).toContain('expressive');
      expect(profile.traits).toContain('playful');
      expect(profile.preferences.creativity).toBe(95);
      expect(profile.preferences.formality).toBe(20);
    });
  });

  describe('should create pragmatic_worker identity', () => {
    it('should create pragmatic_worker profile', () => {
      const profile = PersonalityService.createIdentity('pragmatic_worker');

      expect(profile.name).toBe('Pragmatic Worker');
      expect(profile.traits).toContain('efficient');
      expect(profile.traits).toContain('direct');
      expect(profile.traits).toContain('practical');
      expect(profile.preferences.verbosity).toBe(30);
      expect(profile.preferences.humor).toBe(10);
    });
  });

  describe('should increment interactions', () => {
    it('should increment interactionCount by 1', () => {
      const profile = PersonalityService.createDefaultIdentity();
      expect(profile.interactionCount).toBe(0);

      const updated = PersonalityService.incrementInteractions(profile);

      expect(updated.interactionCount).toBe(1);
    });

    it('should update the updatedAt timestamp', () => {
      const profile = PersonalityService.createDefaultIdentity();
      const originalTimestamp = new Date(profile.updatedAt).getTime();

      const updated = PersonalityService.incrementInteractions(profile);

      const newTimestamp = new Date(updated.updatedAt).getTime();
      expect(newTimestamp).toBeGreaterThanOrEqual(originalTimestamp);
    });

    it('should increment multiple times', () => {
      let profile = PersonalityService.createDefaultIdentity();
      profile = PersonalityService.incrementInteractions(profile);
      profile = PersonalityService.incrementInteractions(profile);
      profile = PersonalityService.incrementInteractions(profile);

      expect(profile.interactionCount).toBe(3);
    });
  });

  describe('should generate personality prompt', () => {
    it('should include name in prompt', () => {
      const profile = PersonalityService.createIdentity('tech_expert');

      const prompt = PersonalityService.getPersonalityPrompt(profile);

      expect(prompt).toContain('Tech Expert');
    });

    it('should include traits in prompt', () => {
      const profile = PersonalityService.createDefaultIdentity();

      const prompt = PersonalityService.getPersonalityPrompt(profile);

      expect(prompt).toContain('patient');
      expect(prompt).toContain('encouraging');
    });

    it('should include interaction count in prompt', () => {
      const profile = PersonalityService.createDefaultIdentity();
      const updated = PersonalityService.incrementInteractions(profile);

      const prompt = PersonalityService.getPersonalityPrompt(updated);

      expect(prompt).toContain('1 times');
    });

    it('should include preference settings', () => {
      const profile = PersonalityService.createDefaultIdentity();

      const prompt = PersonalityService.getPersonalityPrompt(profile);

      expect(prompt).toContain('verbosity');
      expect(prompt).toContain('precision');
    });
  });

  describe('should update preferences', () => {
    it('should update a specific preference', () => {
      const profile = PersonalityService.createDefaultIdentity();

      const updated = PersonalityService.updatePreference(profile, 'verbosity', 80);

      expect(updated.preferences.verbosity).toBe(80);
    });

    it('should clamp value between 0 and 100', () => {
      const profile = PersonalityService.createDefaultIdentity();

      const low = PersonalityService.updatePreference(profile, 'humor', -10);
      expect(low.preferences.humor).toBe(0);

      const high = PersonalityService.updatePreference(profile, 'humor', 150);
      expect(high.preferences.humor).toBe(100);
    });

    it('should round decimal values', () => {
      const profile = PersonalityService.createDefaultIdentity();

      const updated = PersonalityService.updatePreference(profile, 'precision', 75.6);

      expect(updated.preferences.precision).toBe(76);
    });

    it('should update updatedAt on preference change', () => {
      const profile = PersonalityService.createDefaultIdentity();
      const originalTimestamp = new Date(profile.updatedAt).getTime();

      const updated = PersonalityService.updatePreference(profile, 'formality', 50);

      const newTimestamp = new Date(updated.updatedAt).getTime();
      expect(newTimestamp).toBeGreaterThanOrEqual(originalTimestamp);
    });
  });

  describe('preset validation (regression: invalid preset crashed)', () => {
    it('isValidPersonalityPreset returns true for known presets', () => {
      expect(isValidPersonalityPreset('friendly_mentor')).toBe(true);
      expect(isValidPersonalityPreset('tech_expert')).toBe(true);
    });

    it('isValidPersonalityPreset returns false for unknown presets', () => {
      expect(isValidPersonalityPreset('not_a_real_preset')).toBe(false);
      expect(isValidPersonalityPreset('')).toBe(false);
    });

    it('isValidPersonalityPreset rejects prototype-pollution attempts', () => {
      expect(isValidPersonalityPreset('__proto__')).toBe(false);
      expect(isValidPersonalityPreset('toString')).toBe(false);
      expect(isValidPersonalityPreset('hasOwnProperty')).toBe(false);
    });

    it('createIdentity throws a helpful error for invalid preset (not a crash)', () => {
      expect(() =>
        PersonalityService.createIdentity('not_real' as PersonalityPreset),
      ).toThrow(/Unknown personality preset.*not_real/);
    });
  });
});