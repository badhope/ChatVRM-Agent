// ============================================================
// Plugin Marketplace - Unified Exports
// ============================================================

// Registry exports
export { registryStore } from './registry.js';
export type { RegistryEntry, RegistrySource } from './registry.js';

// Installer exports
export { PluginInstaller, pluginInstaller } from './installer.js';
export type {
  InstallOptions,
  InstallResult,
  UninstallResult,
  UpdateResult,
} from './installer.js';

// Publisher exports (if any)
export {} from './publisher.js';
