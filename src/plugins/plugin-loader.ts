// ============================================================
// Plugin System - Plugin Loader
// ============================================================

import 'reflect-metadata';
import { injectable } from 'tsyringe';
import * as fs from 'fs/promises';
import type { Dirent } from 'fs';
import * as path from 'path';
import * as os from 'os';
import type { PluginManifest, Plugin, PluginContext, PluginState } from './types.js';
import { eventBus } from './event-bus.js';
import { createLogger } from '../services/logger.js';
import { getErrorMessage } from '../utils/error-handling.js';

const pluginLoaderLogger = createLogger('PluginLoader');

/** Options for plugin discovery */
export interface PluginLoaderOptions {
  /** Directories to scan for plugins (default: ['./plugins', '~/.personal-assistant/plugins']) */
  pluginDirs?: string[];
  /** Only load these specific plugins (whitelist) */
  enabledPlugins?: string[];
  /** Never load these plugins (blacklist) */
  disabledPlugins?: string[];
}

/**
 * Discovers, loads, activates, and deactivates plugins.
 *
 * Discovery scans configured directories for `manifest.json` files.
 * Loading dynamically imports the plugin's main module (ESM).
 */
@injectable()
export class PluginLoader {
  private plugins: Map<string, Plugin> = new Map();
  private states: Map<string, PluginState> = new Map();

  /**
   * Scan plugin directories and return discovered manifests.
   */
  async discover(options?: PluginLoaderOptions): Promise<PluginManifest[]> {
    const dirs = options?.pluginDirs ?? this.getDefaultDirs();
    const manifests: PluginManifest[] = [];
    const seen = new Set<string>();

    for (const dir of dirs) {
      const resolved = dir.startsWith('~')
        ? path.join(os.homedir(), dir.slice(1))
        : path.resolve(dir);

      let entries: Dirent[];
      try {
        entries = await fs.readdir(resolved, { withFileTypes: true });
      } catch {
        // Directory does not exist - skip silently
        continue;
      }

      for (const entry of entries) {
        if (!entry.isDirectory()) continue;

        const manifestPath = path.join(resolved, entry.name, 'manifest.json');
        try {
          const raw = await fs.readFile(manifestPath, 'utf-8');
          const manifest: PluginManifest = JSON.parse(raw);

          if (seen.has(manifest.name)) continue;
          seen.add(manifest.name);

          // Apply enable/disable filters
          if (options?.disabledPlugins?.includes(manifest.name)) continue;
          if (options?.enabledPlugins && !options.enabledPlugins.includes(manifest.name)) continue;

          // Default enabled to true
          if (manifest.enabled === false) continue;

          const manifestWithDir = manifest as PluginManifest & { _dir?: string };
          manifestWithDir._dir = path.join(resolved, entry.name);
          manifests.push(manifestWithDir);
        } catch {
          // Not a valid plugin directory - skip
        }
      }
    }

    return manifests;
  }

  /**
   * Dynamically import a plugin's main module and return the Plugin instance.
   */
  async load(manifest: PluginManifest): Promise<Plugin> {
    const existing = this.plugins.get(manifest.name);
    if (existing) return existing;

    // Determine the plugin directory and entry point
    const manifestWithDir = manifest as PluginManifest & { _dir?: string };
    let pluginDir: string | undefined = manifestWithDir._dir;
    const entryFile = manifest.main ?? 'index.js';

    if (!pluginDir) {
      const pluginDirs = this.getDefaultDirs();
      for (const dir of pluginDirs) {
        const resolved = dir.startsWith('~')
          ? path.join(os.homedir(), dir.slice(1))
          : path.resolve(dir);
        const candidate = path.join(resolved, manifest.name);
        try {
          await fs.access(candidate);
          pluginDir = candidate;
          break;
        } catch {
          // Not found in this directory
        }
      }
    }

    if (!pluginDir) {
      throw new Error(`Plugin directory not found for "${manifest.name}"`);
    }

    const modulePath = path.resolve(pluginDir, entryFile);

    try {
      const mod = await import(modulePath);
      const plugin: Plugin = mod.default ?? mod;

      if (!plugin.manifest || !plugin.activate) {
        throw new Error(`Plugin "${manifest.name}" must export { manifest, activate }`);
      }

      this.plugins.set(manifest.name, plugin);
      this.states.set(manifest.name, {
        manifest: plugin.manifest,
        state: 'loaded',
      });

      return plugin;
    } catch (error: unknown) {
      const msg = getErrorMessage(error);
      this.states.set(manifest.name, {
        manifest,
        state: 'error',
        error: msg,
      });
      throw new Error(`Failed to load plugin "${manifest.name}": ${msg}`);
    }
  }

  /**
   * Activate a single plugin by name.
   */
  async activate(pluginName: string, context: PluginContext): Promise<void> {
    const plugin = this.plugins.get(pluginName);
    if (!plugin) {
      throw new Error(`Plugin "${pluginName}" is not loaded`);
    }

    const state = this.states.get(pluginName);
    if (state?.state === 'activated') return;

    try {
      await plugin.activate(context);
      this.states.set(pluginName, {
        manifest: plugin.manifest,
        state: 'activated',
        activatedAt: Date.now(),
      });
    } catch (error: unknown) {
      const msg = getErrorMessage(error);
      this.states.set(pluginName, {
        manifest: plugin.manifest,
        state: 'error',
        error: msg,
      });
      throw new Error(`Failed to activate plugin "${pluginName}": ${msg}`);
    }
  }

  /**
   * Deactivate a single plugin by name.
   */
  async deactivate(pluginName: string): Promise<void> {
    const plugin = this.plugins.get(pluginName);
    if (!plugin) return;

    const state = this.states.get(pluginName);
    if (state?.state !== 'activated') return;

    try {
      if (plugin.deactivate) {
        await plugin.deactivate();
      }
      this.states.set(pluginName, {
        manifest: plugin.manifest,
        state: 'deactivated',
      });
      eventBus.removeAllForPlugin(pluginName);
    } catch (error: unknown) {
      const msg = getErrorMessage(error);
      this.states.set(pluginName, {
        manifest: plugin.manifest,
        state: 'error',
        error: msg,
      });
    }
  }

  /**
   * Discover, load, and activate all plugins using the given context factory.
   */
  async activateAll(contextFactory: (manifest: PluginManifest) => PluginContext): Promise<void> {
    const manifests = await this.discover();

    for (const manifest of manifests) {
      try {
        await this.load(manifest);
        const context = contextFactory(manifest);
        await this.activate(manifest.name, context);
      } catch (error: unknown) {
        const msg = getErrorMessage(error);
        pluginLoaderLogger.error(
          { plugin: manifest.name, error: msg },
          'Failed to load/activate plugin'
        );
      }
    }
  }

  /**
   * Deactivate all active plugins.
   */
  async deactivateAll(): Promise<void> {
    for (const [name] of this.plugins) {
      await this.deactivate(name);
    }
  }

  getPlugin(name: string): Plugin | undefined {
    return this.plugins.get(name);
  }

  getState(name: string): PluginState | undefined {
    return this.states.get(name);
  }

  getAllStates(): PluginState[] {
    return Array.from(this.states.values());
  }

  isLoaded(name: string): boolean {
    return this.plugins.has(name);
  }

  isActive(name: string): boolean {
    return this.states.get(name)?.state === 'activated';
  }

  private getDefaultDirs(): string[] {
    return ['./plugins', '~/.personal-assistant/plugins'];
  }
}
