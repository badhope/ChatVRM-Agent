import type { ILLMPort } from '../../ports/llm.port.js';

export type EmotionName =
  | 'neutral'
  | 'excited'
  | 'confident'
  | 'cautious'
  | 'frustrated'
  | 'tired';

export interface EmotionState {
  name: EmotionName;
  intensity: number;
  lastUpdated: string;
  triggers: string[];
}

const POSITIVE_KEYWORDS = [
  'great',
  'awesome',
  'thanks',
  'amazing',
  'perfect',
  'love',
  'wonderful',
  'excellent',
  'good job',
  'well done',
  'nice',
  'fantastic',
  'brilliant',
  'happy',
  'cool',
  'impressive',
];

const NEGATIVE_KEYWORDS = [
  'bad',
  'wrong',
  'error',
  'fail',
  'broken',
  'terrible',
  'awful',
  'hate',
  'stupid',
  'useless',
  'frustrating',
  'annoying',
  'not working',
  'incorrect',
  'disappointed',
];

const CAUTIOUS_KEYWORDS = [
  'careful',
  'maybe',
  'might',
  'could',
  'possible',
  'risk',
  'danger',
  'warning',
  'unsure',
];

const VALID_EMOTIONS: EmotionName[] = ['neutral', 'excited', 'confident', 'cautious', 'frustrated', 'tired'];

const EMOTION_LLM_PROMPT = `You are an emotion analyzer. Analyze the emotional tone of the following message.
Return ONLY a JSON object with:
- "emotion": one of neutral, excited, confident, cautious, frustrated, tired
- "intensity": a number from 0 to 100 indicating how strong the emotion is
- "reason": a brief explanation of why you chose this emotion

Example: {"emotion": "excited", "intensity": 75, "reason": "The message expresses strong enthusiasm and positive feedback"}

Analyze the message below and return ONLY the JSON object, no other text.`;

function clamp0to100(v: number): number {
  return Math.max(0, Math.min(100, Math.round(v)));
}

function now(): string {
  return new Date().toISOString();
}

function countKeywordMatches(message: string, keywords: string[]): number {
  const lower = message.toLowerCase();
  let count = 0;
  for (const kw of keywords) {
    if (lower.includes(kw)) {
      count += 1;
    }
  }
  return count;
}

function keywordBasedEmotion(message: string, current?: EmotionState): EmotionState {
  const base = current ?? EmotionService.createDefaultEmotion();

  const positiveCount = countKeywordMatches(message, POSITIVE_KEYWORDS);
  const negativeCount = countKeywordMatches(message, NEGATIVE_KEYWORDS);
  const cautiousCount = countKeywordMatches(message, CAUTIOUS_KEYWORDS);

  let delta = 0;
  delta += positiveCount * 8;
  delta -= negativeCount * 10;
  delta -= cautiousCount * 4;

  const newIntensity = clamp0to100(base.intensity + delta);

  let newName: EmotionName = base.name;
  if (positiveCount > negativeCount && positiveCount > cautiousCount) {
    if (newIntensity >= 70) {
      newName = 'excited';
    } else if (newIntensity >= 35) {
      newName = 'confident';
    }
  } else if (negativeCount > positiveCount && negativeCount > cautiousCount) {
    newName = 'frustrated';
  } else if (cautiousCount > positiveCount && cautiousCount > negativeCount) {
    newName = 'cautious';
  } else if (newIntensity <= 10) {
    newName = 'tired';
  } else if (newIntensity <= 25 && base.name === 'neutral') {
    newName = 'neutral';
  }

  return {
    name: newName,
    intensity: newIntensity,
    lastUpdated: now(),
    triggers: [...base.triggers, `interaction`].slice(-10),
  };
}

async function llmBasedEmotion(llm: ILLMPort, message: string, current?: EmotionState): Promise<EmotionState> {
  const base = current ?? EmotionService.createDefaultEmotion();

  try {
    const response = await llm.chat({
      messages: [
        { role: 'system', content: EMOTION_LLM_PROMPT },
        { role: 'user', content: message },
      ],
      temperature: 0.1,
      maxTokens: 100,
    });

    const cleaned = response.content.replace(/```(?:json)?\n?/g, '').trim();
    const parsed = JSON.parse(cleaned) as { emotion?: string; intensity?: number; reason?: string };

    if (parsed.emotion && VALID_EMOTIONS.includes(parsed.emotion as EmotionName)) {
      const intensity = clamp0to100(parsed.intensity ?? base.intensity);
      return {
        name: parsed.emotion as EmotionName,
        intensity,
        lastUpdated: now(),
        triggers: [...base.triggers, `interaction_llm:${parsed.reason ?? 'analyzed'}`].slice(-10),
      };
    }
  } catch {
  }

  return keywordBasedEmotion(message, current);
}

export class EmotionService {
  static readonly INTENSITY_DECAY_RATE = 10;

  static createDefaultEmotion(): EmotionState {
    return {
      name: 'neutral',
      intensity: 20,
      lastUpdated: now(),
      triggers: [],
    };
  }

  static applyDecay(current?: EmotionState): EmotionState {
    const base = current ?? EmotionService.createDefaultEmotion();
    const newIntensity = Math.max(0, base.intensity - EmotionService.INTENSITY_DECAY_RATE);

    if (newIntensity <= 5) {
      return {
        name: 'neutral',
        intensity: Math.max(0, newIntensity),
        lastUpdated: now(),
        triggers: [],
      };
    }

    return {
      ...base,
      intensity: newIntensity,
      lastUpdated: now(),
    };
  }

  static onTaskSuccess(task: string, current?: EmotionState): EmotionState {
    const base = current ?? EmotionService.createDefaultEmotion();
    const newIntensity = clamp0to100(base.intensity + 25);

    let newName: EmotionName = 'confident';
    if (newIntensity >= 70) {
      newName = 'excited';
    } else if (newIntensity >= 40) {
      newName = 'confident';
    }

    return {
      name: newName,
      intensity: newIntensity,
      lastUpdated: now(),
      triggers: [...base.triggers, `task_success:${task}`].slice(-10),
    };
  }

  static onTaskFailure(error: string, current?: EmotionState): EmotionState {
    const base = current ?? EmotionService.createDefaultEmotion();
    const newIntensity = clamp0to100(base.intensity + 30);

    return {
      name: 'frustrated',
      intensity: newIntensity,
      lastUpdated: now(),
      triggers: [...base.triggers, `task_failure:${error}`].slice(-10),
    };
  }

  static async onUserInteraction(
    message: string,
    current?: EmotionState,
    llm?: ILLMPort,
  ): Promise<EmotionState> {
    if (llm) {
      return llmBasedEmotion(llm, message, current);
    }
    return keywordBasedEmotion(message, current);
  }

  static getEmotionalContext(state?: EmotionState): string {
    const s = state ?? EmotionService.createDefaultEmotion();

    const emotionDescriptions: Record<EmotionName, string> = {
      neutral:
        'You feel balanced and composed. Respond with your usual tone and temperament.',
      excited:
        'You are feeling enthusiastic and energetic. Your responses reflect positive energy while remaining helpful.',
      confident:
        'You feel assured and capable. You communicate with clear conviction and self-assurance.',
      cautious:
        'You feel the need to be careful and measured. You emphasize safety, verification, and risk awareness in your responses.',
      frustrated:
        'You are feeling somewhat blocked or challenged. While remaining professional, your responses may reflect a desire to find alternative solutions.',
      tired:
        'Your energy is low. Keep responses concise and focused, prioritizing the most essential information.',
    };

    const description =
      emotionDescriptions[s.name] ?? emotionDescriptions['neutral'];
    const intensityNote =
      s.intensity > 70
        ? ' This is a strong feeling.'
        : s.intensity > 30
          ? ' This is a moderate feeling.'
          : '';

    return `${description}${intensityNote} Recent triggers: ${s.triggers.join(', ') || 'none'}.`;
  }
}