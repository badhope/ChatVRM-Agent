import { describe, it, expect } from 'vitest';
import { createActor } from 'xstate';
import { createAgentMachine } from '../../../machines/agent.machine.js';

describe('createAgentMachine', () => {
  it('starts in the initializing state', () => {
    const machine = createAgentMachine('task-1', 'Build a CLI tool');
    const actor = createActor(machine).start();
    expect(actor.getSnapshot().value).toBe('initializing');
  });

  it('initializes context with the provided taskId and input', () => {
    const machine = createAgentMachine('task-42', 'Summarize the README');
    const actor = createActor(machine).start();
    const ctx = actor.getSnapshot().context;
    expect(ctx.taskId).toBe('task-42');
    expect(ctx.input).toBe('Summarize the README');
    expect(ctx.currentStepIndex).toBe(0);
    expect(ctx.retryCount).toBe(0);
  });

  it('advances to understanding after INIT_COMPLETE', () => {
    const machine = createAgentMachine('task-1', 'write code');
    const actor = createActor(machine).start();
    actor.send({ type: 'INIT_COMPLETE' });
    expect(actor.getSnapshot().value).toBe('understanding');
  });

  it('advances to planning after UNDERSTAND_OK', () => {
    const machine = createAgentMachine('task-1', 'write code');
    const actor = createActor(machine).start();
    actor.send({ type: 'INIT_COMPLETE' });
    actor.send({ type: 'UNDERSTAND_OK' });
    expect(actor.getSnapshot().value).toBe('planning');
  });

  it('advances to executing after PLAN_OK', () => {
    const machine = createAgentMachine('task-1', 'write code');
    const actor = createActor(machine).start();
    actor.send({ type: 'INIT_COMPLETE' });
    actor.send({ type: 'UNDERSTAND_OK' });
    actor.send({ type: 'PLAN_OK' });
    expect(actor.getSnapshot().value).toBe('executing');
  });

  it('falls through to validating on the last STEP_OK when no more steps remain', () => {
    const machine = createAgentMachine('task-1', 'single-step');
    const actor = createActor(machine).start();
    actor.send({ type: 'INIT_COMPLETE' });
    actor.send({ type: 'UNDERSTAND_OK' });
    actor.send({ type: 'PLAN_OK' });

    // With an empty plan, the moreSteps guard is false on the first STEP_OK,
    // so the fallback transition (added in this fix) should take us to validating.
    actor.send({ type: 'STEP_OK' });
    expect(actor.getSnapshot().value).toBe('validating');
  });

  it('reaches failed terminal state when RETRY is exhausted', () => {
    const machine = createAgentMachine('task-1', 'multi-step');
    const actor = createActor(machine).start();
    actor.send({ type: 'INIT_COMPLETE' });
    actor.send({ type: 'UNDERSTAND_OK' });
    actor.send({ type: 'PLAN_OK' });
    actor.send({ type: 'STEP_FAILED' });
    expect(actor.getSnapshot().value).toBe('error_recovery');

    actor.send({ type: 'RETRY' });
    actor.send({ type: 'STEP_FAILED' });
    actor.send({ type: 'RETRY' });
    actor.send({ type: 'STEP_FAILED' });
    actor.send({ type: 'RETRY' });
    actor.send({ type: 'STEP_FAILED' });

    expect(actor.getSnapshot().value).toBe('failed');
    expect(actor.getSnapshot().status).toBe('done');
  });

  it('reaches completed terminal state on happy path', () => {
    const machine = createAgentMachine('task-1', 'happy path');
    const actor = createActor(machine).start();
    actor.send({ type: 'INIT_COMPLETE' });
    actor.send({ type: 'UNDERSTAND_OK' });
    actor.send({ type: 'PLAN_OK' });
    actor.send({ type: 'ALL_STEPS_OK' });
    actor.send({ type: 'VALIDATE_OK' });
    actor.send({ type: 'REFLECT_OK' });

    expect(actor.getSnapshot().value).toBe('completed');
    expect(actor.getSnapshot().status).toBe('done');
  });

  it('transitions to failed when REFLECT_FAILED is sent in reflecting state', () => {
    const machine = createAgentMachine('task-1', 'reflect fail');
    const actor = createActor(machine).start();
    actor.send({ type: 'INIT_COMPLETE' });
    actor.send({ type: 'UNDERSTAND_OK' });
    actor.send({ type: 'PLAN_OK' });
    actor.send({ type: 'ALL_STEPS_OK' });
    actor.send({ type: 'VALIDATE_OK' });
    expect(actor.getSnapshot().value).toBe('reflecting');

    actor.send({ type: 'REFLECT_FAILED' });
    expect(actor.getSnapshot().value).toBe('failed');
  });
});
