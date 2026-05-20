// ============================================================
// Plugin System - Plugin Registry
// ============================================================

/**
 * Manages plugin-registered tools, commands, and configurations.
 *
 * Plugins register tools and commands during activation. These are
 * stored in pending maps and can be integrated into the main
 * tool registry and Commander program at startup.
 */

import type {
  ToolDefinition,
  CommandDefinition,
} from './types.js';
import { createLogger } from '../services/logger.js';

const logger = createLogger('PluginRegistry');

/** A tool registration entry with its source plugin */
export interface ToolRegistration {
  pluginName: string;
  definition: ToolDefinition;
}

/** A command registration entry with its source plugin */
export interface CommandRegistration {
  pluginName: string;
  command: CommandDefinition;
}

/**
 * Commander program interface for type safety.
 */
export interface CommanderProgram {
  addCommand(command: CommandDefinition): void;
}

export class PluginRegistry {
  /** Pending tool registrations keyed by tool name */
  private pendingTools: Map<string, ToolRegistration> = new Map();

  /** Pending command registrations keyed by command name */
  private pendingCommands: Map<string, CommandRegistration> = new Map();

  /** Plugin-specific configuration keyed by plugin name */
  private pluginConfigs: Map<string, Record<string, unknown>> = new Map();

  /**
   * Register a tool from a plugin.
   */
  registerTool(pluginName: string, definition: ToolDefinition): void {
    const toolName = definition?.name;
    if (!toolName) {
      throw new Error(`Plugin "${pluginName}" tried to register a tool without a name`);
    }
    this.pendingTools.set(toolName, { pluginName, definition });
  }

  /**
   * Register a CLI command from a plugin.
   */
  registerCommand(pluginName: string, command: CommandDefinition): void {
    // Commander Command: name() is a function; plain object: name is a string
    const cmdName = typeof command?.name === 'function' ? command.name() : (command?.name ?? command?._name);
    if (!cmdName) {
      throw new Error(`Plugin "${pluginName}" tried to register a command without a name`);
    }
    this.pendingCommands.set(cmdName, { pluginName, command });
  }

  /**
   * Get the configuration for a specific plugin.
   */
  getPluginConfig(pluginName: string): Record<string, unknown> {
    return this.pluginConfigs.get(pluginName) ?? {};
  }

  /**
   * Set (merge) configuration for a specific plugin.
   */
  setPluginConfig(pluginName: string, config: Record<string, unknown>): void {
    const existing = this.pluginConfigs.get(pluginName) ?? {};
    this.pluginConfigs.set(pluginName, { ...existing, ...config });
  }

  /**
   * Integrate all pending tool registrations into the main tool registry.
   * Call this once at application startup after all plugins are activated.
   */
  integrateTools(toolRegistry: Map<string, ToolDefinition>): void {
    for (const [name, { definition }] of this.pendingTools) {
      if (toolRegistry.has(name)) {
        logger.warn(`Tool "${name}" is already registered; overwriting with plugin version`);
      }
      toolRegistry.set(name, definition);
    }
  }

  /**
   * Integrate all pending command registrations into the Commander program.
   * Call this once at application startup after all plugins are activated.
   */
  integrateCommands(program: CommanderProgram): void {
    for (const [, { command }] of this.pendingCommands) {
      program.addCommand(command);
    }
  }

  /**
   * Get all pending tool registrations.
   */
  getRegisteredTools(): Map<string, ToolRegistration> {
    return new Map(this.pendingTools);
  }

  /**
   * Get all pending command registrations.
   */
  getRegisteredCommands(): Map<string, CommandRegistration> {
    return new Map(this.pendingCommands);
  }

  /**
   * Remove all registrations for a specific plugin.
   * Useful during plugin deactivation.
   */
  removeAllForPlugin(pluginName: string): void {
    for (const [name, entry] of this.pendingTools) {
      if (entry.pluginName === pluginName) {
        this.pendingTools.delete(name);
      }
    }
    for (const [name, entry] of this.pendingCommands) {
      if (entry.pluginName === pluginName) {
        this.pendingCommands.delete(name);
      }
    }
  }
}

/** Singleton plugin registry instance */
export const pluginRegistry = new PluginRegistry();
