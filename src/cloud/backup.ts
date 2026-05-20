/**
 * Backup Manager
 * History backup management for configuration and memory
 */

import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import type { SyncData } from './types.js';
import { SYNC_SCHEMA_VERSION } from './types.js';
import { configManager } from '../config/manager.js';
import { memoryManager } from '../memory/manager.js';
import { MEMORY_DIR } from '../utils/index.js';
import { createLogger } from '../services/logger.js';

const backupLogger = createLogger('Backup');

function stripSecrets(config: Record<string, any>): Record<string, any> {
  const sanitized = { ...config };
  if (sanitized.providers) {
    for (const [key, provider] of Object.entries(sanitized.providers)) {
      if (provider && typeof provider === 'object' && 'apiKey' in provider) {
        sanitized.providers[key] = { ...provider, apiKey: '***REDACTED***' };
      }
    }
  }
  return sanitized;
}

export interface BackupEntry {
  id: string;
  timestamp: string;
  type: 'auto' | 'manual';
  size: number;
  description?: string;
}

export class BackupManager {
  private backupDir: string;
  private maxBackups: number;
  private indexFile: string;

  constructor(configDir?: string, maxBackups: number = 10) {
    this.backupDir = configDir || path.join(os.homedir(), '.devflow', 'backups');
    this.maxBackups = maxBackups;
    this.indexFile = path.join(this.backupDir, 'index.json');
  }

  async createBackup(description?: string): Promise<BackupEntry> {
    await this.ensureDir();
    const id = `backup-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
    const timestamp = new Date().toISOString();
    const data = await this.gatherBackupData();
    const content = JSON.stringify(data, null, 2);
    const size = Buffer.byteLength(content, 'utf-8');
    const backupFile = path.join(this.backupDir, `${id}.json`);
    await fs.writeFile(backupFile, content);
    const entry: BackupEntry = { id, timestamp, type: 'manual', size, description };
    await this.updateIndex(entry);
    return entry;
  }

  async restoreBackup(backupId: string): Promise<boolean> {
    try {
      const data = await this.getBackupData(backupId);

      // 恢复配置
      if (data.config) {
        await configManager.init();
        const config = data.config as Record<string, any>;

        // 恢复默认提供商
        if (config.defaultProvider && typeof config.defaultProvider === 'string') {
          await configManager.setDefaultProvider(config.defaultProvider as import('../types.js').ProviderType);
        }

        // 恢复各提供商配置（仅非敏感字段）
        if (config.providers) {
          for (const [name, providerConfig] of Object.entries(config.providers)) {
            if (providerConfig && typeof providerConfig === 'object') {
              const cfg = providerConfig as Record<string, any>;
              // 跳过已脱敏的 apiKey
              if (cfg.apiKey === '***REDACTED***') {
                backupLogger.info({ provider: name }, 'Skipping API Key restore (redacted, manual config required)');
                delete cfg.apiKey;
              }
              // 恢复 baseUrl, defaultModel 等配置
              if (cfg.baseUrl || cfg.defaultModel || cfg.maxRetries) {
                const existing = configManager.getProviderConfig(name as import('../types.js').ProviderType);
                if (existing) {
                  if (cfg.baseUrl) existing.baseUrl = cfg.baseUrl;
                  if (cfg.defaultModel) existing.defaultModel = cfg.defaultModel;
                  if (cfg.maxRetries) existing.maxRetries = cfg.maxRetries;
                }
              }
            }
          }
        }

        backupLogger.info('Configuration restored');
      }

      // 恢复记忆数据
      if (data.memory?.conversations && Array.isArray(data.memory.conversations)) {
        await memoryManager.init();
        let restoredCount = 0;
        for (const record of data.memory.conversations as Array<Record<string, any>>) {
          try {
            if (record.id && record.timestamp) {
              const filePath = path.join(MEMORY_DIR, `${record.id}.json`);
              await fs.writeFile(filePath, JSON.stringify(record, null, 2));
              restoredCount++;
            }
          } catch (error) {
            // Skip individual record errors
          }
        }
        backupLogger.info({ count: restoredCount }, 'Memory records restored');
      }

      return true;
    } catch (error) {
      backupLogger.error({ error }, 'Restore failed');
      return false;
    }
  }

  async listBackups(): Promise<BackupEntry[]> {
    await this.ensureDir();
    const index = await this.loadIndex();
    return index.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }

  async deleteBackup(backupId: string): Promise<boolean> {
    try {
      const backupFile = path.join(this.backupDir, `${backupId}.json`);
      await fs.unlink(backupFile);
      const index = await this.loadIndex();
      const filtered = index.filter(e => e.id !== backupId);
      await fs.writeFile(this.indexFile, JSON.stringify(filtered, null, 2));
      return true;
    } catch (error) {
      return false;
    }
  }

  async getBackupData(backupId: string): Promise<SyncData> {
    const backupFile = path.join(this.backupDir, `${backupId}.json`);
    const content = await fs.readFile(backupFile, 'utf-8');
    return JSON.parse(content) as SyncData;
  }

  async autoBackup(): Promise<BackupEntry | null> {
    try {
      await this.ensureDir();
      const id = `auto-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
      const timestamp = new Date().toISOString();
      const data = await this.gatherBackupData();
      const content = JSON.stringify(data, null, 2);
      const size = Buffer.byteLength(content, 'utf-8');
      const backupFile = path.join(this.backupDir, `${id}.json`);
      await fs.writeFile(backupFile, content);
      const entry: BackupEntry = {
        id, timestamp, type: 'auto', size, description: 'Automatic backup before sync',
      };
      await this.updateIndex(entry);
      await this.cleanup();
      return entry;
    } catch (error) {
      backupLogger.error({ error }, 'Auto backup failed');
      return null;
    }
  }

  async cleanup(): Promise<number> {
    const index = await this.loadIndex();
    const autoBackups = index.filter(e => e.type === 'auto')
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    const autoToDelete = autoBackups.slice(this.maxBackups);
    let deletedCount = 0;
    for (const entry of autoToDelete) {
      if (await this.deleteBackup(entry.id)) deletedCount++;
    }
    return deletedCount;
  }

  private async ensureDir(): Promise<void> {
    await fs.mkdir(this.backupDir, { recursive: true });
  }

  private async loadIndex(): Promise<BackupEntry[]> {
    try {
      const content = await fs.readFile(this.indexFile, 'utf-8');
      return JSON.parse(content) as BackupEntry[];
    } catch (error) {
      return [];
    }
  }

  private async updateIndex(entry: BackupEntry): Promise<void> {
    const index = await this.loadIndex();
    index.push(entry);
    await fs.writeFile(this.indexFile, JSON.stringify(index, null, 2));
  }

  private async gatherBackupData(): Promise<SyncData> {
    await configManager.init();
    const config = configManager.getAllConfig();
    let memory: SyncData['memory'];
    try {
      await memoryManager.init();
      const records = await memoryManager.loadAllRecords();
      memory = { conversations: records, knowledge: [] };
    } catch (error) {
      memory = undefined;
    }
    return {
      version: SYNC_SCHEMA_VERSION, deviceId: 'backup',
      timestamp: new Date().toISOString(),
      config: stripSecrets(JSON.parse(JSON.stringify(config))), memory,
    };
  }
}

export const backupManager = new BackupManager();
