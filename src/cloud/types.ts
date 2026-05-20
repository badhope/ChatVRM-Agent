/**
 * Cloud Sync Type Definitions
 * Defines interfaces for configuration sync, history backup, and multi-device support
 */

export interface SyncConfig {
  enabled: boolean;
  provider: 'local' | 'gist' | 'custom';
  gistId?: string;           // GitHub Gist ID
  gistToken?: string;        // GitHub token for Gist
  customEndpoint?: string;   // Custom sync server URL
  customToken?: string;      // Auth token for custom server
  syncInterval?: number;     // minutes, default 5
  lastSyncAt?: string;       // ISO timestamp
}

export interface SyncData {
  version: string;           // schema version
  deviceId: string;          // unique device identifier
  timestamp: string;         // ISO timestamp
  config: Record<string, unknown>;
  memory?: {
    conversations: unknown[];
    knowledge: unknown[];
  };
  plugins?: {
    enabled: string[];
    configs: Record<string, unknown>;
  };
}

export interface SyncResult {
  success: boolean;
  action: 'upload' | 'download' | 'conflict';
  timestamp: string;
  error?: string;
  changes?: {
    config: boolean;
    memory: boolean;
    plugins: boolean;
  };
}

export interface DeviceInfo {
  id: string;
  name: string;
  lastSeenAt: string;
  platform: string;
  version: string;
}

export interface ConflictData {
  local: SyncData;
  remote: SyncData;
  fields: Array<'config' | 'memory' | 'plugins'>;
}

export type ConflictStrategy = 'local' | 'remote' | 'merge';

// Schema version for sync data
export const SYNC_SCHEMA_VERSION = '1.0.0';

// Default sync config
export const DEFAULT_SYNC_CONFIG: SyncConfig = {
  enabled: false,
  provider: 'local',
  syncInterval: 5,
};
