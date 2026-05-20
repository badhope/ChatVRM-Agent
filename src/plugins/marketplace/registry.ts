// ============================================================
// Plugin Marketplace - Local Plugin Registry Store
// ============================================================

import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

export interface RegistryEntry {
  name: string;
  version: string;
  description: string;
  author?: string;
  license?: string;
  keywords?: string[];
  homepage?: string;
  repository?: string;
  downloads: number;
  rating: number;
  ratingCount: number;
  publishedAt: string;
  updatedAt: string;
  versions: RegistryVersion[];
  category: string;
  dependencies?: Record<string, string>;
  icon?: string;
}

export interface RegistryVersion {
  version: string;
  publishedAt: string;
  changelog?: string;
  checksum?: string;
  size?: number;
}

export interface RegistrySource {
  name: string;
  url?: string;
  localPath?: string;
}

function resolveHome(p: string): string {
  return p.startsWith('~') ? path.join(os.homedir(), p.slice(1)) : p;
}

function defaultConfigDir(): string {
  return path.join(os.homedir(), '.devflow');
}

export class PluginRegistryStore {
  private entries: Map<string, RegistryEntry> = new Map();
  private sources: RegistrySource[] = [];
  private filePath: string;

  constructor(configDir?: string) {
    const dir = configDir ? resolveHome(configDir) : defaultConfigDir();
    this.filePath = path.join(dir, 'plugin-registry.json');
    this.sources = [
      { name: 'local', localPath: this.filePath },
    ];
  }

  async load(): Promise<void> {
    try {
      const raw = await fs.readFile(this.filePath, 'utf-8');
      const data: RegistryEntry[] = JSON.parse(raw);
      this.entries.clear();
      for (const entry of data) {
        this.entries.set(entry.name, entry);
      }
    } catch {
      this.entries.clear();
    }
  }

  async save(): Promise<void> {
    const dir = path.dirname(this.filePath);
    await fs.mkdir(dir, { recursive: true });
    const data = Array.from(this.entries.values());
    await fs.writeFile(this.filePath, JSON.stringify(data, null, 2), 'utf-8');
  }

  addSource(source: RegistrySource): void {
    const idx = this.sources.findIndex((s) => s.name === source.name);
    if (idx >= 0) {
      this.sources[idx] = source;
    } else {
      this.sources.push(source);
    }
  }

  removeSource(name: string): void {
    this.sources = this.sources.filter((s) => s.name !== name);
  }

  getSources(): RegistrySource[] {
    return [...this.sources];
  }

  async refresh(): Promise<number> {
    const before = this.entries.size;
    await this.load();
    return this.entries.size - before;
  }

  search(
    query: string,
    options?: { category?: string; limit?: number },
  ): RegistryEntry[] {
    const q = query.toLowerCase();
    const cat = options?.category;
    const limit = options?.limit ?? 50;

    const results: RegistryEntry[] = [];

    for (const entry of this.entries.values()) {
      if (cat && entry.category !== cat) continue;

      const haystack = [
        entry.name,
        entry.description,
        entry.author ?? '',
        ...(entry.keywords ?? []),
      ]
        .join(' ')
        .toLowerCase();

      if (haystack.includes(q)) {
        results.push(entry);
        if (results.length >= limit) break;
      }
    }

    return results;
  }

  get(name: string): RegistryEntry | undefined {
    return this.entries.get(name);
  }

  getAll(): RegistryEntry[] {
    return Array.from(this.entries.values());
  }

  publish(entry: RegistryEntry): void {
    this.entries.set(entry.name, entry);
  }

  unpublish(name: string): boolean {
    return this.entries.delete(name);
  }

  incrementDownloads(name: string): void {
    const entry = this.entries.get(name);
    if (entry) {
      entry.downloads += 1;
    }
  }

  updateRating(name: string, rating: number): void {
    const entry = this.entries.get(name);
    if (entry) {
      const total = entry.rating * entry.ratingCount + rating;
      entry.ratingCount += 1;
      entry.rating = total / entry.ratingCount;
    }
  }

  getCategories(): string[] {
    const cats = new Set<string>();
    for (const entry of this.entries.values()) {
      cats.add(entry.category);
    }
    return Array.from(cats).sort();
  }

  getPopular(limit: number = 10): RegistryEntry[] {
    return Array.from(this.entries.values())
      .sort((a, b) => b.downloads - a.downloads)
      .slice(0, limit);
  }

  getRecent(limit: number = 10): RegistryEntry[] {
    return Array.from(this.entries.values())
      .sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      )
      .slice(0, limit);
  }

  getByCategory(category: string): RegistryEntry[] {
    return Array.from(this.entries.values()).filter(
      (e) => e.category === category,
    );
  }
}

export const registryStore = new PluginRegistryStore();
