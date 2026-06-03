import { createMachine, assign } from 'xstate';
import type { TaskStep, StepResult } from '../core/types.js';

const MAX_RETRIES = 3;

export interface AgentMachineContext {
  taskId: string;
  input: string;
  intent: string | null;
  plan: TaskStep[];
  currentStepIndex: number;
  results: StepResult[];
  errors: Array<{ phase: string; message: string; timestamp: number }>;
  retryCount: number;
  startTime: number;
  modifiedFiles: string[];
}

export type AgentMachineEvent =
  | { type: 'INIT_COMPLETE' }
  | { type: 'UNDERSTAND_OK' }
  | { type: 'PLAN_OK' }
  | { type: 'PLAN_FAILED' }
  | { type: 'STEP_OK' }
  | { type: 'STEP_FAILED' }
  | { type: 'ALL_STEPS_OK' }
  | { type: 'VALIDATE_OK' }
  | { type: 'VALIDATE_FAILED' }
  | { type: 'REFLECT_OK' }
  | { type: 'REFLECT_FAILED' }
  | { type: 'RETRY' }
  | { type: 'ABORT' }
  | { type: 'TIMEOUT' };

const moreSteps = ({ context }: { context: AgentMachineContext }) =>
  context.currentStepIndex < context.plan.length - 1;

type AgentMachineConfig = Parameters<typeof createMachine>[0];

function buildAgentMachineConfig(taskId: string, input: string): AgentMachineConfig {
  const config = {
    types: {} as { context: AgentMachineContext; events: AgentMachineEvent },
    id: 'agent',
    initial: 'initializing',
    context: {
      taskId,
      input,
      intent: null,
      plan: [],
      currentStepIndex: 0,
      results: [],
      errors: [],
      retryCount: 0,
      startTime: Date.now(),
      modifiedFiles: [],
    },
    states: {
      initializing: {
        on: {
          INIT_COMPLETE: 'understanding',
          TIMEOUT: 'failed',
        },
      },
      understanding: {
        on: {
          UNDERSTAND_OK: 'planning',
          '*': 'error_recovery',
        },
      },
      planning: {
        on: {
          PLAN_OK: 'executing',
          PLAN_FAILED: 'failed',
          '*': 'error_recovery',
        },
      },
      executing: {
        on: {
          STEP_OK: [
            {
              target: 'executing',
              guard: 'moreSteps',
              actions: assign({
                currentStepIndex: ({ context }: { context: AgentMachineContext }) =>
                  context.currentStepIndex + 1,
              }),
            },
            { target: 'validating' },
          ],
          ALL_STEPS_OK: 'validating',
          STEP_FAILED: 'error_recovery',
        },
      },
      error_recovery: {
        always: [
          {
            target: 'failed',
            guard: ({ context }: { context: AgentMachineContext }) =>
              context.retryCount >= MAX_RETRIES,
          },
        ],
        on: {
          RETRY: {
            target: 'executing',
            actions: assign({
              retryCount: ({ context }: { context: AgentMachineContext }) =>
                context.retryCount + 1,
            }),
          },
          ABORT: 'failed',
        },
      },
      validating: {
        on: {
          VALIDATE_OK: 'reflecting',
          VALIDATE_FAILED: 'error_recovery',
        },
      },
      reflecting: {
        on: {
          REFLECT_OK: 'completed',
          REFLECT_FAILED: 'failed',
        },
      },
      completed: {
        type: 'final',
      },
      failed: {
        type: 'final',
      },
    },
  };
  return config as unknown as AgentMachineConfig;
}

export const agentMachine = createMachine(
  buildAgentMachineConfig('', '') as unknown as Parameters<typeof createMachine>[0],
  {
    guards: { moreSteps: moreSteps as never },
  },
);

export function createAgentMachine(taskId: string, input: string) {
  return createMachine(
    buildAgentMachineConfig(taskId, input) as unknown as Parameters<typeof createMachine>[0],
    {
      guards: { moreSteps: moreSteps as never },
    },
  );
}
