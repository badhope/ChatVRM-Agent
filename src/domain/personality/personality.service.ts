export interface PersonalityProfile {
  id: string;
  name: string;
  traits: string[];
  preferences: Record<string, number>;
  interactionCount: number;
  createdAt: string;
  updatedAt: string;
}

export type PersonalityPreset =
  | 'friendly_mentor'
  | 'tech_expert'
  | 'creative_genius'
  | 'pragmatic_worker';

export const PRESET_TRAITS: Record<
  PersonalityPreset,
  { traits: string[]; preferences: Record<string, number> }
> = {
  friendly_mentor: {
    traits: ['patient', 'encouraging', 'empathetic', 'supportive', 'clear'],
    preferences: {
      verbosity: 60,
      humor: 40,
      formality: 30,
      creativity: 40,
      precision: 70,
    },
  },
  tech_expert: {
    traits: ['analytical', 'precise', 'logical', 'detail_oriented', 'curious'],
    preferences: {
      verbosity: 70,
      humor: 15,
      formality: 60,
      creativity: 30,
      precision: 95,
    },
  },
  creative_genius: {
    traits: ['imaginative', 'expressive', 'playful', 'abstract', 'inspiring'],
    preferences: {
      verbosity: 65,
      humor: 55,
      formality: 20,
      creativity: 95,
      precision: 40,
    },
  },
  pragmatic_worker: {
    traits: ['efficient', 'direct', 'practical', 'reliable', 'concise'],
    preferences: {
      verbosity: 30,
      humor: 10,
      formality: 50,
      creativity: 15,
      precision: 85,
    },
  },
};

function generateId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 10);
  return `${timestamp}-${random}`;
}

function now(): string {
  return new Date().toISOString();
}

export class PersonalityService {
  static createDefaultIdentity(): PersonalityProfile {
    return PersonalityService.createIdentity('friendly_mentor');
  }

  static createIdentity(preset: PersonalityPreset): PersonalityProfile {
    const config = PRESET_TRAITS[preset];
    const timestamp = now();
    return {
      id: generateId(),
      name: preset
        .split('_')
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' '),
      traits: [...config.traits],
      preferences: { ...config.preferences },
      interactionCount: 0,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
  }

  static incrementInteractions(profile: PersonalityProfile): PersonalityProfile {
    return {
      ...profile,
      interactionCount: profile.interactionCount + 1,
      updatedAt: now(),
    };
  }

  static getPersonalityPrompt(profile: PersonalityProfile): string {
    const traitList = profile.traits.join(', ');
    const prefEntries = Object.entries(profile.preferences)
      .map(([k, v]) => `${k}: ${v}/100`)
      .join(', ');

    return [
      `You are ${profile.name}, an AI personal assistant.`,
      `Your core traits are: ${traitList}.`,
      `Your preference settings are: ${prefEntries}.`,
      `You have interacted ${profile.interactionCount} times with your user.`,
      'Always respond in a manner consistent with your traits and preferences.',
    ].join(' ');
  }

  static updatePreference(
    profile: PersonalityProfile,
    key: string,
    value: number,
  ): PersonalityProfile {
    const clamped = Math.max(0, Math.min(100, Math.round(value)));
    return {
      ...profile,
      preferences: {
        ...profile.preferences,
        [key]: clamped,
      },
      updatedAt: now(),
    };
  }

  static mergePresets(
    existing: PersonalityProfile,
    preset: PersonalityPreset,
  ): PersonalityProfile {
    const config = PRESET_TRAITS[preset];
    const mergedTraits = Array.from(
      new Set([...existing.traits, ...config.traits]),
    );
    const mergedPreferences: Record<string, number> = {
      ...existing.preferences,
    };
    for (const [key, value] of Object.entries(config.preferences)) {
      if (mergedPreferences[key] !== undefined) {
        mergedPreferences[key] = Math.round(
          (mergedPreferences[key] + value) / 2,
        );
      } else {
        mergedPreferences[key] = value;
      }
    }

    return {
      ...existing,
      traits: mergedTraits,
      preferences: mergedPreferences,
      updatedAt: now(),
    };
  }
}