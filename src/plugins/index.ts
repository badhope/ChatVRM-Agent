// ============================================================
// Plugin System - Unified Exports & Convenience Functions
// ============================================================

// Re-export all types
export type {
  PluginManifest,
  ToolDefinition,
  ToolParameters,
  ToolParameterProperty,
  ToolExecuteFn,
  ToolExecutionContext,
  ToolResult,
  CommandDefinition,
  CommandOption,
  CommandArgument,
  ConfigManager,
  PluginLogger,
  PluginContext,
  PluginActivateFn,
  PluginDeactivateFn,
  Plugin,
  PluginHook,
  IntentInfo,
  ExecutionStep,
  ExecutionPlan,
  StepResult,
  AgentResult,
  RunContext,
  StepContext,
  ToolExecutionHookContext,
  ErrorContext,
  ConfigChangeContext,
  HookHandler,
  PluginState,
  PluginDefinition,
  PluginHookDefinition,
} from './types.js';

// Re-export event bus
export { eventBus, EventBus } from './event-bus.js';
export type { HookRegistrationOptions } from './event-bus.js';

// Re-export plugin loader
export { PluginLoader } from './plugin-loader.js';
export type { PluginLoaderOptions } from './plugin-loader.js';

// Re-export lifecycle hooks
export {
  emitBeforeRun,
  emitAfterRun,
  emitBeforeStep,
  emitAfterStep,
  emitBeforeToolExecution,
  emitAfterToolExecution,
  emitError,
} from './hooks.js';

// Re-export plugin registry
export { pluginRegistry, PluginRegistry } from './registry.js';
export type { ToolRegistration, CommandRegistration, CommanderProgram } from './registry.js';

// ============================================================
// Convenience: Plugin Context Factory
// ============================================================

import type {
  PluginManifest,
  PluginContext,
  PluginLogger,
  ToolDefinition,
  CommandDefinition,
  ConfigManager,
} from './types.js';
import { pluginRegistry } from './registry.js';

/**
 * Create a PluginContext for the given manifest.
 *
 * This is the standard way to build the context object that gets
 * passed to each plugin's `activate()` function.
 *
 * @param manifest - The plugin's manifest
 * @param toolRegistry - The main tool registry (read-only access for plugins)
 * @param configManager - The global config manager instance
 */
export function createPluginContext(
  manifest: PluginManifest,
  toolRegistry?: Map<string, ToolDefinition>,
  configManager?: ConfigManager,
): PluginContext {
  const logger = createPluginLogger(manifest.name);

  return {
    manifest,
    registerTool(definition: ToolDefinition): void {
      pluginRegistry.registerTool(manifest.name, definition);
    },
    registerCommand(command: CommandDefinition): void {
      pluginRegistry.registerCommand(manifest.name, command);
    },
    getConfig(): Record<string, unknown> {
      return pluginRegistry.getPluginConfig(manifest.name);
    },
    setConfig(config: Record<string, unknown>): void {
      pluginRegistry.setPluginConfig(manifest.name, config);
    },
    configManager: configManager as ConfigManager,
    logger,
    toolRegistry: toolRegistry ?? new Map(),
  };
}

/**
 * Create a scoped logger that prefixes messages with the plugin name.
 */
function createPluginLogger(pluginName: string): PluginLogger {
  const prefix = `[plugin:${pluginName}]`;

  return {
    info(message: string, ...args: unknown[]): void {
      console.log(prefix, message, ...args);
    },
    warn(message: string, ...args: unknown[]): void {
      console.warn(prefix, message, ...args);
    },
    error(message: string, ...args: unknown[]): void {
      console.error(prefix, message, ...args);
    },
    debug(message: string, ...args: unknown[]): void {
      if (process.env.DEVFLOW_DEBUG === 'true' || process.env.DEBUG === 'true') {
        console.debug(prefix, message, ...args);
      }
    },
  };
}
