import 'reflect-metadata';
import { injectable } from 'tsyringe';
import fs from 'fs/promises';
import path from 'path';
import type { ProviderType } from '../types.js';
import { DEVFLOW_DIR } from '../utils/index.js';
import type { ManagerProviderConfig, SandboxLevel } from './config-types.js';
import { SANDBOX_PERMISSIONS, DEFAULT_CONFIG } from './defaults.js';
import { validateConfigWithLogging } from './validation.js';
import type { Config } from './schemas.js';
import { DEFAULT_TIMEOUT_MS } from '../constants/index.js';
import { createLogger } from '../services/logger.js';

const logger = createLogger('config');


// Re-export 类型和常量
export type { ManagerProviderConfig, SandboxLevel };
export { SANDBOX_PERMISSIONS, DEFAULT_CONFIG };
export type { Config } from './schemas.js';

/**
 * 配置管理器
 * 管理应用程序的配置，包括提供商设置、聊天配置、记忆配置和沙箱配置
 */
@injectable()
export class ConfigManager {
  private configDir: string;
  private configFile: string;
  private config: Config;
  private _initialized = false;

  constructor() {
    this.configDir = DEVFLOW_DIR;
    this.configFile = path.join(DEVFLOW_DIR, 'config.json');
    this.config = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
  }

  async init(): Promise<void> {
    if (this._initialized) return;
    try {
      await fs.mkdir(this.configDir, { recursive: true });
      const exists = await this.configExists();
      if (exists) {
        await this.load();
      } else {
        await this.save();
      }
      this._initialized = true;
    } catch (error) {
      logger.error({ error }, '初始化配置失败');
    }
  }

  async configExists(): Promise<boolean> {
    try {
      await fs.access(this.configFile);
      return true;
    } catch {
      return false;
    }
  }

  async load(): Promise<void> {
    try {
      // 尝试加载主配置文件
      const data = await fs.readFile(this.configFile, 'utf-8');
      const loaded = JSON.parse(data);

      const validation = validateConfigWithLogging(loaded);
      if (validation.valid && validation.config) {
        this.config = this.mergeConfig(DEFAULT_CONFIG, validation.config);
      } else {
        logger.warn('[Config] 配置验证失败，尝试从备份恢复');
        await this.restoreFromBackup();
      }
    } catch (error) {
      logger.warn('[Config] 配置文件读取失败，尝试从备份恢复');
      await this.restoreFromBackup();
    }
  }

  async save(): Promise<void> {
    try {
      await fs.mkdir(this.configDir, { recursive: true });

      // 先创建备份
      try {
        const backupPath = this.configFile + '.backup';
        await fs.copyFile(this.configFile, backupPath);
      } catch (error) {
        logger.debug({ error }, 'Backup failed, continuing with save');
      }

      // 原子性写入：先写临时文件再重命名
      const tmpPath = this.configFile + '.tmp';
      await fs.writeFile(tmpPath, JSON.stringify(this.config, null, 2), 'utf-8');
      await fs.rename(tmpPath, this.configFile);
    } catch (error) {
      logger.error({ error }, '[Config] 保存配置失败');
      throw error;  // 不要静默失败
    }
  }

  private async restoreFromBackup(): Promise<void> {
    try {
      const backupPath = this.configFile + '.backup';
      const data = await fs.readFile(backupPath, 'utf-8');
      const loaded = JSON.parse(data);
      const validation = validateConfigWithLogging(loaded);

      if (validation.valid && validation.config) {
        this.config = this.mergeConfig(DEFAULT_CONFIG, validation.config);
        logger.info('[Config] 已从备份恢复配置');
      } else {
        throw new Error('备份配置也无效');
      }
    } catch {
      logger.warn('[Config] 无法从备份恢复，使用默认配置');
      this.config = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
    }
  }

  getProviderConfig(provider: ProviderType): ManagerProviderConfig {
    return this.config.providers[provider] || {};
  }

  async setProviderConfig(provider: ProviderType, config: Partial<ManagerProviderConfig>): Promise<void> {
    const existing = this.config.providers[provider] || { timeout: DEFAULT_TIMEOUT_MS, maxRetries: 2 };
    this.config.providers[provider] = {
      ...existing,
      ...config,
    };
    await this.save();
  }

  async setApiKey(provider: ProviderType, apiKey: string): Promise<void> {
    await this.setProviderConfig(provider, { apiKey });
  }

  getApiKey(provider: ProviderType): string | undefined {
    return this.config.providers[provider]?.apiKey;
  }

  async removeApiKey(provider: ProviderType): Promise<void> {
    const config = this.config.providers[provider];
    if (config) {
      delete config.apiKey;
      await this.save();
    }
  }

  getDefaultProvider(): ProviderType | undefined {
    return this.config.defaultProvider;
  }

  async setDefaultProvider(provider: ProviderType): Promise<void> {
    this.config.defaultProvider = provider;
    await this.save();
  }

  getChatConfig() {
    return this.config.chat;
  }

  async updateChatConfig(config: Partial<Config['chat']>): Promise<void> {
    this.config.chat = { ...this.config.chat, ...config };
    await this.save();
  }

  getMemoryConfig() {
    return this.config.memory;
  }

  async updateMemoryConfig(config: Partial<Config['memory']>): Promise<void> {
    this.config.memory = { ...this.config.memory, ...config };
    await this.save();
  }

  getSandboxConfig() {
    return this.config.sandbox;
  }

  async updateSandboxConfig(config: Partial<Config['sandbox']>): Promise<void> {
    this.config.sandbox = { ...this.config.sandbox, ...config };
    await this.save();
  }

  async setSandboxLevel(level: SandboxLevel): Promise<void> {
    const perms = SANDBOX_PERMISSIONS[level];
    this.config.sandbox = {
      level,
      allowDangerousOps: perms.allowSystemModify,
      confirmOnRisk: true,
    };
    await this.save();
  }

  getSandboxPermissions() {
    return SANDBOX_PERMISSIONS[this.config.sandbox.level];
  }

  getCircuitBreakerConfig() {
    return this.config.circuitBreaker;
  }

  checkSandboxPermission(action: 'delete' | 'modify' | 'network' | 'exec', path?: string): {
    allowed: boolean;
    requiresConfirmation: boolean;
    reason?: string;
  } {
    const perms = SANDBOX_PERMISSIONS[this.config.sandbox.level];

    switch (action) {
      case 'delete':
        return {
          allowed: perms.allowDelete,
          requiresConfirmation: !perms.allowDelete && this.config.sandbox.confirmOnRisk,
          reason: perms.allowDelete ? undefined : '当前权限级别禁止删除操作',
        };
      case 'modify':
        return {
          allowed: perms.allowSystemModify,
          requiresConfirmation: !perms.allowSystemModify && this.config.sandbox.confirmOnRisk,
          reason: perms.allowSystemModify ? undefined : '当前权限级别禁止修改系统文件',
        };
      case 'network':
        return {
          allowed: perms.allowNetwork,
          requiresConfirmation: !perms.allowNetwork && this.config.sandbox.confirmOnRisk,
          reason: perms.allowNetwork ? undefined : '当前权限级别禁止网络操作',
        };
      case 'exec':
        return {
          allowed: perms.allowExec,
          requiresConfirmation: !perms.allowExec && this.config.sandbox.confirmOnRisk,
          reason: perms.allowExec ? undefined : '当前权限级别禁止执行命令',
        };
    }
  }

  getConfigPath(): string {
    return this.configFile;
  }

  getAllConfig(): Config {
    return JSON.parse(JSON.stringify(this.config));
  }

  private mergeConfig(defaults: Config, loaded: Partial<Config>): Config {
    return {
      version: loaded.version || defaults.version,
      providers: { ...defaults.providers, ...loaded.providers },
      defaultProvider: loaded.defaultProvider || defaults.defaultProvider,
      chat: { ...defaults.chat, ...loaded.chat },
      memory: { ...defaults.memory, ...loaded.memory },
      sandbox: { ...defaults.sandbox, ...loaded.sandbox },
      circuitBreaker: { ...defaults.circuitBreaker, ...loaded.circuitBreaker },
    };
  }
}

export const configManager = new ConfigManager();
