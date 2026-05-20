// ============================================================
// Plugin System - Event Bus (backed by eventemitter3)
// ============================================================

import EventEmitter3 from 'eventemitter3';
import { createLogger } from '../services/logger.js';
import type { PluginHook, HookHandler } from './types.js';
import { getErrorMessage } from '../utils/error-handling.js';

/** Plugin system logger */
const logger = createLogger('plugins');

/** Options for registering a hook handler */
export interface HookRegistrationOptions {
  pluginName?: string;
  priority?: number;
}

/**
 * Priority-aware event emitter for plugin lifecycle hooks.
 *
 * Uses eventemitter3 internally but adds priority-based ordering
 * so that handlers with a lower priority number execute first.
 * All handlers are awaited sequentially.
 */
export class EventBus {
  private emitter = new EventEmitter3();
  private handlerMap: Map<string, HookHandler[]> = new Map();

  /**
   * Subscribe to a lifecycle hook.
   *
   * @param hook    - The hook name
   * @param handler - Callback invoked when the hook is emitted
   * @param options - Optional priority and plugin name
   * @returns An unsubscribe function
   */
  on(
    hook: PluginHook,
    handler: (...args: unknown[]) => void | Promise<void>,
    options?: HookRegistrationOptions,
  ): () => void {
    const entry: HookHandler = {
      pluginName: options?.pluginName ?? 'anonymous',
      handler,
      priority: options?.priority ?? 100,
    };

    let list = this.handlerMap.get(hook);
    if (!list) {
      list = [];
      this.handlerMap.set(hook, list);
    }
    list.push(entry);
    this.sortHandlers(hook);

    // Also register on the underlying emitter so that removeAllListeners works
    this.emitter.on(hook, handler as (...args: unknown[]) => void);

    // Return unsubscribe function
    return () => {
      const current = this.handlerMap.get(hook);
      if (!current) return;
      const idx = current.indexOf(entry);
      if (idx !== -1) {
        current.splice(idx, 1);
      }
      this.emitter.removeListener(hook, handler as (...args: unknown[]) => void);
    };
  }

  /**
   * Remove a specific handler from a hook.
   */
  off(hook: PluginHook, handler: (...args: unknown[]) => void | Promise<void>): void {
    const list = this.handlerMap.get(hook);
    if (!list) return;
    const idx = list.findIndex((h) => h.handler === handler);
    if (idx !== -1) {
      list.splice(idx, 1);
    }
    this.emitter.removeListener(hook, handler as (...args: unknown[]) => void);
  }

  /**
   * Emit a lifecycle hook, invoking all registered handlers sequentially
   * in priority order. All handlers are awaited.
   */
  async emit(hook: PluginHook, ...args: unknown[]): Promise<void> {
    const list = this.handlerMap.get(hook);
    if (!list || list.length === 0) return;

    for (const entry of list) {
      try {
        await entry.handler(...args);
      } catch (error: unknown) {
        // Prevent one failing handler from blocking others
        logger.error(
          `Handler error on "${hook}" from plugin "${entry.pluginName}": ${getErrorMessage(error)}`,
        );
      }
    }
  }

  /**
   * Remove all handlers registered by a specific plugin.
   */
  removeAllForPlugin(pluginName: string): void {
    for (const [hook, list] of this.handlerMap) {
      const toRemove = list.filter((h) => h.pluginName === pluginName);
      for (const entry of toRemove) {
        this.emitter.removeListener(hook, entry.handler as (...args: unknown[]) => void);
      }
      const filtered = list.filter((h) => h.pluginName !== pluginName);
      if (filtered.length !== list.length) {
        this.handlerMap.set(hook, filtered);
      }
    }
  }

  /**
   * Get all handlers for a given hook (sorted by priority).
   */
  getHandlers(hook: PluginHook): HookHandler[] {
    return this.handlerMap.get(hook) ?? [];
  }

  /**
   * Sort handlers for a hook by priority (ascending).
   */
  private sortHandlers(hook: PluginHook): void {
    const list = this.handlerMap.get(hook);
    if (!list) return;
    list.sort((a, b) => (a.priority ?? 100) - (b.priority ?? 100));
  }
}

/** Singleton event bus instance */
export const eventBus = new EventBus();
