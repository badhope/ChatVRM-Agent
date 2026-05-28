/**
 * 工具配置管理
 * 管理已安装/启用/禁用的工具
 */

import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { createLogger } from '../services/logger.js';
import type { ToolsConfig } from '../types/mcp.js';

const logger = createLogger('ToolsConfig');

const CONFIG_DIR = path.join(os.homedir(), '.personal-assistant');
const CONFIG_FILE = path.join(CONFIG_DIR, 'tools-config.json');

/**
 * 默认配置
 */
const DEFAULT_CONFIG: ToolsConfig = {
  version: '1.0.0',
  installedPackages: [],
  enabledTools: [],
  disabledTools: [],
  lastUpdated: new Date().toISOString(),
};

/**
 * 工具配置管理器类
 */
export class ToolsConfigManager {
  private static instance: ToolsConfigManager;
  private config: ToolsConfig | null = null;
  private initialized = false;

  private constructor() {}

  /**
   * 获取单例实例
   */
  static getInstance(): ToolsConfigManager {
    if (!ToolsConfigManager.instance) {
      ToolsConfigManager.instance = new ToolsConfigManager();
    }
    return ToolsConfigManager.instance;
  }

  /**
   * 初始化配置
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      await fs.mkdir(CONFIG_DIR, { recursive: true });

      try {
        const configContent = await fs.readFile(CONFIG_FILE, 'utf-8');
        this.config = JSON.parse(configContent);
        logger.info('Tools config loaded successfully');
      } catch {
        // 配置文件不存在，创建默认配置
        this.config = { ...DEFAULT_CONFIG };
        await this.saveConfig();
        logger.info('Default tools config created');
      }

      this.initialized = true;
    } catch (error) {
      logger.error({ error }, 'Failed to initialize tools config');
      throw error;
    }
  }

  /**
   * 确保已初始化
   */
  private ensureInitialized(): void {
    if (!this.initialized || !this.config) {
      throw new Error('ToolsConfigManager not initialized. Call initialize() first.');
    }
  }

  /**
   * 保存配置
   */
  private async saveConfig(): Promise<void> {
    if (!this.config) {
      return;
    }

    this.config.lastUpdated = new Date().toISOString();

    try {
      await fs.writeFile(CONFIG_FILE, JSON.stringify(this.config, null, 2), 'utf-8');
    } catch (error) {
      logger.error({ error }, 'Failed to save tools config');
      throw error;
    }
  }

  /**
   * 获取当前配置
   */
  getConfig(): ToolsConfig {
    this.ensureInitialized();
    return { ...this.config! };
  }

  /**
   * 安装工具包
   */
  async installPackage(packageName: string): Promise<void> {
    this.ensureInitialized();

    if (!this.config!.installedPackages.includes(packageName)) {
      this.config!.installedPackages.push(packageName);
      await this.saveConfig();
      logger.info({ packageName }, 'Package installed');
    }
  }

  /**
   * 批量安装工具包
   */
  async installPackages(packageNames: string[]): Promise<void> {
    this.ensureInitialized();

    for (const packageName of packageNames) {
      if (!this.config!.installedPackages.includes(packageName)) {
        this.config!.installedPackages.push(packageName);
      }
    }

    await this.saveConfig();
    logger.info({ packageNames }, 'Packages installed');
  }

  /**
   * 卸载工具包
   */
  async uninstallPackage(packageName: string): Promise<void> {
    this.ensureInitialized();

    this.config!.installedPackages = this.config!.installedPackages.filter(
      (name) => name !== packageName
    );

    // 同时禁用该包的所有工具（如果有的话）
    this.config!.enabledTools = this.config!.enabledTools.filter(
      (name) => !name.startsWith(`${packageName}.`)
    );

    await this.saveConfig();
    logger.info({ packageName }, 'Package uninstalled');
  }

  /**
   * 批量卸载工具包
   */
  async uninstallPackages(packageNames: string[]): Promise<void> {
    this.ensureInitialized();

    this.config!.installedPackages = this.config!.installedPackages.filter(
      (name) => !packageNames.includes(name)
    );

    this.config!.enabledTools = this.config!.enabledTools.filter(
      (name) => !packageNames.some((pkg) => name.startsWith(`${pkg}.`))
    );

    await this.saveConfig();
    logger.info({ packageNames }, 'Packages uninstalled');
  }

  /**
   * 检查工具包是否已安装
   */
  isPackageInstalled(packageName: string): boolean {
    this.ensureInitialized();
    return this.config!.installedPackages.includes(packageName);
  }

  /**
   * 获取所有已安装的工具包
   */
  getInstalledPackages(): string[] {
    this.ensureInitialized();
    return [...this.config!.installedPackages];
  }

  /**
   * 启用工具
   */
  async enableTool(toolName: string): Promise<void> {
    this.ensureInitialized();

    if (!this.config!.enabledTools.includes(toolName)) {
      this.config!.enabledTools.push(toolName);
      // 从禁用列表中移除
      this.config!.disabledTools = this.config!.disabledTools.filter(
        (name) => name !== toolName
      );
      await this.saveConfig();
      logger.info({ toolName }, 'Tool enabled');
    }
  }

  /**
   * 批量启用工具
   */
  async enableTools(toolNames: string[]): Promise<void> {
    this.ensureInitialized();

    for (const toolName of toolNames) {
      if (!this.config!.enabledTools.includes(toolName)) {
        this.config!.enabledTools.push(toolName);
      }
    }

    this.config!.disabledTools = this.config!.disabledTools.filter(
      (name) => !toolNames.includes(name)
    );

    await this.saveConfig();
    logger.info({ toolNames }, 'Tools enabled');
  }

  /**
   * 禁用工具
   */
  async disableTool(toolName: string): Promise<void> {
    this.ensureInitialized();

    if (!this.config!.disabledTools.includes(toolName)) {
      this.config!.disabledTools.push(toolName);
      // 从启用列表中移除
      this.config!.enabledTools = this.config!.enabledTools.filter(
        (name) => name !== toolName
      );
      await this.saveConfig();
      logger.info({ toolName }, 'Tool disabled');
    }
  }

  /**
   * 批量禁用工具
   */
  async disableTools(toolNames: string[]): Promise<void> {
    this.ensureInitialized();

    for (const toolName of toolNames) {
      if (!this.config!.disabledTools.includes(toolName)) {
        this.config!.disabledTools.push(toolName);
      }
    }

    this.config!.enabledTools = this.config!.enabledTools.filter(
      (name) => !toolNames.includes(name)
    );

    await this.saveConfig();
    logger.info({ toolNames }, 'Tools disabled');
  }

  /**
   * 检查工具是否已启用
   */
  isToolEnabled(toolName: string): boolean {
    this.ensureInitialized();
    return this.config!.enabledTools.includes(toolName);
  }

  /**
   * 检查工具是否已禁用
   */
  isToolDisabled(toolName: string): boolean {
    this.ensureInitialized();
    return this.config!.disabledTools.includes(toolName);
  }

  /**
   * 获取所有已启用的工具
   */
  getEnabledTools(): string[] {
    this.ensureInitialized();
    return [...this.config!.enabledTools];
  }

  /**
   * 获取所有已禁用的工具
   */
  getDisabledTools(): string[] {
    this.ensureInitialized();
    return [...this.config!.disabledTools];
  }

  /**
   * 重置配置为默认值
   */
  async resetToDefault(): Promise<void> {
    this.ensureInitialized();
    this.config = { ...DEFAULT_CONFIG };
    await this.saveConfig();
    logger.info('Tools config reset to default');
  }

  /**
   * 导出配置
   */
  exportConfig(): string {
    this.ensureInitialized();
    return JSON.stringify(this.config, null, 2);
  }

  /**
   * 导入配置
   */
  async importConfig(configJson: string): Promise<void> {
    this.ensureInitialized();

    try {
      const importedConfig = JSON.parse(configJson);

      // 验证配置格式
      if (!importedConfig.version || !Array.isArray(importedConfig.installedPackages)) {
        throw new Error('Invalid config format');
      }

      this.config = {
        version: importedConfig.version || '1.0.0',
        installedPackages: importedConfig.installedPackages || [],
        enabledTools: importedConfig.enabledTools || [],
        disabledTools: importedConfig.disabledTools || [],
        lastUpdated: new Date().toISOString(),
      };

      await this.saveConfig();
      logger.info('Tools config imported');
    } catch (error) {
      logger.error({ error }, 'Failed to import tools config');
      throw error;
    }
  }
}

/**
 * 全局工具配置管理器单例
 */
export const toolsConfigManager = ToolsConfigManager.getInstance();

export default toolsConfigManager;
