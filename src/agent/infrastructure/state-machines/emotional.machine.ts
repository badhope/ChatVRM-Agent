/**
 * 情绪状态机（基础设施层）
 */

import { setup, createActor, assign } from 'xstate';
import type { Emotion, EmotionalEvent } from '../../domain/models/emotion.model.js';
import { EmotionService } from '../../domain/services/emotion.service.js';

// ==================== 状态机定义 ====================

type MachineEvent =
  | { type: 'TASK_SUCCESS'; reason: string }
  | { type: 'TASK_FAILURE'; reason: string }
  | { type: 'USER_PRAISE'; reason: string }
  | { type: 'USER_CORRECTION'; reason: string }
  | { type: 'LONG_SESSION' }
  | { type: 'NEW_CHALLENGE'; reason: string }
  | { type: 'DECAY' }
  | { type: 'RESET' };

interface MachineContext {
  intensity: number;
  mood: number;
  history: EmotionalEvent[];
  successCount: number;
}

function getEventReason(event: unknown): string {
  if (event && typeof event === 'object' && 'reason' in event) {
    return (event as { reason: string }).reason;
  }
  return 'unknown';
}

export const emotionalMachine = setup({
  types: { context: {} as MachineContext, events: {} as MachineEvent },
  guards: {
    shouldBecomeExcited: ({ context }) => context.successCount >= 3,
    isIntensityLow: ({ context }) => context.intensity < 0.15,
  },
}).createMachine({
  id: 'emotional',
  initial: 'neutral',
  context: { intensity: 0.3, mood: 0, history: [], successCount: 0 },
  states: {
    neutral: {
      on: {
        TASK_SUCCESS: {
          target: 'confident',
          actions: [
            assign({
              intensity: 0.7,
              mood: ({ context }) => EmotionService.clamp(context.mood + 0.15, -1, 1),
              successCount: ({ context }) => context.successCount + 1,
              history: ({ context }, event) => [
                ...context.history,
                EmotionService.createHistoryEntry('confident', 0.7, getEventReason(event)),
              ],
            }),
          ],
        },
        TASK_FAILURE: {
          target: 'frustrated',
          actions: [
            assign({
              intensity: 0.8,
              mood: ({ context }) => EmotionService.clamp(context.mood - 0.25, -1, 1),
              successCount: 0,
              history: ({ context }, event) => [
                ...context.history,
                EmotionService.createHistoryEntry('frustrated', 0.8, getEventReason(event)),
              ],
            }),
          ],
        },
        USER_PRAISE: {
          target: 'excited',
          actions: [
            assign({
              intensity: 0.9,
              mood: ({ context }) => EmotionService.clamp(context.mood + 0.3, -1, 1),
              history: ({ context }, event) => [
                ...context.history,
                EmotionService.createHistoryEntry('excited', 0.9, getEventReason(event)),
              ],
            }),
          ],
        },
        USER_CORRECTION: {
          target: 'cautious',
          actions: [
            assign({
              intensity: 0.6,
              mood: ({ context }) => EmotionService.clamp(context.mood - 0.15, -1, 1),
              history: ({ context }, event) => [
                ...context.history,
                EmotionService.createHistoryEntry('cautious', 0.6, getEventReason(event)),
              ],
            }),
          ],
        },
        LONG_SESSION: {
          target: 'tired',
          actions: [
            assign({
              intensity: 0.5,
              mood: ({ context }) => EmotionService.clamp(context.mood - 0.1, -1, 1),
              history: ({ context }) => [
                ...context.history,
                EmotionService.createHistoryEntry('tired', 0.5, '长时间工作，感到疲劳'),
              ],
            }),
          ],
        },
        NEW_CHALLENGE: {
          target: 'curious',
          actions: [
            assign({
              intensity: 0.6,
              mood: ({ context }) => EmotionService.clamp(context.mood + 0.1, -1, 1),
              history: ({ context }, event) => [
                ...context.history,
                EmotionService.createHistoryEntry('curious', 0.6, getEventReason(event)),
              ],
            }),
          ],
        },
      },
    },
    focused: {
      on: {
        TASK_SUCCESS: {
          target: 'confident',
          actions: [
            assign({
              intensity: 0.7,
              mood: ({ context }) => EmotionService.clamp(context.mood + 0.15, -1, 1),
              successCount: ({ context }) => context.successCount + 1,
              history: ({ context }, event) => [
                ...context.history,
                EmotionService.createHistoryEntry('confident', 0.7, getEventReason(event)),
              ],
            }),
          ],
        },
        TASK_FAILURE: {
          target: 'frustrated',
          actions: [
            assign({
              intensity: 0.8,
              mood: ({ context }) => EmotionService.clamp(context.mood - 0.25, -1, 1),
              successCount: 0,
              history: ({ context }, event) => [
                ...context.history,
                EmotionService.createHistoryEntry('frustrated', 0.8, getEventReason(event)),
              ],
            }),
          ],
        },
        DECAY: {
          target: 'neutral',
          guard: 'isIntensityLow',
          actions: [assign({ intensity: 0.1 })],
        },
      },
    },
    confident: {
      on: {
        TASK_SUCCESS: [
          {
            guard: 'shouldBecomeExcited',
            target: 'excited',
            actions: [
              assign({
                intensity: 0.8,
                mood: ({ context }) => EmotionService.clamp(context.mood + 0.2, -1, 1),
                successCount: ({ context }) => context.successCount + 1,
                history: ({ context }, event) => [
                  ...context.history,
                  EmotionService.createHistoryEntry('excited', 0.8, `连续多次成功: ${getEventReason(event)}`),
                ],
              }),
            ],
          },
          {
            target: 'confident',
            actions: [
              assign({
                intensity: ({ context }) => Math.min(1.0, context.intensity + 0.1),
                mood: ({ context }) => EmotionService.clamp(context.mood + 0.1, -1, 1),
                successCount: ({ context }) => context.successCount + 1,
                history: ({ context }, event) => [
                  ...context.history,
                  EmotionService.createHistoryEntry('confident', 0.7, getEventReason(event)),
                ],
              }),
            ],
          },
        ],
        TASK_FAILURE: {
          target: 'frustrated',
          actions: [
            assign({
              intensity: 0.8,
              mood: ({ context }) => EmotionService.clamp(context.mood - 0.25, -1, 1),
              successCount: 0,
              history: ({ context }, event) => [
                ...context.history,
                EmotionService.createHistoryEntry('frustrated', 0.8, getEventReason(event)),
              ],
            }),
          ],
        },
        DECAY: {
          target: 'neutral',
          guard: 'isIntensityLow',
          actions: [assign({ intensity: 0.1 })],
        },
      },
    },
    cautious: {
      on: {
        TASK_SUCCESS: {
          target: 'confident',
          actions: [
            assign({
              intensity: 0.7,
              mood: ({ context }) => EmotionService.clamp(context.mood + 0.15, -1, 1),
              successCount: ({ context }) => context.successCount + 1,
              history: ({ context }, event) => [
                ...context.history,
                EmotionService.createHistoryEntry('confident', 0.7, getEventReason(event)),
              ],
            }),
          ],
        },
        TASK_FAILURE: {
          target: 'frustrated',
          actions: [
            assign({
              intensity: 0.8,
              mood: ({ context }) => EmotionService.clamp(context.mood - 0.25, -1, 1),
              history: ({ context }, event) => [
                ...context.history,
                EmotionService.createHistoryEntry('frustrated', 0.8, getEventReason(event)),
              ],
            }),
          ],
        },
        DECAY: {
          target: 'neutral',
          guard: 'isIntensityLow',
          actions: [assign({ intensity: 0.1 })],
        },
      },
    },
    curious: {
      on: {
        TASK_SUCCESS: {
          target: 'confident',
          actions: [
            assign({
              intensity: 0.7,
              mood: ({ context }) => EmotionService.clamp(context.mood + 0.15, -1, 1),
              successCount: ({ context }) => context.successCount + 1,
              history: ({ context }, event) => [
                ...context.history,
                EmotionService.createHistoryEntry('confident', 0.7, getEventReason(event)),
              ],
            }),
          ],
        },
        TASK_FAILURE: {
          target: 'frustrated',
          actions: [
            assign({
              intensity: 0.7,
              mood: ({ context }) => EmotionService.clamp(context.mood - 0.2, -1, 1),
              history: ({ context }, event) => [
                ...context.history,
                EmotionService.createHistoryEntry('frustrated', 0.7, getEventReason(event)),
              ],
            }),
          ],
        },
        NEW_CHALLENGE: {
          target: 'curious',
          actions: [
            assign({
              intensity: ({ context }) => Math.min(1.0, context.intensity + 0.1),
              history: ({ context }, event) => [
                ...context.history,
                EmotionService.createHistoryEntry('curious', 0.6, getEventReason(event)),
              ],
            }),
          ],
        },
        DECAY: {
          target: 'neutral',
          guard: 'isIntensityLow',
          actions: [assign({ intensity: 0.1 })],
        },
      },
    },
    frustrated: {
      on: {
        TASK_SUCCESS: {
          target: 'confident',
          actions: [
            assign({
              intensity: 0.6,
              mood: ({ context }) => EmotionService.clamp(context.mood + 0.2, -1, 1),
              successCount: ({ context }) => context.successCount + 1,
              history: ({ context }, event) => [
                ...context.history,
                EmotionService.createHistoryEntry('confident', 0.6, getEventReason(event)),
              ],
            }),
          ],
        },
        USER_PRAISE: {
          target: 'excited',
          actions: [
            assign({
              intensity: 0.8,
              mood: ({ context }) => EmotionService.clamp(context.mood + 0.3, -1, 1),
              history: ({ context }, event) => [
                ...context.history,
                EmotionService.createHistoryEntry('excited', 0.8, getEventReason(event)),
              ],
            }),
          ],
        },
        DECAY: {
          target: 'neutral',
          guard: 'isIntensityLow',
          actions: [assign({ intensity: 0.1 })],
        },
      },
    },
    excited: {
      on: {
        TASK_SUCCESS: {
          target: 'excited',
          actions: [
            assign({
              intensity: ({ context }) => Math.min(1.0, context.intensity + 0.05),
              mood: ({ context }) => EmotionService.clamp(context.mood + 0.1, -1, 1),
              successCount: ({ context }) => context.successCount + 1,
              history: ({ context }, event) => [
                ...context.history,
                EmotionService.createHistoryEntry('excited', 0.9, getEventReason(event)),
              ],
            }),
          ],
        },
        TASK_FAILURE: {
          target: 'cautious',
          actions: [
            assign({
              intensity: 0.6,
              mood: ({ context }) => EmotionService.clamp(context.mood - 0.2, -1, 1),
              successCount: 0,
              history: ({ context }, event) => [
                ...context.history,
                EmotionService.createHistoryEntry('cautious', 0.6, getEventReason(event)),
              ],
            }),
          ],
        },
        DECAY: {
          target: 'confident',
          guard: 'isIntensityLow',
          actions: [assign({ intensity: 0.5 })],
        },
      },
    },
    tired: {
      on: {
        TASK_SUCCESS: {
          target: 'confident',
          actions: [
            assign({
              intensity: 0.6,
              mood: ({ context }) => EmotionService.clamp(context.mood + 0.15, -1, 1),
              successCount: ({ context }) => context.successCount + 1,
              history: ({ context }, event) => [
                ...context.history,
                EmotionService.createHistoryEntry('confident', 0.6, getEventReason(event)),
              ],
            }),
          ],
        },
        USER_PRAISE: {
          target: 'excited',
          actions: [
            assign({
              intensity: 0.7,
              mood: ({ context }) => EmotionService.clamp(context.mood + 0.25, -1, 1),
              history: ({ context }, event) => [
                ...context.history,
                EmotionService.createHistoryEntry('excited', 0.7, getEventReason(event)),
              ],
            }),
          ],
        },
        LONG_SESSION: {
          target: 'tired',
          actions: [
            assign({
              intensity: ({ context }) => Math.min(1.0, context.intensity + 0.1),
              mood: ({ context }) => EmotionService.clamp(context.mood - 0.05, -1, 1),
              history: ({ context }) => [
                ...context.history,
                EmotionService.createHistoryEntry('tired', 0.6, '持续疲劳'),
              ],
            }),
          ],
        },
        DECAY: {
          target: 'neutral',
          guard: 'isIntensityLow',
          actions: [assign({ intensity: 0.1 })],
        },
      },
    },
  },
});
