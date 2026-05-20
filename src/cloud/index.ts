/**
 * Cloud Sync Module
 * Unified exports for configuration sync, history backup, and multi-device support
 */

// Type exports
export type {
  SyncConfig,
  SyncData,
  SyncResult,
  DeviceInfo,
  ConflictData,
  ConflictStrategy,
} from './types.js';
export { SYNC_SCHEMA_VERSION, DEFAULT_SYNC_CONFIG } from './types.js';

// Provider exports
export {
  LocalSyncProvider,
  GistSyncProvider,
  CustomSyncProvider,
  createSyncProvider,
} from './provider.js';
export type { SyncProvider } from './provider.js';

// Manager exports
export { SyncManager, syncManager } from './sync-manager.js';
export { BackupManager, backupManager } from './backup.js';
export type { BackupEntry } from './backup.js';

// ============================================================
// Convenience Functions
// ============================================================

import type { SyncConfig, SyncResult, SyncData } from './types.js';
import { DEFAULT_SYNC_CONFIG } from './types.js';
import { syncManager } from './sync-manager.js';
import { backupManager } from './backup.js';
import type { BackupEntry } from './backup.js';

/**
 * Enable sync with the given configuration
 */
export async function enableSync(config: SyncConfig): Promise<void> {
  syncManager.updateConfig({ ...DEFAULT_SYNC_CONFIG, ...config, enabled: true });
  syncManager.startAutoSync(config.syncInterval);
}

/**
 * Disable sync
 */
export function disableSync(): void {
  syncManager.stopAutoSync();
  syncManager.updateConfig({ enabled: false });
}

/**
 * Perform an immediate sync
 */
export async function syncNow(): Promise<SyncResult> {
  return syncManager.sync();
}

/**
 * Create a manual backup
 */
export async function createBackup(description?: string): Promise<BackupEntry> {
  return backupManager.createBackup(description);
}

/**
 * Restore from a backup
 */
export async function restoreBackup(backupId: string): Promise<boolean> {
  return backupManager.restoreBackup(backupId);
}

/**
 * List all backups
 */
export async function listBackups(): Promise<BackupEntry[]> {
  return backupManager.listBackups();
}

/**
 * Get sync status
 */
export function getSyncStatus(): {
  enabled: boolean;
  syncing: boolean;
  lastSyncAt: Date | null;
} {
  return {
    enabled: syncManager.isEnabled(),
    syncing: syncManager.isSyncing(),
    lastSyncAt: syncManager.getLastSyncTime(),
  };
}

/**
 * Initialize cloud sync module
 */
export async function initCloudSync(config?: Partial<SyncConfig>): Promise<void> {
  if (config?.enabled) {
    await enableSync({ ...DEFAULT_SYNC_CONFIG, ...config } as SyncConfig);
  }
}
