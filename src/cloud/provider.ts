/**
 * Sync Provider Implementations
 * Provides local, GitHub Gist, and custom server sync providers
 */

import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import https from 'https';
import type { SyncConfig, SyncData, DeviceInfo } from './types.js';
import { SYNC_SCHEMA_VERSION } from './types.js';

export interface SyncProvider {
  name: string;
  upload(data: SyncData): Promise<void>;
  download(): Promise<SyncData | null>;
  listDevices(): Promise<DeviceInfo[]>;
  removeDevice(deviceId: string): Promise<void>;
}

// ============================================================
// Local Sync Provider - stores data in ~/.devflow/sync/
// ============================================================

export class LocalSyncProvider implements SyncProvider {
  readonly name = 'local';
  private syncDir: string;
  private devicesFile: string;
  private dataFile: string;

  constructor(syncDir?: string) {
    this.syncDir = syncDir || path.join(os.homedir(), '.devflow', 'sync');
    this.devicesFile = path.join(this.syncDir, 'devices.json');
    this.dataFile = path.join(this.syncDir, 'sync-data.json');
  }

  async upload(data: SyncData): Promise<void> {
    await fs.mkdir(this.syncDir, { recursive: true });
    await fs.writeFile(this.dataFile, JSON.stringify(data, null, 2));
    const devices = await this.loadDevices();
    const idx = devices.findIndex(d => d.id === data.deviceId);
    const info: DeviceInfo = { id: data.deviceId, name: os.hostname(), 
      lastSeenAt: data.timestamp, platform: process.platform, version: SYNC_SCHEMA_VERSION };
    if (idx >= 0) devices[idx] = info; else devices.push(info);
    await fs.writeFile(this.devicesFile, JSON.stringify(devices, null, 2));
  }

  async download(): Promise<SyncData | null> {
    try { return JSON.parse(await fs.readFile(this.dataFile, 'utf-8')) as SyncData; }
    catch (error) {
      return null;
    }
  }

  async listDevices(): Promise<DeviceInfo[]> { return this.loadDevices(); }

  async removeDevice(deviceId: string): Promise<void> {
    const devices = await this.loadDevices();
    await fs.writeFile(this.devicesFile, JSON.stringify(devices.filter(d => d.id !== deviceId), null, 2));
  }

  private async loadDevices(): Promise<DeviceInfo[]> {
    try { return JSON.parse(await fs.readFile(this.devicesFile, 'utf-8')) as DeviceInfo[]; }
    catch (error) {
      return [];
    }
  }
}

// ============================================================
// GitHub Gist Sync Provider - stores data in a GitHub Gist
// ============================================================

export class GistSyncProvider implements SyncProvider {
  readonly name = 'gist';
  private gistId: string;
  private token: string;

  constructor(gistId: string, token: string) { this.gistId = gistId; this.token = token; }

  async upload(data: SyncData): Promise<void> {
    await this.gistRequest('PATCH', `/gists/${this.gistId}`, 
      { files: { 'devflow-sync.json': { content: JSON.stringify(data, null, 2) } } });
  }

  async download(): Promise<SyncData | null> {
    try {
      const res = await this.gistRequest('GET', `/gists/${this.gistId}`) as { files?: Record<string, { content?: string }> };
      const content = res.files?.['devflow-sync.json']?.content;
      return content ? JSON.parse(content) as SyncData : null;
    } catch (error) {
      return null;
    }
  }

  async listDevices(): Promise<DeviceInfo[]> {
    try {
      const data = await this.download();
      return data ? [{ id: data.deviceId, name: 'Gist Sync', lastSeenAt: data.timestamp,
        platform: 'unknown', version: data.version }] : [];
    } catch (error) {
      return [];
    }
  }

  async removeDevice(): Promise<void> { throw new Error('Device management not supported for Gist'); }

  private gistRequest(method: string, endpoint: string, body?: unknown): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const req = https.request({ hostname: 'api.github.com', path: endpoint, method,
        headers: { 'Authorization': `Bearer ${this.token}`, 'User-Agent': 'DevFlow-Agent', 'Content-Type': 'application/json' } },
        (res) => {
          let data = '';
          res.on('data', c => data += c);
          res.on('end', () => {
            if (res.statusCode && res.statusCode < 300) {
              try {
                resolve(data ? JSON.parse(data) : {});
              } catch (e: unknown) {
                reject(new Error(`Invalid JSON: ${e instanceof Error ? e.message : String(e)}`));
              }
            } else {
              reject(new Error(`Gist API error: ${res.statusCode}`));
            }
          });
        });
      req.on('error', reject);
      if (body) req.write(JSON.stringify(body));
      req.end();
    });
  }
}

// ============================================================
// Custom Server Sync Provider - stores data in a custom server
// ============================================================

export class CustomSyncProvider implements SyncProvider {
  readonly name = 'custom';
  private endpoint: string;
  private token: string;

  constructor(endpoint: string, token: string) { this.endpoint = endpoint; this.token = token; }

  async upload(data: SyncData): Promise<void> { await this.request('POST', '/sync/upload', data); }
  async download(): Promise<SyncData | null> {
    try { return await this.request('GET', '/sync/download') as SyncData; }
    catch (error) {
      return null;
    }
  }
  async listDevices(): Promise<DeviceInfo[]> {
    try { return await this.request('GET', '/sync/devices') as DeviceInfo[]; }
    catch (error) {
      return [];
    }
  }
  async removeDevice(deviceId: string): Promise<void> { await this.request('DELETE', `/sync/devices/${deviceId}`); }

  private request(method: string, reqPath: string, body?: unknown): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const url = new URL(reqPath, this.endpoint);
      const req = https.request({ hostname: url.hostname, port: url.port || 443, path: url.pathname + url.search, method,
        headers: { 'Authorization': `Bearer ${this.token}`, 'Content-Type': 'application/json' } },
        (res) => {
          let data = '';
          res.on('data', c => data += c);
          res.on('end', () => {
            if (res.statusCode && res.statusCode < 300) {
              try {
                resolve(data ? JSON.parse(data) : {});
              } catch (e: unknown) {
                reject(new Error(`Invalid JSON: ${e instanceof Error ? e.message : String(e)}`));
              }
            } else {
              reject(new Error(`Server error: ${res.statusCode}`));
            }
          });
        });
      req.on('error', reject);
      if (body) req.write(JSON.stringify(body));
      req.end();
    });
  }
}

// ============================================================
// Provider Factory
// ============================================================

export function createSyncProvider(config: SyncConfig): SyncProvider {
  switch (config.provider) {
    case 'local': return new LocalSyncProvider();
    case 'gist':
      if (!config.gistId || !config.gistToken) throw new Error('Gist requires gistId and gistToken');
      return new GistSyncProvider(config.gistId, config.gistToken);
    case 'custom':
      if (!config.customEndpoint || !config.customToken) throw new Error('Custom requires endpoint and token');
      return new CustomSyncProvider(config.customEndpoint, config.customToken);
    default: throw new Error(`Unknown provider: ${config.provider}`);
  }
}
