// ============================================================
// Plugin Marketplace - Plugin Publisher
// ============================================================

import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { registryStore } from './registry.js';
import type { RegistryEntry, RegistryVersion } from './registry.js';
import type { PluginManifest } from '../types.js';

export interface PublishOptions {
  pluginDir: string;
  registry?: string;
  force?: boolean;
}

export interface PublishResult {
  success: boolean;
  name: string;
  version: string;
  error?: string;
}

export interface ValidateResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

const KEBAB_RE = /^[a-z][a-z0-9-]*$/;
const SEMVER_RE = /^\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?(\+[a-zA-Z0-9.]+)?$/;

function resolveHome(p: string): string {
  return p.startsWith('~') ? path.join(os.homedir(), p.slice(1)) : p;
}

function defaultConfigDir(): string {
  return path.join(os.homedir(), '.devflow');
}

export async function validatePlugin(pluginDir: string): Promise<ValidateResult> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const resolvedDir = resolveHome(pluginDir);
  const manifestPath = path.join(resolvedDir, 'manifest.json');
  let manifest: PluginManifest;
  try {
    const raw = await fs.readFile(manifestPath, 'utf-8');
    manifest = JSON.parse(raw);
  } catch {
    errors.push('manifest.json not found or invalid JSON');
    return { valid: false, errors, warnings };
  }
  if (!manifest.name || typeof manifest.name !== 'string') {
    errors.push('manifest.json must have a "name" field (string)');
  } else if (!KEBAB_RE.test(manifest.name)) {
    errors.push(`Plugin name "${manifest.name}" must be kebab-case`);
  }
  if (!manifest.version || typeof manifest.version !== 'string') {
    errors.push('manifest.json must have a "version" field (string)');
  } else if (!SEMVER_RE.test(manifest.version)) {
    errors.push(`Version "${manifest.version}" must follow semver (e.g. 1.2.3)`);
  }
  if (!manifest.description || typeof manifest.description !== 'string') {
    errors.push('manifest.json must have a "description" field (string)');
  }
  const mainFile = manifest.main ?? 'index.js';
  try {
    await fs.access(path.join(resolvedDir, mainFile));
  } catch {
    errors.push(`Entry point "${mainFile}" not found in plugin directory`);
  }
  if (manifest.name && !errors.length) {
    const existing = registryStore.get(manifest.name);
    if (existing) warnings.push(`Plugin "${manifest.name}" already exists in the registry`);
  }
  if (!manifest.author) warnings.push('No "author" field in manifest.json');
  if (!manifest.keywords?.length) warnings.push('No "keywords" field; discoverability may be reduced');
  return { valid: errors.length === 0, errors, warnings };
}

export async function publishPlugin(options: PublishOptions): Promise<PublishResult> {
  const resolvedDir = resolveHome(options.pluginDir);
  const validation = await validatePlugin(options.pluginDir);
  if (!validation.valid) {
    return { success: false, name: '', version: '', error: `Validation failed: ${validation.errors.join('; ')}` };
  }
  const manifestPath = path.join(resolvedDir, 'manifest.json');
  const raw = await fs.readFile(manifestPath, 'utf-8');
  const manifest: PluginManifest = JSON.parse(raw);
  const existing = registryStore.get(manifest.name);
  if (existing && !options.force) {
    return { success: false, name: manifest.name, version: manifest.version, error: `Plugin "${manifest.name}" already exists. Use --force to overwrite.` };
  }
  const now = new Date().toISOString();
  const newVersion: RegistryVersion = { version: manifest.version, publishedAt: now };
  const entry: RegistryEntry = {
    name: manifest.name,
    version: manifest.version,
    description: manifest.description,
    author: manifest.author,
    license: manifest.license,
    keywords: manifest.keywords,
    dependencies: manifest.dependencies,
    downloads: existing?.downloads ?? 0,
    rating: existing?.rating ?? 0,
    ratingCount: existing?.ratingCount ?? 0,
    publishedAt: existing?.publishedAt ?? now,
    updatedAt: now,
    versions: existing?.versions ?? [],
    category: (manifest as PluginManifest & { category?: string }).category ?? 'tool',
  };
  if (!entry.versions.some((v) => v.version === manifest.version)) {
    entry.versions.push(newVersion);
  }
  registryStore.publish(entry);
  await registryStore.save();
  const sourcesDir = path.join(defaultConfigDir(), 'plugin-sources', manifest.name);
  await fs.mkdir(sourcesDir, { recursive: true });
  await fs.cp(resolvedDir, sourcesDir, { recursive: true, force: true });
  return { success: true, name: manifest.name, version: manifest.version };
}

export async function createPluginScaffold(name: string, targetDir: string): Promise<void> {
  const pluginDir = path.join(resolveHome(targetDir), name);
  await fs.mkdir(pluginDir, { recursive: true });
  const manifest: PluginManifest = {
    name, version: '0.1.0', description: `A DevFlow plugin: ${name}`,
    main: 'index.js', keywords: ['devflow', 'plugin'],
  };
  await fs.writeFile(path.join(pluginDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf-8');
  const indexJs = `// ${name} plugin\nexport default {\n  manifest: ${JSON.stringify(manifest, null, 4)},\n  async activate(context) {\n    context.logger.info('${name} activated');\n  },\n  async deactivate() {\n    console.log('${name} deactivated');\n  },\n};\n`;
  await fs.writeFile(path.join(pluginDir, 'index.js'), indexJs, 'utf-8');
  const readme = `# ${name}\n\n## Description\n\n${manifest.description}\n\n## Installation\n\n\`\`\`bash\ndevflow plugin install ${name}\n\`\`\`\n\n## Usage\n\nThis plugin is automatically activated after installation.\n\n## Configuration\n\nNo additional configuration required.\n`;
  await fs.writeFile(path.join(pluginDir, 'README.md'), readme, 'utf-8');
}
