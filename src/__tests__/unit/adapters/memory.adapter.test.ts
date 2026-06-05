import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import path from 'path';
import fs from 'fs/promises';

const { tempBase, memoryDir, MockMiniSearch } = vi.hoisted(() => {
  const ts = Date.now();
  const rnd = Math.random().toString(36).slice(2);
  const base = `/tmp/memory-test-${ts}-${rnd}`;

  class MockSearch {
    private _documents: Map<string | number, Record<string, unknown>> = new Map();

    add(doc: Record<string, unknown>) {
      const id = doc.id ?? doc['id'];
      this._documents.set(String(id), doc);
    }

    addAll(docs: Record<string, unknown>[]) {
      for (const d of docs) {
        this.add(d);
      }
    }

    remove(docOrId: string | Record<string, unknown>) {
      const id = typeof docOrId === 'string' ? docOrId : (docOrId.id ?? docOrId['id']);
      this._documents.delete(String(id));
    }

    removeAll(docsOrIds: (string | Record<string, unknown>)[]) {
      for (const d of docsOrIds) {
        this.remove(d);
      }
    }

    search(query: string) {
      const results: { id: string }[] = [];
      for (const [id, doc] of this._documents) {
        const input = String(doc.input ?? '');
        const output = String(doc.output ?? '');
        const tags = String(doc.tags ?? '');
        if (input.includes(query) || output.includes(query) || tags.includes(query)) {
          results.push({ id: String(id) });
        }
      }
      return results;
    }

    get documentCount() {
      return this._documents.size;
    }
  }

  return {
    tempBase: base,
    memoryDir: `${base}/.personal-assistant/memory`,
    MockMiniSearch: MockSearch,
  };
});

vi.mock('os', async () => {
  const actual = await vi.importActual<typeof import('os')>('os');
  return {
    ...actual,
    homedir: () => tempBase,
  };
});

vi.mock('minisearch', () => ({
  default: MockMiniSearch,
}));

import { MemoryAdapter } from '../../../adapters/memory.adapter.js';
import type { MemoryRecord } from '../../../ports/memory.port.js';

describe('MemoryAdapter', () => {
  let adapter: MemoryAdapter;

  beforeEach(async () => {
    await fs.mkdir(memoryDir, { recursive: true });
    adapter = new MemoryAdapter();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await fs.rm(tempBase, { recursive: true, force: true });
  });

  async function initAdapter(): Promise<void> {
    const spy = vi.spyOn(adapter, 'loadAll').mockResolvedValueOnce([]);
    try {
      await adapter.remember({
        input: '_init_',
        output: '_init_',
        provider: 'test',
        model: 'test',
        tags: [],
      });
    } catch {
    }
    spy.mockRestore();
  }

  describe('remember', () => {
    it('should store a record', async () => {
      await initAdapter();

      await adapter.remember({
        input: 'hello',
        output: 'world',
        provider: 'openai',
        model: 'gpt-4o',
        tags: ['greeting'],
      });

      const records = await adapter.loadAll();
      const filtered = records.filter((r) => r.input !== '_init_');
      expect(filtered.length).toBe(1);
      expect(filtered[0].input).toBe('hello');
      expect(filtered[0].output).toBe('world');
    });

    it('should auto-generate id and timestamp', async () => {
      await initAdapter();

      const before = Date.now();

      await adapter.remember({
        input: 'test',
        output: 'response',
        provider: 'openai',
        model: 'gpt-4o',
        tags: [],
      });

      const records = await adapter.loadAll();
      const filtered = records.filter((r) => r.input !== '_init_');
      expect(filtered[0].id).toBeDefined();
      expect(typeof filtered[0].id).toBe('string');
      expect(filtered[0].id.length).toBeGreaterThan(0);
      expect(filtered[0].timestamp).toBeGreaterThanOrEqual(before);
    });
  });

  describe('loadAll', () => {
    it('should return all stored records', async () => {
      await initAdapter();

      await adapter.remember({ input: 'first', output: 'a', provider: 'openai', model: 'm1', tags: [] });
      await adapter.remember({ input: 'second', output: 'b', provider: 'openai', model: 'm1', tags: [] });

      const records = await adapter.loadAll();
      const filtered = records.filter((r) => r.input !== '_init_');
      expect(filtered.length).toBe(2);
    });

    it('should sort by timestamp descending', async () => {
      await initAdapter();

      await adapter.remember({ input: 'older', output: 'a', provider: 'openai', model: 'm1', tags: [] });
      await new Promise((r) => setTimeout(r, 10));
      await adapter.remember({ input: 'newer', output: 'b', provider: 'openai', model: 'm1', tags: [] });

      const records = await adapter.loadAll();
      const filtered = records.filter((r) => r.input !== '_init_');
      expect(filtered.length).toBeGreaterThanOrEqual(2);
      expect(filtered[0].timestamp).toBeGreaterThanOrEqual(filtered[filtered.length - 1].timestamp);
    });
  });

  describe('recall', () => {
    it('should find records by query', async () => {
      await initAdapter();

      await adapter.remember({ input: 'deploy to production', output: 'done', provider: 'openai', model: 'm1', tags: ['ops'] });
      await adapter.remember({ input: 'write tests', output: 'ok', provider: 'openai', model: 'm1', tags: ['dev'] });

      const results = await adapter.recall('production');
      const filtered = results.filter((r) => r.input !== '_init_');
      expect(filtered.length).toBeGreaterThan(0);
      expect(filtered[0].input).toContain('production');
    });

    it('should respect limit parameter', async () => {
      await initAdapter();

      for (let i = 0; i < 5; i++) {
        await adapter.remember({ input: `searchable ${i}`, output: 'ok', provider: 'openai', model: 'm1', tags: [] });
      }

      const results = await adapter.recall('searchable', 2);
      const filtered = results.filter((r) => r.input !== '_init_');
      expect(filtered.length).toBeLessThanOrEqual(2);
    });

    it('should return empty for no match', async () => {
      await initAdapter();

      await adapter.remember({ input: 'hello', output: 'world', provider: 'openai', model: 'm1', tags: [] });

      const results = await adapter.recall('xyznonexistent123');
      const filtered = results.filter((r) => r.input !== '_init_');
      expect(filtered).toEqual([]);
    });
  });

  describe('stats', () => {
    it('should return correct counts', async () => {
      await initAdapter();

      await adapter.remember({ input: 'first', output: 'reply', provider: 'openai', model: 'm1', tags: [] });
      await adapter.remember({ input: 'second', output: 'another reply', provider: 'anthropic', model: 'm2', tags: [] });

      const stats = await adapter.stats();
      expect(stats.totalRecords).toBeGreaterThanOrEqual(2);
      expect(stats.totalTokens).toBeGreaterThan(0);
      expect(typeof stats.lastConsolidation).toBe('number');
    });

    it('should report lastConsolidation as 0 before any consolidation', async () => {
      await initAdapter();
      const stats = await adapter.stats();
      expect(stats.lastConsolidation).toBe(0);
    });
  });

  describe('consolidate lastConsolidation tracking', () => {
    it('should update lastConsolidation after running consolidate', async () => {
      const recent: MemoryRecord = {
        id: 'recent-x',
        input: 'recent',
        output: 'recent',
        provider: 'openai',
        model: 'm1',
        timestamp: Date.now(),
        tags: [],
      };
      const recentPath = path.join(memoryDir, 'recent-x.json');
      await fs.writeFile(recentPath, JSON.stringify(recent, null, 2), 'utf-8');

      const freshAdapter = new MemoryAdapter();
      const loadAllSpy = vi.spyOn(freshAdapter, 'loadAll').mockResolvedValueOnce([recent]);
      await freshAdapter.consolidate();
      loadAllSpy.mockRestore();

      const stats = await freshAdapter.stats();
      expect(stats.lastConsolidation).toBeGreaterThan(0);
    });
  });

  describe('recall performance (regression)', () => {
    it('should not call loadAll multiple times per recall', async () => {
      await initAdapter();
      await adapter.remember({ input: 'a', output: 'b', provider: 'openai', model: 'm', tags: [] });
      await adapter.remember({ input: 'c', output: 'd', provider: 'openai', model: 'm', tags: [] });

      const loadAllSpy = vi.spyOn(adapter, 'loadAll');
      await adapter.recall('a');
      await adapter.recall('xyz_no_match');
      const calls = loadAllSpy.mock.calls.length;
      loadAllSpy.mockRestore();

      expect(calls).toBeLessThanOrEqual(2);
    });
  });

  describe('consolidate', () => {
    it('should remove old records', async () => {
      const veryOld: MemoryRecord = {
        id: 'old-id',
        input: 'old',
        output: 'old',
        provider: 'openai',
        model: 'm1',
        timestamp: Date.now() - 60 * 24 * 60 * 60 * 1000,
        tags: [],
      };
      const oldFilePath = path.join(memoryDir, 'old-id.json');
      await fs.writeFile(oldFilePath, JSON.stringify(veryOld, null, 2), 'utf-8');

      const fresh: MemoryRecord = {
        id: 'fresh-id',
        input: 'fresh',
        output: 'fresh',
        provider: 'openai',
        model: 'm1',
        timestamp: Date.now(),
        tags: [],
      };
      const freshFilePath = path.join(memoryDir, 'fresh-id.json');
      await fs.writeFile(freshFilePath, JSON.stringify(fresh, null, 2), 'utf-8');

      const freshAdapter = new MemoryAdapter();
      const loadAllSpy = vi.spyOn(freshAdapter, 'loadAll').mockResolvedValueOnce([veryOld, fresh]);

      const result = await freshAdapter.consolidate();

      loadAllSpy.mockRestore();
      expect(result.removed).toBeGreaterThan(0);
    });

    it('should keep recent records', async () => {
      const recent: MemoryRecord = {
        id: 'recent-id',
        input: 'recent',
        output: 'recent',
        provider: 'openai',
        model: 'm1',
        timestamp: Date.now(),
        tags: [],
      };
      const recentPath = path.join(memoryDir, 'recent-id.json');
      await fs.writeFile(recentPath, JSON.stringify(recent, null, 2), 'utf-8');

      const freshAdapter = new MemoryAdapter();
      const loadAllSpy = vi.spyOn(freshAdapter, 'loadAll').mockResolvedValueOnce([recent]);

      await freshAdapter.consolidate();

      loadAllSpy.mockRestore();

      const files = await fs.readdir(memoryDir);
      expect(files).toContain('recent-id.json');
    });
  });

  describe('thread safety', () => {
    it('should be thread-safe with sequential calls', async () => {
      await initAdapter();

      const promises = [];
      for (let i = 0; i < 10; i++) {
        promises.push(
          adapter.remember({
            input: `msg-${i}`,
            output: `resp-${i}`,
            provider: 'openai',
            model: 'gpt-4o',
            tags: ['batch'],
          }),
        );
      }

      await Promise.all(promises);

      const records = await adapter.loadAll();
      const filtered = records.filter((r) => r.input !== '_init_');
      expect(filtered.length).toBe(10);
    });

    it('H17: real concurrency — interleaved remember/recall yields consistent cache+disk+stats', async () => {
      await initAdapter();

      // Mix of operations to maximise the chance of a real race hitting
      // the cache map, the running token counter, and the search index
      // at the same time. We seed 50 records, then hammer the adapter
      // from many concurrent paths: 50 new remembers, 50 recalls of
      // those new records. After settling, the disk, the cache and
      // stats() must agree.
      for (let i = 0; i < 50; i += 1) {
        await adapter.remember({
          input: `seed-input-${i}`,
          output: `seed-output-${i}`,
          provider: 'openai',
          model: 'gpt-4o',
          tags: ['seed'],
        });
      }

      // Force the cache to be hot so subsequent ops take the fast path.
      const warm = await adapter.recall('seed', 200);
      expect(warm.length).toBeGreaterThan(0);

      const ops: Array<Promise<unknown>> = [];
      for (let i = 0; i < 50; i += 1) {
        ops.push(adapter.remember({
          input: `inter-input-${i}`,
          output: `inter-output-${i}`,
          provider: 'openai',
          model: 'gpt-4o',
          tags: ['inter'],
        }));
      }
      for (let i = 0; i < 50; i += 1) {
        ops.push(adapter.recall(`inter-input-${i % 50}`, 5));
      }
      await Promise.all(ops);

      // Allow async writes to drain.
      await new Promise((r) => setTimeout(r, 50));

      const onDisk = await adapter.loadAll();
      // 50 seeded + 1 _init_ + 50 inter = 101
      const realRecords = onDisk.filter((r) => r.input !== '_init_');
      expect(realRecords.length).toBe(100);
      const diskInputs = new Set(realRecords.map((r) => r.input));
      for (let i = 0; i < 50; i += 1) {
        expect(diskInputs.has(`inter-input-${i}`)).toBe(true);
      }

      // Cache must agree with disk after settling.
      const cached = await adapter.recall('inter', 100);
      const cachedInputs = new Set(cached.map((r) => r.input));
      for (let i = 0; i < 50; i += 1) {
        expect(cachedInputs.has(`inter-input-${i}`)).toBe(true);
      }

      // stats.totalRecords must match on-disk count.
      const stats = await adapter.stats();
      expect(stats.totalRecords).toBe(onDisk.length);
    });
  });
});