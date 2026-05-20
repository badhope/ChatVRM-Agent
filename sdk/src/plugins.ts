/**
 * DevFlow Agent SDK - Plugins Module
 *
 * Provides programmatic access to the plugin system for
 * managing and interacting with DevFlow plugins and MCP servers.
 */

import type { PluginInfo, MCPInfo } from './types.js';

/**
 * DevFlowPlugins - Plugin and MCP management.
 *
 * @example
 * ```typescript
 * const plugins = new DevFlowPlugins();
 * const list = await plugins.list();
 * await plugins.enable('my-plugin');
 * ```
 */
export class DevFlowPlugins {
  private pluginDir: string;

  /**
   * Create a new plugin manager instance.
   *
   * @param pluginDir - Optional custom plugin directory
   */
  constructor(pluginDir?: string) {
    this.pluginDir = pluginDir || 'plugins';
  }

  /**
   * List all available plugins.
   *
   * @returns Array of plugin information
   */
  async list(): Promise<PluginInfo[]> {
    const { PluginLoader } = await import('../../dist/plugins/plugin-loader.js');
    const fs = await import('fs/promises');
    const path = await import('path');

    const plugins: PluginInfo[] = [];

    try {
      const entries = await fs.readdir(this.pluginDir, { withFileTypes: true });

      for (const entry of entries) {
        if (!entry.isDirectory()) continue;

        const pluginPath = path.join(this.pluginDir, entry.name);
        const manifestPath = path.join(pluginPath, 'manifest.json');

        try {
          const manifestContent = await fs.readFile(manifestPath, 'utf8');
          const manifest = JSON.parse(manifestContent);

          plugins.push({
            name: manifest.name || entry.name,
            version: manifest.version || '0.0.0',
            description: manifest.description || '',
            enabled: manifest.enabled !== false,
            author: manifest.author,
          });
        } catch {
          // Invalid or missing manifest
          plugins.push({
            name: entry.name,
            version: '0.0.0',
            description: 'No description available',
            enabled: false,
          });
        }
      }
    } catch {
      // Plugin directory doesn't exist
    }

    return plugins;
  }

  /**
   * Enable a plugin.
   *
   * @param name - Plugin name
   */
  async enable(name: string): Promise<void> {
    const fs = await import('fs/promises');
    const path = await import('path');

    const manifestPath = path.join(this.pluginDir, name, 'manifest.json');

    try {
      const content = await fs.readFile(manifestPath, 'utf8');
      const manifest = JSON.parse(content);
      manifest.enabled = true;
      await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
    } catch (error) {
      throw new Error(`Failed to enable plugin "${name}": ${error}`);
    }
  }

  /**
   * Disable a plugin.
   *
   * @param name - Plugin name
   */
  async disable(name: string): Promise<void> {
    const fs = await import('fs/promises');
    const path = await import('path');

    const manifestPath = path.join(this.pluginDir, name, 'manifest.json');

    try {
      const content = await fs.readFile(manifestPath, 'utf8');
      const manifest = JSON.parse(content);
      manifest.enabled = false;
      await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
    } catch (error) {
      throw new Error(`Failed to disable plugin "${name}": ${error}`);
    }
  }

  /**
   * Install a plugin from a source.
   *
   * @param source - Plugin source (npm package, git URL, or local path)
   * @returns Installed plugin info
   */
  async install(source: string): Promise<PluginInfo> {
    const fs = await import('fs/promises');
    const path = await import('path');

    // Determine source type and install
    let pluginName: string;
    let manifest: any;

    if (source.startsWith('npm:') || !source.includes('/')) {
      // NPM package
      pluginName = source.replace('npm:', '');
      // In a real implementation, this would run npm install
      throw new Error('NPM plugin installation not yet implemented');
    } else if (source.startsWith('git+') || source.includes('github.com')) {
      // Git repository
      pluginName = path.basename(source).replace('.git', '');
      throw new Error('Git plugin installation not yet implemented');
    } else {
      // Local path
      pluginName = path.basename(source);
      const manifestPath = path.join(source, 'manifest.json');
      const content = await fs.readFile(manifestPath, 'utf8');
      manifest = JSON.parse(content);

      // Copy plugin to plugin directory
      const targetDir = path.join(this.pluginDir, pluginName);
      await fs.mkdir(targetDir, { recursive: true });

      // Copy files (simplified - real impl would use recursive copy)
      const files = await fs.readdir(source);
      for (const file of files) {
        const srcFile = path.join(source, file);
        const tgtFile = path.join(targetDir, file);
        const stat = await fs.stat(srcFile);
        if (stat.isFile()) {
          await fs.copyFile(srcFile, tgtFile);
        }
      }
    }

    return {
      name: manifest?.name || pluginName,
      version: manifest?.version || '0.0.0',
      description: manifest?.description || '',
      enabled: true,
    };
  }

  /**
   * Uninstall a plugin.
   *
   * @param name - Plugin name
   */
  async uninstall(name: string): Promise<void> {
    const fs = await import('fs/promises');
    const path = await import('path');

    const pluginPath = path.join(this.pluginDir, name);

    try {
      await fs.rm(pluginPath, { recursive: true, force: true });
    } catch (error) {
      throw new Error(`Failed to uninstall plugin "${name}": ${error}`);
    }
  }

  /**
   * List all MCP servers.
   *
   * @returns Array of MCP server info
   */
  async listMCP(): Promise<MCPInfo[]> {
    const fs = await import('fs/promises');
    const path = await import('path');

    const mcpDir = 'mcp';
    const servers: MCPInfo[] = [];

    try {
      const entries = await fs.readdir(mcpDir, { withFileTypes: true });

      for (const entry of entries) {
        if (!entry.isDirectory()) continue;

        // Try to read MCP config
        const configPath = path.join(mcpDir, entry.name, 'config.json');
        let enabled = true;
        let tools: string[] = [];

        try {
          const content = await fs.readFile(configPath, 'utf8');
          const config = JSON.parse(content);
          enabled = config.enabled !== false;
          tools = config.tools || [];
        } catch {}

        servers.push({
          name: entry.name,
          enabled,
          tools,
        });
      }
    } catch {
      // MCP directory doesn't exist
    }

    return servers;
  }

  /**
   * Enable an MCP server.
   *
   * @param name - Server name
   */
  async enableMCP(name: string): Promise<void> {
    const fs = await import('fs/promises');
    const path = await import('path');

    const configPath = path.join('mcp', name, 'config.json');

    try {
      const content = await fs.readFile(configPath, 'utf8');
      const config = JSON.parse(content);
      config.enabled = true;
      await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf8');
    } catch (error) {
      throw new Error(`Failed to enable MCP server "${name}": ${error}`);
    }
  }

  /**
   * Disable an MCP server.
   *
   * @param name - Server name
   */
  async disableMCP(name: string): Promise<void> {
    const fs = await import('fs/promises');
    const path = await import('path');

    const configPath = path.join('mcp', name, 'config.json');

    try {
      const content = await fs.readFile(configPath, 'utf8');
      const config = JSON.parse(content);
      config.enabled = false;
      await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf8');
    } catch (error) {
      throw new Error(`Failed to disable MCP server "${name}": ${error}`);
    }
  }
}

/**
 * Convenience function to list plugins.
 *
 * @returns Array of plugin info
 */
export async function listPlugins(): Promise<PluginInfo[]> {
  const plugins = new DevFlowPlugins();
  return plugins.list();
}

/**
 * Convenience function to enable a plugin.
 *
 * @param name - Plugin name
 */
export async function enablePlugin(name: string): Promise<void> {
  const plugins = new DevFlowPlugins();
  return plugins.enable(name);
}

/**
 * Convenience function to disable a plugin.
 *
 * @param name - Plugin name
 */
export async function disablePlugin(name: string): Promise<void> {
  const plugins = new DevFlowPlugins();
  return plugins.disable(name);
}
