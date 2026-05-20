// ============================================================
// Plugin Marketplace - Plugin Installer
// ============================================================

import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { registryStore } from './registry.js';
import type { RegistryEntry } from './registry.js';
import { getErrorMessage } from '../../utils/error-handling.js';

export interface InstallOptions {
  version?: string;
  global?: boolean;
  force?: boolean;
}

export interface InstallResult {
  name: string;
  version: string;
  installedPath: string;
  success: boolean;
  error?: string;
}

export interface UninstallResult {
  name: string;
  success: boolean;
  error?: string;
}

export interface UpdateResult {
  name: string;
  oldVersion: string;
  newVersion: string;
  updated: boolean;
  error?: string;
}

function resolveHome(p: string): string {
  return p.startsWith('~') ? path.join(os.homedir(), p.slice(1)) : p;
}

function defaultConfigDir(): string {
  return path.join(os.homedir(), '.devflow');
}

export class PluginInstaller {
  getInstallDir(global?: boolean): string {
    return global
      ? path.join(defaultConfigDir(), 'plugins')
      : path.resolve('./plugins');
  }

  async install(name: string, options?: InstallOptions): Promise<InstallResult> {
    const entry = registryStore.get(name);
    if (!entry) {
      return { name, version: '', installedPath: '', success: false, error: `Plugin "${name}" not found in registry` };
    }
    const version = options?.version ?? entry.version;
    const versionInfo = entry.versions.find((v) => v.version === version);
    if (!versionInfo) {
      return { name, version, installedPath: '', success: false, error: `Version "${version}" not found for "${name}"` };
    }
    const installDir = this.getInstallDir(options?.global);
    const targetPath = path.join(installDir, name);
    try {
      if (!options?.force) {
        try {
          await fs.access(targetPath);
          return { name, version, installedPath: targetPath, success: false, error: `Plugin "${name}" is already installed. Use --force to overwrite.` };
        } catch (error) {
          // Proceed with installation
        }
      }
      await fs.mkdir(installDir, { recursive: true });
      const sourcePath = this.resolveSourcePath(entry);
      await fs.cp(sourcePath, targetPath, { recursive: true, force: true });
      registryStore.incrementDownloads(name);
      await registryStore.save();
      return { name, version, installedPath: targetPath, success: true };
    } catch (error: unknown) {
      const msg = getErrorMessage(error);
      return { name, version, installedPath: targetPath, success: false, error: msg };
    }
  }

  async uninstall(name: string, global?: boolean): Promise<UninstallResult> {
    const targetPath = path.join(this.getInstallDir(global), name);
    try {
      await fs.access(targetPath);
      await fs.rm(targetPath, { recursive: true, force: true });
      return { name, success: true };
    } catch {
      return { name, success: false, error: `Plugin "${name}" is not installed` };
    }
  }

  async update(name: string, global?: boolean): Promise<UpdateResult> {
    const entry = registryStore.get(name);
    if (!entry) {
      return { name, oldVersion: '', newVersion: '', updated: false, error: `Plugin "${name}" not found in registry` };
    }
    const currentVersion = await this.getInstalledVersion(name, global);
    if (!currentVersion) {
      return { name, oldVersion: '', newVersion: '', updated: false, error: `Plugin "${name}" is not installed` };
    }
    if (currentVersion === entry.version) {
      return { name, oldVersion: currentVersion, newVersion: currentVersion, updated: false };
    }
    const result = await this.install(name, { version: entry.version, global, force: true });
    if (!result.success) {
      return { name, oldVersion: currentVersion, newVersion: entry.version, updated: false, error: result.error };
    }
    return { name, oldVersion: currentVersion, newVersion: entry.version, updated: true };
  }

  async updateAll(global?: boolean): Promise<UpdateResult[]> {
    const installed = await this.listInstalled(global);
    return Promise.all(installed.map(({ name }) => this.update(name, global)));
  }

  async isInstalled(name: string, global?: boolean): Promise<boolean> {
    return (await this.getInstalledVersion(name, global)) !== null;
  }

  async getInstalledVersion(name: string, global?: boolean): Promise<string | null> {
    const manifestPath = path.join(this.getInstallDir(global), name, 'manifest.json');
    try {
      const raw = await fs.readFile(manifestPath, 'utf-8');
      return JSON.parse(raw).version ?? null;
    } catch {
      return null;
    }
  }

  async listInstalled(global?: boolean): Promise<{ name: string; version: string; path: string }[]> {
    const installDir = this.getInstallDir(global);
    const results: { name: string; version: string; path: string }[] = [];
    try {
      const entries = await fs.readdir(installDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        try {
          const raw = await fs.readFile(path.join(installDir, entry.name, 'manifest.json'), 'utf-8');
          const manifest = JSON.parse(raw);
          results.push({ name: manifest.name ?? entry.name, version: manifest.version ?? 'unknown', path: path.join(installDir, entry.name) });
        } catch (error) {
          // Skip invalid plugin directories
        }
      }
    } catch (error) {
      // Directory does not exist
    }
    return results;
  }

  private resolveSourcePath(entry: RegistryEntry): string {
    const sources = registryStore.getSources();
    const localSource = sources.find((s) => s.name === 'local');
    if (localSource?.localPath) {
      return path.join(path.dirname(resolveHome(localSource.localPath)), 'plugin-sources', entry.name);
    }
    return path.join(defaultConfigDir(), 'plugin-sources', entry.name);
  }
}

export const pluginInstaller = new PluginInstaller();
