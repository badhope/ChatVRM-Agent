/**
 * Sync Manager
 * Main synchronization manager for configuration, memory, and plugins
 */

import os from 'os';
import process from 'process';
import type { SyncConfig, SyncData, SyncResult, DeviceInfo, ConflictStrategy } from './types.js';
import { SYNC_SCHEMA_VERSION, DEFAULT_SYNC_CONFIG } from './types.js';
import { createSyncProvider, type SyncProvider } from './provider.js';
import { configManager } from '../config/manager.js';
import { memoryManager } from '../memory/manager.js';
import { AsyncLock } from '../utils/async-lock.js';
import { createLogger } from '../services/logger.js';

const logger = createLogger('SyncManager');

function stripSecrets(config: Record<string, unknown>): Record<string, unknown> {
  const sanitized = { ...config } as Record<string, unknown>;
  if (sanitized.providers && typeof sanitized.providers === 'object') {
    const providers = sanitized.providers as Record<string, unknown>;
    for (const [key, provider] of Object.entries(providers)) {
      if (provider && typeof provider === 'object' && 'apiKey' in provider) {
        providers[key] = { ...provider as object, apiKey: '***REDACTED***' };
      }
    }
  }
  return sanitized;
}

export class SyncManager {
  private provider: SyncProvider;
  private config: SyncConfig;
  private deviceId: string;
  private syncInterval?: ReturnType<typeof setInterval>;
  private syncing = false;
  private syncingLock = new AsyncLock();
  private cleanupRegistered = false;

  constructor(config: SyncConfig) {
    this.config = { ...DEFAULT_SYNC_CONFIG, ...config };
    this.provider = createSyncProvider(this.config);
    this.deviceId = this.getOrCreateDeviceId();
  }

  private ensureCleanup(): void {
    if (this.cleanupRegistered) return;
    this.cleanupRegistered = true;

    const cleanup = () => {
      this.stopAutoSync();
    };

    process.on('exit', cleanup);
    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
  }

  async sync(): Promise<SyncResult> {
    return this.syncingLock.acquire(async () => {
      if (this.syncing) {
        return this.errorResult('Sync already in progress');
      }
      this.syncing = true;
      const timestamp = new Date().toISOString();
      try {
        const localData = await this.gatherLocalData();
        const remoteData = await this.provider.download();
        if (!remoteData) {
          await this.provider.upload(localData);
          return this.successResult('upload', timestamp);
        }
        const conflict = this.detectConflict(localData, remoteData);
        if (conflict) {
          return { success: false, action: 'conflict', timestamp, error: 'Sync conflict detected', changes: conflict };
        }
        const localTime = new Date(localData.timestamp).getTime();
        const remoteTime = new Date(remoteData.timestamp).getTime();
        if (localTime > remoteTime) {
          await this.provider.upload(localData);
          return this.successResult('upload', timestamp);
        } else {
          await this.applyRemoteData(remoteData);
          return this.successResult('download', timestamp);
        }
      } catch (error) {
        logger.debug({ error }, 'Sync operation failed');
        return this.errorResult(error instanceof Error ? error.message : 'Unknown error');
      }
      finally { this.syncing = false; }
    });
  }

  async upload(): Promise<SyncResult> {
    if (this.syncing) return this.errorResult('Sync already in progress');
    this.syncing = true;
    try {
      await this.provider.upload(await this.gatherLocalData());
      return this.successResult('upload', new Date().toISOString());
    } catch (error) {
      logger.debug({ error }, 'Upload operation failed');
      return this.errorResult(error instanceof Error ? error.message : 'Unknown error');
    }
    finally { this.syncing = false; }
  }

  async download(): Promise<SyncResult> {
    if (this.syncing) return this.errorResult('Sync already in progress');
    this.syncing = true;
    try {
      const data = await this.provider.download();
      if (!data) return this.errorResult('No remote data available');
      await this.applyRemoteData(data);
      return this.successResult('download', new Date().toISOString());
    } catch (error) {
      logger.debug({ error }, 'Download operation failed');
      return this.errorResult(error instanceof Error ? error.message : 'Unknown error');
    }
    finally { this.syncing = false; }
  }

  startAutoSync(intervalMinutes?: number): void {
    this.ensureCleanup();
    const interval = (intervalMinutes || this.config.syncInterval || 5) * 60 * 1000;
    this.stopAutoSync();
    this.syncInterval = setInterval(() => this.sync().catch((error) => {
      logger.debug({ error }, 'Auto sync failed');
    }), interval);
  }

  stopAutoSync(): void { if (this.syncInterval) { clearInterval(this.syncInterval); this.syncInterval = undefined; } }

  async resolveConflict(strategy: ConflictStrategy): Promise<SyncResult> {
    try {
      const localData = await this.gatherLocalData();
      const remoteData = await this.provider.download();
      if (!remoteData) return this.errorResult('No remote data');
      const resolved = strategy === 'local' ? localData : strategy === 'remote' ? remoteData : this.mergeData(localData, remoteData);
      await this.provider.upload(resolved);
      if (strategy !== 'local') await this.applyRemoteData(resolved);
      return this.successResult('upload', new Date().toISOString());
    } catch (error) {
      logger.debug({ error }, 'Conflict resolution failed');
      return this.errorResult(error instanceof Error ? error.message : 'Unknown error');
    }
  }

  getDeviceInfo(): DeviceInfo { return { id: this.deviceId, name: os.hostname(), lastSeenAt: new Date().toISOString(), platform: process.platform, version: SYNC_SCHEMA_VERSION }; }
  async listOtherDevices(): Promise<DeviceInfo[]> { return (await this.provider.listDevices()).filter(d => d.id !== this.deviceId); }
  async removeDevice(deviceId: string): Promise<void> { await this.provider.removeDevice(deviceId); }
  getLastSyncTime(): Date | null { return this.config.lastSyncAt ? new Date(this.config.lastSyncAt) : null; }
  isSyncing(): boolean { return this.syncing; }
  isEnabled(): boolean { return this.config.enabled; }

  updateConfig(config: Partial<SyncConfig>): void {
    this.config = { ...this.config, ...config };
    if (config.provider || config.gistId || config.gistToken || config.customEndpoint || config.customToken) {
      this.provider = createSyncProvider(this.config);
    }
  }

  private async gatherLocalData(): Promise<SyncData> {
    await configManager.init();
    const config = configManager.getAllConfig();
    let memory: SyncData['memory'];
    try {
      await memoryManager.init();
      memory = { conversations: await memoryManager.loadAllRecords(), knowledge: [] };
    } catch (error) {
      logger.debug({ error }, 'Failed to load memory data for sync');
      memory = undefined;
    }
    return { version: SYNC_SCHEMA_VERSION, deviceId: this.deviceId, timestamp: new Date().toISOString(), config: stripSecrets(JSON.parse(JSON.stringify(config))), memory };
  }

  private async applyRemoteData(data: SyncData): Promise<void> {
    if (data.config) {
      await configManager.init();
      const dp = data.config.defaultProvider;
      if (dp && typeof dp === 'string') await configManager.setDefaultProvider(dp as import('../types.js').ProviderType);
    }
    if (data.memory) console.log('[Sync] Remote memory data available');
  }

  private detectConflict(local: SyncData, remote: SyncData): SyncResult['changes'] | null {
    const localTime = new Date(local.timestamp).getTime();
    const remoteTime = new Date(remote.timestamp).getTime();

    // If content is identical, no conflict regardless of timing
    if (JSON.stringify(local) === JSON.stringify(remote)) {
      return null;
    }

    // If timestamps are very close (< 1 second), likely a conflict
    if (Math.abs(localTime - remoteTime) < 1000) {
      const configDiff = JSON.stringify(local.config) !== JSON.stringify(remote.config);
      const memoryDiff = JSON.stringify(local.memory) !== JSON.stringify(remote.memory);
      return { config: configDiff, memory: memoryDiff, plugins: false };
    }

    // Different content modified at different times = conflict
    const configDiff = JSON.stringify(local.config) !== JSON.stringify(remote.config);
    const memoryDiff = JSON.stringify(local.memory) !== JSON.stringify(remote.memory);
    return { config: configDiff, memory: memoryDiff, plugins: false };
  }

  private mergeData(local: SyncData, remote: SyncData): SyncData {
    const localTime = new Date(local.timestamp).getTime();
    const remoteTime = new Date(remote.timestamp).getTime();
    return { version: SYNC_SCHEMA_VERSION, deviceId: this.deviceId, timestamp: new Date().toISOString(),
      config: localTime > remoteTime ? local.config : remote.config,
      memory: localTime > remoteTime ? local.memory : remote.memory,
      plugins: localTime > remoteTime ? local.plugins : remote.plugins };
  }

  private getOrCreateDeviceId(): string { return `device-${this.simpleHash(`${os.hostname()}-${process.platform}-${os.userInfo().username}`)}`; }
  private simpleHash(str: string): string { let h = 0; for (let i = 0; i < str.length; i++) { h = ((h << 5) - h) + str.charCodeAt(i); h = h & h; } return Math.abs(h).toString(16).padStart(8, '0'); }
  private successResult(action: 'upload' | 'download', timestamp: string): SyncResult { return { success: true, action, timestamp, changes: { config: true, memory: true, plugins: false } }; }
  private errorResult(error: string): SyncResult { return { success: false, action: 'upload', timestamp: new Date().toISOString(), error }; }
}

export const syncManager = new SyncManager(DEFAULT_SYNC_CONFIG);
