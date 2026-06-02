import { describe, it, expect } from 'vitest';
import {
  PersonalityService,
  PRESET_TRAITS,
} from '../../../domain/personality/personality.service.js';
import type {
  PersonalityProfile,
  PersonalityPreset,
} from '../../../domain/personality/personality.service.js';

function createBaseProfile(): PersonalityProfile {
  return PersonalityService.createIdentity('friendly_mentor');
}

describe('PersonalityService mergePresets', () => {
  describe('mergePresets should merge traits without duplicates', () => {
    it('should combine traits from both profiles without duplicates', () => {
      const base = createBaseProfile();
      const preset = PRESET_TRAITS['tech_expert'];

      const merged = PersonalityService.mergePresets(base, 'tech_expert');

      const expectedTraits = Array.from(new Set([...base.traits, ...preset.traits]));
      expect(merged.traits.sort()).toEqual(expectedTraits.sort());
      expect(merged.traits.length).toBe(expectedTraits.length);
    });

    it('should not duplicate traits already present', () => {
      const base = createBaseProfile();
      const baseTrait = base.traits[0];

      const merged = PersonalityService.mergePresets(base, 'friendly_mentor');

      const occurrences = merged.traits.filter((t) => t === baseTrait).length;
      expect(occurrences).toBe(1);
    });
  });

  describe('mergePresets should average overlap preferences', () => {
    it('should average overlapping preferences', () => {
      const base = createBaseProfile();
      const originalVerbosity = base.preferences.verbosity;
      const presetVerbosity = PRESET_TRAITS['tech_expert'].preferences.verbosity;

      const merged = PersonalityService.mergePresets(base, 'tech_expert');

      const expected = Math.round((originalVerbosity + presetVerbosity) / 2);
      expect(merged.preferences.verbosity).toBe(expected);
    });

    it('should average all overlapping preferences', () => {
      const base = createBaseProfile();

      const merged = PersonalityService.mergePresets(base, 'tech_expert');

      const overlapKeys = Object.keys(base.preferences).filter(
        (k) => k in PRESET_TRAITS['tech_expert'].preferences,
      );
      for (const key of overlapKeys) {
        const expected = Math.round(
          (base.preferences[key] + PRESET_TRAITS['tech_expert'].preferences[key]) / 2,
        );
        expect(merged.preferences[key]).toBe(expected);
      }
    });

    it('should round averaged values to integers', () => {
      const base = createBaseProfile();
      base.preferences.verbosity = 61;

      const merged = PersonalityService.mergePresets(base, 'tech_expert');

      expect(merged.preferences.verbosity).toBe(66);
    });
  });

  describe('mergePresets should add new preferences from preset', () => {
    it('should add new preferences that do not exist in base', () => {
      const base = createBaseProfile();
      delete base.preferences.humor;

      const merged = PersonalityService.mergePresets(base, 'tech_expert');

      expect(merged.preferences.humor).toBe(PRESET_TRAITS['tech_expert'].preferences.humor);
    });
  });

  describe('mergePresets should keep existing unique preferences', () => {
    it('should keep preferences that exist only in base profile', () => {
      const base = createBaseProfile();
      const customKey = 'customPref';
      base.preferences[customKey] = 99;

      const merged = PersonalityService.mergePresets(base, 'tech_expert');

      expect(merged.preferences[customKey]).toBe(99);
    });

    it('should not modify unique base preferences during merge', () => {
      const base = createBaseProfile();
      base.preferences['customScore'] = 50;

      const merged = PersonalityService.mergePresets(base, 'tech_expert');

      expect(merged.preferences['customScore']).toBe(50);
    });
  });

  describe('mergePresets should update timestamp', () => {
    it('should update updatedAt timestamp', () => {
      const base = createBaseProfile();
      const originalTimestamp = new Date(base.updatedAt).getTime();

      const merged = PersonalityService.mergePresets(base, 'tech_expert');

      const newTimestamp = new Date(merged.updatedAt).getTime();
      expect(newTimestamp).toBeGreaterThanOrEqual(originalTimestamp);
    });
  });

  describe('mergePresets with tech_expert preset', () => {
    it('should add tech_expert traits to base profile', () => {
      const base = createBaseProfile();

      const merged = PersonalityService.mergePresets(base, 'tech_expert');

      expect(merged.traits).toContain('analytical');
      expect(merged.traits).toContain('precise');
      expect(merged.traits).toContain('logical');
      expect(merged.traits).toContain('detail_oriented');
      expect(merged.traits).toContain('curious');
    });

    it('should merge tech_expert preferences correctly', () => {
      const base = createBaseProfile();

      const merged = PersonalityService.mergePresets(base, 'tech_expert');

      expect(merged.preferences.precision).toBeGreaterThan(base.preferences.precision);
    });
  });

  describe('mergePresets with creative_genius preset', () => {
    it('should add creative_genius traits to base profile', () => {
      const base = createBaseProfile();

      const merged = PersonalityService.mergePresets(base, 'creative_genius');

      expect(merged.traits).toContain('imaginative');
      expect(merged.traits).toContain('expressive');
      expect(merged.traits).toContain('playful');
      expect(merged.traits).toContain('abstract');
      expect(merged.traits).toContain('inspiring');
    });

    it('should significantly increase creativity preference', () => {
      const base = createBaseProfile();
      const originalCreativity = base.preferences.creativity;

      const merged = PersonalityService.mergePresets(base, 'creative_genius');

      expect(merged.preferences.creativity).toBeGreaterThan(originalCreativity);
    });
  });

  describe('mergePresets with pragmatic_worker preset', () => {
    it('should add pragmatic_worker traits to base profile', () => {
      const base = createBaseProfile();

      const merged = PersonalityService.mergePresets(base, 'pragmatic_worker');

      expect(merged.traits).toContain('efficient');
      expect(merged.traits).toContain('direct');
      expect(merged.traits).toContain('practical');
      expect(merged.traits).toContain('reliable');
      expect(merged.traits).toContain('concise');
    });

    it('should decrease verbosity through averaging', () => {
      const base = createBaseProfile();
      const originalVerbosity = base.preferences.verbosity;

      const merged = PersonalityService.mergePresets(base, 'pragmatic_worker');

      expect(merged.preferences.verbosity).toBeLessThan(originalVerbosity);
    });
  });

  describe('mergePresets should preserve existing profile id and name', () => {
    it('should preserve the original profile id', () => {
      const base = createBaseProfile();

      const merged = PersonalityService.mergePresets(base, 'tech_expert');

      expect(merged.id).toBe(base.id);
    });

    it('should preserve the original profile name', () => {
      const base = createBaseProfile();

      const merged = PersonalityService.mergePresets(base, 'creative_genius');

      expect(merged.name).toBe(base.name);
    });

    it('should preserve interaction count', () => {
      const base = createBaseProfile();
      const withInteractions = PersonalityService.incrementInteractions(base);
      const updated = PersonalityService.incrementInteractions(withInteractions);

      const merged = PersonalityService.mergePresets(updated, 'tech_expert');

      expect(merged.interactionCount).toBe(2);
    });

    it('should preserve createdAt timestamp', () => {
      const base = createBaseProfile();

      const merged = PersonalityService.mergePresets(base, 'pragmatic_worker');

      expect(merged.createdAt).toBe(base.createdAt);
    });
  });
});