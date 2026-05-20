// ============================================================
// Community Features - Unified Exports
// ============================================================

// Sharing exports
export {
  generateChecksum,
  bundleToString,
  stringToBundle,
  validateBundle,
  exportPlugin,
  importPlugin,
} from './sharing.js';
export type {
  PluginManifest,
  ShareBundle,
  ExportOptions,
  ImportOptions,
  ImportResult,
} from './sharing.js';

// Reviews exports
export { ReviewManager } from './reviews.js';
export type { Review, ReviewStats } from './reviews.js';

// Templates exports
export { TemplateManager, templateManager, BUILT_IN_TEMPLATES } from './templates.js';
export type {
  PluginTemplate,
  TemplateVariable,
  TemplateInstance,
} from './templates.js';
