// ============================================================
// Community Features - Plugin Sharing (Export / Import)
// ============================================================

import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';

export interface PluginManifest {
  name: string;
  version: string;
  description: string;
  main?: string;
  enabled?: boolean;
}

export interface ShareBundle {
  format: 'personal-assistant-plugin';
  version: string;
  plugin: { manifest: PluginManifest; files: Record<string, string> };
  metadata: { createdAt: string; exportedBy?: string; checksum: string };
}

export interface ExportOptions {
  pluginName: string;
  pluginDir?: string; // explicit plugin directory (overrides search)
  includeSource?: boolean;
  includeReadme?: boolean;
  includeConfig?: boolean;
  format?: 'json' | 'tarball';
  outputPath?: string;
}

export interface ImportOptions {
  source: string;
  install?: boolean;
  global?: boolean;
  overwrite?: boolean;
}

export interface ImportResult {
  success: boolean;
  pluginName: string;
  version: string;
  filesImported: number;
  installed: boolean;
  error?: string;
}

const BUNDLE_FORMAT_VERSION = '1.0.0';
const PLUGIN_SEARCH_DIRS = ['./plugins', '~/.personal-assistant/plugins'];

function resolveHome(p: string): string {
  return p.startsWith('~') ? path.join(os.homedir(), p.slice(1)) : p;
}

function defaultConfigDir(): string {
  return path.join(os.homedir(), '.personal-assistant');
}

export function generateChecksum(content: string): string {
  return crypto.createHash('sha256').update(content, 'utf-8').digest('hex');
}

export function bundleToString(bundle: ShareBundle): string {
  return JSON.stringify(bundle, null, 2);
}

export function stringToBundle(str: string): ShareBundle {
  return JSON.parse(str) as ShareBundle;
}

export function validateBundle(bundle: ShareBundle): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (bundle.format !== 'personal-assistant-plugin')
    errors.push(`Invalid format: expected "personal-assistant-plugin", got "${bundle.format}"`);
  if (!bundle.version) errors.push('Missing bundle version');
  if (!bundle.plugin?.manifest) {
    errors.push('Missing plugin manifest');
  } else {
    const m = bundle.plugin.manifest;
    if (!m.name) errors.push('Manifest missing "name" field');
    if (!m.version) errors.push('Manifest missing "version" field');
    if (!m.description) errors.push('Manifest missing "description" field');
  }
  if (!bundle.plugin?.files || Object.keys(bundle.plugin.files).length === 0)
    errors.push('Bundle contains no plugin files');
  if (bundle.metadata?.checksum) {
    const serialized = JSON.stringify({
      format: bundle.format,
      version: bundle.version,
      plugin: bundle.plugin,
    });
    if (bundle.metadata.checksum !== generateChecksum(serialized))
      errors.push('Checksum mismatch: bundle may be corrupted');
  } else {
    errors.push('Missing bundle checksum');
  }
  return { valid: errors.length === 0, errors };
}

async function resolvePluginDir(pluginName: string): Promise<string | null> {
  for (const dir of PLUGIN_SEARCH_DIRS) {
    const candidate = path.join(resolveHome(dir), pluginName);
    try {
      if ((await fs.stat(candidate)).isDirectory()) return candidate;
    } catch (error) {
      // Skip invalid directories
    }
  }
  return null;
}

export async function exportPlugin(options: ExportOptions): Promise<ShareBundle> {
  const pluginDir = options.pluginDir || (await resolvePluginDir(options.pluginName));
  if (!pluginDir) throw new Error(`Plugin directory not found for "${options.pluginName}"`);
  const manifestPath = path.join(pluginDir, 'manifest.json');
  const manifestRaw = await fs.readFile(manifestPath, 'utf-8');
  const manifest = JSON.parse(manifestRaw);
  const files: Record<string, string> = {};
  const entries = await fs.readdir(pluginDir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) continue;
    const ext = path.extname(entry.name).toLowerCase();
    if (entry.name === 'manifest.json') continue;
    if (
      !options.includeConfig &&
      (entry.name.endsWith('.config.js') || entry.name.endsWith('.config.json'))
    )
      continue;
    if (!options.includeReadme && entry.name.toLowerCase() === 'readme.md') continue;
    if (!options.includeSource && (ext === '.ts' || ext === '.js' || ext === '.map')) continue;
    const content = await fs.readFile(path.join(pluginDir, entry.name), 'utf-8');
    files[entry.name] = Buffer.from(content, 'utf-8').toString('base64');
  }
  files['manifest.json'] = Buffer.from(manifestRaw, 'utf-8').toString('base64');
  const pluginData = { manifest, files };
  const serialized = JSON.stringify({
    format: 'personal-assistant-plugin' as const,
    version: BUNDLE_FORMAT_VERSION,
    plugin: pluginData,
  });
  const checksum = generateChecksum(serialized);
  const bundle: ShareBundle = {
    format: 'personal-assistant-plugin',
    version: BUNDLE_FORMAT_VERSION,
    plugin: pluginData,
    metadata: {
      createdAt: new Date().toISOString(),
      exportedBy: process.env.USER ?? process.env.USERNAME ?? undefined,
      checksum,
    },
  };
  if (options.outputPath) {
    await fs.mkdir(path.dirname(options.outputPath), { recursive: true });
    await fs.writeFile(options.outputPath, bundleToString(bundle), 'utf-8');
  }
  return bundle;
}

export async function importPlugin(options: ImportOptions): Promise<ImportResult> {
  let bundle: ShareBundle;
  try {
    const raw = await fs.readFile(options.source, 'utf-8');
    bundle = stringToBundle(raw);
  } catch (error) {
    try {
      bundle = stringToBundle(options.source);
    } catch (parseError) {
      return {
        success: false,
        pluginName: '',
        version: '',
        filesImported: 0,
        installed: false,
        error: 'Invalid bundle: cannot read file or parse JSON',
      };
    }
  }
  const validation = validateBundle(bundle);
  if (!validation.valid) {
    return {
      success: false,
      pluginName: bundle.plugin?.manifest?.name ?? '',
      version: bundle.plugin?.manifest?.version ?? '',
      filesImported: 0,
      installed: false,
      error: `Validation failed: ${validation.errors.join('; ')}`,
    };
  }
  const { manifest, files } = bundle.plugin;
  let filesImported = 0;
  if (options.install) {
    const installDir = options.global
      ? path.join(defaultConfigDir(), 'plugins')
      : path.resolve('./plugins');
    const targetPath = path.join(installDir, manifest.name);
    try {
      if (!options.overwrite) {
        await fs.access(targetPath);
        return {
          success: false,
          pluginName: manifest.name,
          version: manifest.version,
          filesImported: 0,
          installed: false,
          error: `Plugin "${manifest.name}" already exists. Use overwrite option to replace.`,
        };
      }
    } catch (error) {
      // Proceed with installation
    }
    await fs.mkdir(targetPath, { recursive: true });
    for (const [filename, content] of Object.entries(files)) {
      await fs.writeFile(
        path.join(targetPath, filename),
        Buffer.from(content, 'base64').toString('utf-8'),
        'utf-8'
      );
      filesImported++;
    }
  } else {
    filesImported = Object.keys(files).length;
  }
  return {
    success: true,
    pluginName: manifest.name,
    version: manifest.version,
    filesImported,
    installed: options.install ?? false,
  };
}
