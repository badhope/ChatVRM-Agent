import fs from 'fs/promises';
import path from 'path';
import { homedir } from 'os';
import { v4 as uuidv4 } from 'uuid';
import { Mutex } from 'async-mutex';
import Minisearch from 'minisearch';
import type {
  IMemoryPort,
  MemoryRecord,
  MemoryStats,
  ConsolidationResult,
} from '../ports/memory.port.js';

const MEMORY_DIR = path.join(homedir(), '.personal-assistant', 'memory');
const MAX_RECORDS = 1000;
const RETENTION_DAYS = 30;

export class MemoryAdapter implements IMemoryPort {
  private mutex = new Mutex();
  private searchEngine: Minisearch | null = null;
  private initialized = false;

  private async ensureInit(): Promise<void> {
    if (this.initialized) return;
    if (this._initializing) {
      await this._initPromise;
      return;
    }
    this._initializing = true;
    this._initPromise = this._doInit();
    try {
      await this._initPromise;
    } finally {
      this._initializing = false;
    }
  }

  private _initializing = false;
  private _initPromise: Promise<void> | null = null;

  private async _doInit(): Promise<void> {
    await fs.mkdir(MEMORY_DIR, { recursive: true });

    try {
      this.searchEngine = new Minisearch({
        fields: ['input', 'output', 'tags'],
        storeFields: ['input', 'output', 'provider', 'model', 'timestamp', 'tags'],
        searchOptions: {
          boost: { input: 2, tags: 1.5 },
          prefix: true,
          fuzzy: 0.2,
        },
      });

      const records = await this.loadAllRaw();
      if (records.length > 0) {
        this.searchEngine.addAll(
          records.map((r) => ({
            id: r.id,
            input: r.input,
            output: r.output,
            provider: r.provider,
            model: r.model,
            timestamp: r.timestamp,
            tags: r.tags.join(' '),
          })),
        );
      }
    } catch {
      this.searchEngine = null;
    }

    this.initialized = true;
  }

  private async loadAllRaw(): Promise<MemoryRecord[]> {
    try {
      const files = await fs.readdir(MEMORY_DIR);
      const jsonFiles = files.filter((f) => f.endsWith('.json'));

      const records: MemoryRecord[] = [];
      for (const file of jsonFiles) {
        try {
          const content = await fs.readFile(path.join(MEMORY_DIR, file), 'utf-8');
          const parsed = JSON.parse(content) as MemoryRecord;
          if (parsed.id && typeof parsed.input === 'string') {
            records.push(parsed);
          }
        } catch {
          continue;
        }
      }

      return records.sort((a, b) => b.timestamp - a.timestamp);
    } catch {
      return [];
    }
  }

  async remember(record: Omit<MemoryRecord, 'id' | 'timestamp'>): Promise<void> {
    await this.ensureInit();
    const release = await this.mutex.acquire();

    try {
      const id = uuidv4();
      const timestamp = Date.now();
      const full: MemoryRecord = { id, timestamp, ...record };

      const filePath = path.join(MEMORY_DIR, `${id}.json`);
      await fs.writeFile(filePath, JSON.stringify(full, null, 2), 'utf-8');

      if (this.searchEngine) {
        this.searchEngine.add({
          id,
          input: full.input,
          output: full.output,
          provider: full.provider,
          model: full.model,
          timestamp: full.timestamp,
          tags: full.tags.join(' '),
        });
      }
    } finally {
      release();
    }
  }

  async recall(query: string, limit?: number): Promise<MemoryRecord[]> {
    await this.ensureInit();

    const maxResults = limit ?? 10;

    if (this.searchEngine && this.searchEngine.documentCount > 0) {
      try {
        const results = this.searchEngine.search(query, {
          prefix: true,
          fuzzy: 0.2,
        });

        const topIds = results.slice(0, maxResults).map((r) => r.id);
        const allRecords = await this.loadAll();
        const matched = allRecords.filter((r) => topIds.includes(r.id));
        return matched.slice(0, maxResults);
      } catch {
      }
    }

    const records = await this.loadAll();
    const lowerQuery = query.toLowerCase();
    const scored = records
      .map((r) => {
        let score = 0;
        if (r.input.toLowerCase().includes(lowerQuery)) score += 3;
        if (r.output.toLowerCase().includes(lowerQuery)) score += 1;
        for (const tag of r.tags) {
          if (tag.toLowerCase().includes(lowerQuery)) score += 2;
        }
        return { record: r, score };
      })
      .filter((e) => e.score > 0)
      .sort((a, b) => b.score - a.score);

    return scored.slice(0, maxResults).map((e) => e.record);
  }

  async loadAll(): Promise<MemoryRecord[]> {
    await this.ensureInit();

    try {
      const files = await fs.readdir(MEMORY_DIR);
      const jsonFiles = files.filter((f) => f.endsWith('.json'));

      const records: MemoryRecord[] = [];
      for (const file of jsonFiles) {
        try {
          const content = await fs.readFile(path.join(MEMORY_DIR, file), 'utf-8');
          const parsed = JSON.parse(content) as MemoryRecord;
          if (parsed.id && typeof parsed.input === 'string') {
            records.push(parsed);
          }
        } catch {
          continue;
        }
      }

      return records.sort((a, b) => b.timestamp - a.timestamp);
    } catch {
      return [];
    }
  }

  async forget(id: string): Promise<boolean> {
    await this.ensureInit();
    const release = await this.mutex.acquire();

    try {
      const filePath = path.join(MEMORY_DIR, `${id}.json`);
      try {
        await fs.unlink(filePath);
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
          return false;
        }
        throw err;
      }

      if (this.searchEngine) {
        try {
          this.searchEngine.remove({ id } as { id: string });
        } catch {
        }
      }
      return true;
    } finally {
      release();
    }
  }

  async consolidate(): Promise<ConsolidationResult> {
    await this.ensureInit();
    const release = await this.mutex.acquire();

    let consolidated = 0;
    let removed = 0;

    try {
      const records = await this.loadAll();
      const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;

      const keep = new Set<string>();
      const toRemove: MemoryRecord[] = [];

      for (const record of records) {
        if (record.timestamp >= cutoff && keep.size < MAX_RECORDS) {
          keep.add(record.id);
        } else {
          toRemove.push(record);
        }
      }

      for (const record of toRemove) {
        try {
          await fs.unlink(path.join(MEMORY_DIR, `${record.id}.json`));
          removed++;
        } catch {
          continue;
        }
      }

      consolidated = records.length;

      if (this.searchEngine) {
        this.searchEngine.removeAll(toRemove.map((r) => r.id));
      }
    } finally {
      release();
    }

    return { consolidated, removed };
  }

  async stats(): Promise<MemoryStats> {
    await this.ensureInit();

    const records = await this.loadAll();
    let totalTokens = 0;

    for (const record of records) {
      totalTokens += Math.ceil(record.input.length / 4);
      totalTokens += Math.ceil(record.output.length / 4);
    }

    const timestamps = records.map((r) => r.timestamp);
    const lastConsolidation = timestamps.length > 0 ? Math.max(...timestamps) : 0;

    return {
      totalRecords: records.length,
      totalTokens,
      lastConsolidation,
    };
  }
}