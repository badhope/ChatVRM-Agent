/**
 * MCP 工具加载器
 * 负责从 mcp/ 和 tools/ 目录加载工具包
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { createLogger } from '../services/logger.js';
import type {
  MCPToolPackage,
  MCPToolDefinition,
  ToolLibraryIndex,
  ToolPackageMetadata,
  ToolLoadStatus,
  ToolEvent,
  ToolEventListener,
} from '../types/mcp.js';

const logger = createLogger('ToolLoader');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PROJECT_ROOT = path.resolve(__dirname, '../..');
const MCP_DIR = path.join(PROJECT_ROOT, 'mcp');

/**
 * MCP 工具加载器类
 */
export class ToolLoader {
  private static instance: ToolLoader;
  private loadedPackages: Map<string, MCPToolPackage> = new Map();
  private loadedTools: Map<string, MCPToolDefinition> = new Map();
  private eventListeners: Set<ToolEventListener> = new Set();

  private constructor() {}

  /**
   * 获取单例实例
   */
  static getInstance(): ToolLoader {
    if (!ToolLoader.instance) {
      ToolLoader.instance = new ToolLoader();
    }
    return ToolLoader.instance;
  }

  /**
   * 添加事件监听器
   */
  addEventListener(listener: ToolEventListener): void {
    this.eventListeners.add(listener);
  }

  /**
   * 移除事件监听器
   */
  removeEventListener(listener: ToolEventListener): void {
    this.eventListeners.delete(listener);
  }

  /**
   * 触发事件
   */
  private async emitEvent(event: ToolEvent): Promise<void> {
    for (const listener of this.eventListeners) {
      try {
        await listener(event);
      } catch (error) {
        logger.error({ error }, `Error in event listener for ${event.type}`);
      }
    }
  }

  /**
   * 获取工具库索引
   */
  async getLibraryIndex(): Promise<ToolLibraryIndex> {
    const packages: Record<string, ToolPackageMetadata> = {};
    const categories = new Set<string>();
    let totalTools = 0;

    try {
      // 从 mcp/ 目录扫描工具包
      const categoryDirs = await fs.readdir(MCP_DIR, { withFileTypes: true });

      for (const categoryDir of categoryDirs) {
        if (!categoryDir.isDirectory() || categoryDir.name.startsWith('.')) {
          continue;
        }

        const categoryPath = path.join(MCP_DIR, categoryDir.name);
        const packageDirs = await fs.readdir(categoryPath, { withFileTypes: true });

        for (const packageDir of packageDirs) {
          if (!packageDir.isDirectory() || packageDir.name.startsWith('.')) {
            continue;
          }

          try {
            const pkgMetadata = await this.loadPackageMetadata(
              categoryDir.name,
              packageDir.name
            );
            if (pkgMetadata) {
              packages[pkgMetadata.name] = pkgMetadata;
              categories.add(pkgMetadata.category);
              totalTools += pkgMetadata.toolNames.length;
            }
          } catch (error) {
            logger.warn(
              { error, category: categoryDir.name, package: packageDir.name },
              'Failed to load package metadata'
            );
          }
        }
      }
    } catch (error) {
      logger.error({ error }, 'Failed to scan mcp directory');
    }

    return {
      version: '1.0.0',
      lastUpdated: new Date().toISOString(),
      totalPackages: Object.keys(packages).length,
      totalTools,
      categories: Array.from(categories).sort(),
      packages,
    };
  }

  /**
   * 加载工具包元数据
   */
  private async loadPackageMetadata(
    category: string,
    packageName: string
  ): Promise<ToolPackageMetadata | null> {
    const packagePath = path.join(MCP_DIR, category, packageName);
    const indexPath = path.join(packagePath, 'index.ts');
    const jsonPath = path.join(packagePath, 'package.json');

    try {
      // 先尝试从 index.ts 加载
      const module = await import(`file://${indexPath}`);
      const pkg = module.default || module;

      if (pkg && typeof pkg === 'object') {
        return {
          name: pkg.name || packageName,
          version: pkg.version || '1.0.0',
          description: pkg.description || `Package: ${packageName}`,
          category,
          author: pkg.author,
          toolNames: Array.isArray(pkg.tools)
            ? pkg.tools.map((t: Record<string, unknown>) => t.name || t)
            : [packageName],
          dependencies: pkg.dependencies || [],
          path: packagePath,
        };
      }
    } catch {
      // 尝试从 package.json 加载
      try {
        const jsonContent = await fs.readFile(jsonPath, 'utf-8');
        const pkgJson = JSON.parse(jsonContent);
        return {
          name: pkgJson.name || packageName,
          version: pkgJson.version || '1.0.0',
          description: pkgJson.description || `Package: ${packageName}`,
          category,
          author: pkgJson.author,
          toolNames: pkgJson.toolNames || [packageName],
          dependencies: pkgJson.dependencies || [],
          path: packagePath,
        };
      } catch {
        // 都失败了，返回基本信息
        return {
          name: packageName,
          version: '1.0.0',
          description: `Package: ${packageName}`,
          category,
          toolNames: [packageName],
          dependencies: [],
          path: packagePath,
        };
      }
    }

    return null;
  }

  /**
   * 加载工具包
   */
  async loadPackage(packageName: string): Promise<ToolLoadStatus> {
    // 检查是否已加载
    if (this.loadedPackages.has(packageName)) {
      return {
        packageName,
        toolNames: this.loadedPackages.get(packageName)!.tools.map((t) => t.name),
        loaded: true,
      };
    }

    try {
      const index = await this.getLibraryIndex();
      const pkgMetadata = index.packages[packageName];

      if (!pkgMetadata) {
        return {
          packageName,
          toolNames: [],
          loaded: false,
          error: `Package ${packageName} not found`,
        };
      }

      const indexPath = path.join(pkgMetadata.path, 'index.ts');
      const module = await import(`file://${indexPath}`);
      const pkg = module.default || module;

      if (!pkg || !Array.isArray(pkg.tools)) {
        return {
          packageName,
          toolNames: [],
          loaded: false,
          error: `Invalid package format for ${packageName}`,
        };
      }

      // 调用包的 load 函数（如果有）
      if (typeof pkg.load === 'function') {
        await pkg.load();
      }

      // 存储包和工具
      this.loadedPackages.set(packageName, pkg);
      const toolNames: string[] = [];

      for (const tool of pkg.tools) {
        this.loadedTools.set(tool.name, tool);
        toolNames.push(tool.name);
        await this.emitEvent({ type: 'tool_registered', tool });
      }

      await this.emitEvent({ type: 'package_loaded', pkg });

      logger.info({ packageName, toolNames }, 'Package loaded successfully');

      return {
        packageName,
        toolNames,
        loaded: true,
      };
    } catch (error) {
      logger.error({ error, packageName }, 'Failed to load package');
      return {
        packageName,
        toolNames: [],
        loaded: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * 卸载工具包
   */
  async unloadPackage(packageName: string): Promise<boolean> {
    const pkg = this.loadedPackages.get(packageName);
    if (!pkg) {
      return false;
    }

    try {
      // 调用包的 unload 函数（如果有）
      if (typeof pkg.unload === 'function') {
        await pkg.unload();
      }

      // 移除工具
      for (const tool of pkg.tools) {
        this.loadedTools.delete(tool.name);
        await this.emitEvent({ type: 'tool_unregistered', toolName: tool.name });
      }

      // 移除包
      this.loadedPackages.delete(packageName);
      await this.emitEvent({ type: 'package_unloaded', packageName });

      logger.info({ packageName }, 'Package unloaded successfully');
      return true;
    } catch (error) {
      logger.error({ error, packageName }, 'Failed to unload package');
      return false;
    }
  }

  /**
   * 获取已加载的工具
   */
  getTool(toolName: string): MCPToolDefinition | undefined {
    return this.loadedTools.get(toolName);
  }

  /**
   * 获取所有已加载的工具
   */
  getAllTools(): MCPToolDefinition[] {
    return Array.from(this.loadedTools.values());
  }

  /**
   * 获取已加载的工具包
   */
  getLoadedPackages(): MCPToolPackage[] {
    return Array.from(this.loadedPackages.values());
  }

  /**
   * 检查工具是否已加载
   */
  isToolLoaded(toolName: string): boolean {
    return this.loadedTools.has(toolName);
  }

  /**
   * 检查工具包是否已加载
   */
  isPackageLoaded(packageName: string): boolean {
    return this.loadedPackages.has(packageName);
  }

  /**
   * 加载所有可用的工具包
   */
  async loadAllPackages(): Promise<ToolLoadStatus[]> {
    const index = await this.getLibraryIndex();
    const statuses: ToolLoadStatus[] = [];

    for (const packageName of Object.keys(index.packages)) {
      const status = await this.loadPackage(packageName);
      statuses.push(status);
    }

    return statuses;
  }

  /**
   * 卸载所有工具包
   */
  async unloadAllPackages(): Promise<void> {
    const packageNames = Array.from(this.loadedPackages.keys());
    for (const packageName of packageNames) {
      await this.unloadPackage(packageName);
    }
  }

  /**
   * 按分类获取工具包
   */
  async getPackagesByCategory(category: string): Promise<ToolPackageMetadata[]> {
    const index = await this.getLibraryIndex();
    return Object.values(index.packages).filter((p) => p.category === category);
  }

  /**
   * 搜索工具包
   */
  async searchPackages(keyword: string): Promise<ToolPackageMetadata[]> {
    const index = await this.getLibraryIndex();
    const lowerKeyword = keyword.toLowerCase();

    return Object.values(index.packages).filter(
      (pkg) =>
        pkg.name.toLowerCase().includes(lowerKeyword) ||
        pkg.description.toLowerCase().includes(lowerKeyword) ||
        pkg.toolNames.some((name) => name.toLowerCase().includes(lowerKeyword))
    );
  }
}

/**
 * 全局工具加载器单例
 */
export const toolLoader = ToolLoader.getInstance();

export default toolLoader;
