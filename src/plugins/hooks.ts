// ============================================================
// Plugin System - Lifecycle Hooks
// ============================================================

/**
 * Typed context objects for each lifecycle hook.
 * These provide structured data to hook handlers.
 */

import type {
  RunContext,
  StepContext,
  ToolExecutionHookContext,
  ErrorContext,
} from './types.js';

// Re-export hook context types for backward compatibility
export type {
  RunContext,
  StepContext,
  ToolExecutionHookContext,
  ErrorContext,
};

// ============================================================
// Hook emitter helpers
// ============================================================

import { eventBus } from './event-bus.js';

/**
 * Emit the `beforeRun` hook.
 * Call at the start of AgentExecutor.run().
 */
export async function emitBeforeRun(ctx: RunContext): Promise<void> {
  await eventBus.emit('beforeRun', ctx);
}

/**
 * Emit the `afterRun` hook.
 * Call at the end of AgentExecutor.run() (success or failure).
 */
export async function emitAfterRun(ctx: RunContext): Promise<void> {
  await eventBus.emit('afterRun', ctx);
}

/**
 * Emit the `beforeStep` hook.
 * Call before each step in the execute loop.
 */
export async function emitBeforeStep(ctx: StepContext): Promise<void> {
  await eventBus.emit('beforeStep', ctx);
}

/**
 * Emit the `afterStep` hook.
 * Call after each step completes (success or failure).
 */
export async function emitAfterStep(ctx: StepContext): Promise<void> {
  await eventBus.emit('afterStep', ctx);
}

/**
 * Emit the `beforeToolExecution` hook.
 * Call before executing any tool.
 */
export async function emitBeforeToolExecution(
  ctx: ToolExecutionHookContext,
): Promise<void> {
  await eventBus.emit('beforeToolExecution', ctx);
}

/**
 * Emit the `afterToolExecution` hook.
 * Call after a tool execution completes.
 */
export async function emitAfterToolExecution(
  ctx: ToolExecutionHookContext,
): Promise<void> {
  await eventBus.emit('afterToolExecution', ctx);
}

/**
 * Emit the `onError` hook.
 * Call when an error occurs during agent execution.
 */
export async function emitError(ctx: ErrorContext): Promise<void> {
  await eventBus.emit('onError', ctx);
}
