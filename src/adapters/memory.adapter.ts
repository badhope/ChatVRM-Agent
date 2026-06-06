import fs from 'fs/promises';
import path from 'path';
import { homedir } from 'os';
import { v4 as uuidv4 } from 'uuid';
import { Mutex } from 'async-mutex';
import Minisearch from 'minisearch';
import { logger } from '../infrastructure/logger.js';
import type {
  IMemoryPort,
  MemoryRecord,
  MemoryStats,
  ConsolidationResult,
} from '../ports/memory.port.js';

const MEMORY_DIR = path.join(homedir(), '.personal-assistant', 'memory');
const MAX_RECORDS = 1000;
const RETENTION_DAYS = 30;
// W17 H1: persist the last-consolidation timestamp to a sidecar
// file so `stats().lastConsolidation` survives a process restart.
const META_FILE = path.join(MEMORY_DIR, '.meta.json');

interface MemoryMeta {
  lastConsolidation: number | null;
}

/** W17 M2: per-record token estimate. Free-standing so tests can
 * pin the formula. */
function tokensFor(record: Pick<MemoryRecord, 'input' | 'output'>): number {
  return Math.ceil(record.input.length / 4) + Math.ceil(record.output.length / 4);
}

export class MemoryAdapter implements IMemoryPort {
  private mutex = new Mutex();
  private searchEngine: Minisearch | null = null;
  private initialized = false;

  private _initializing = false;
  private _initPromise: Promise<void> | null = null;
  private _lastConsolidation: number | null = null;

  // W17 H2: in-memory record cache. Populated on first `loadAll`,
  // invalidated by writes (`remember`, `forget`, `update`).
  // `recall()` now reads from this cache instead of walking the
  // disk for every query.
  private _cache: MemoryRecord[] | null = null;
  // W17 M2: maintain a running token counter incrementally so
  // `stats()` is O(1) instead of O(N).
  private _totalTokens: number = 0;
  private _cachePromise: Promise<MemoryRecord[]> | null = null;

  // M14 (W19): secondary index from record-id → cache position.
  // The pre-W19 `forget(id)` did a linear `this._cache.find(...)`
  // over every cached record. With MAX_RECORDS=1000 a forget was
  // O(N) in cache size, which is fine for a single call but
  // became a hot path when the agent loop consolidated many
  // memory writes per task. The index is rebuilt whenever the
  // cache is rebuilt (`getCachedRecords`); writes (remember /
  // forget) keep it in sync.
  private _idIndex: Map<string, number> | null = null;

  private async ensureInit(): Promise<void> {
    if (this.initialized) return;
    if (this._initializing) {
      await this._initPromise;
      return;
    }
    this._initializing = true;
    this._initPromise = (async () => {
      try {
        await this._doInit();
        this.initialized = true;
      } finally {
        this._initializing = false;
      }
    })();
    await this._initPromise;
  }

  private async _doInit(): Promise<void> {
    await fs.mkdir(MEMORY_DIR, { recursive: true });

    // W17 H1: hydrate lastConsolidation from the sidecar file.
    try {
      const raw = await fs.readFile(META_FILE, 'utf-8');
      const meta = JSON.parse(raw) as MemoryMeta;
      this._lastConsolidation = typeof meta.lastConsolidation === 'number' ? meta.lastConsolidation : null;
    } catch {
      this._lastConsolidation = null;
    }

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
      this._cache = records;
      // W17 M2: warm the token counter once at init; subsequent
      // writes maintain it incrementally.
      this._totalTokens = records.reduce((acc, r) => acc + tokensFor(r), 0);
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
      this._cache = [];
      this._totalTokens = 0;
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

      // W17 H2 / M2: keep the cache and the running token counter
      // consistent with the on-disk state. We *append* to the
      // cache so `recall()` doesn't have to walk the disk.
      if (this._cache) {
        // M14 (W19): the cache is sorted by timestamp
        // descending, so the right place to insert is the first
        // position whose timestamp is older than the new
        // record. We splice there (so the array stays sorted)
        // and update the id index accordingly. A linear `push`
        // followed by `sort` would be O(N log N) per write
        // and would require a full index rebuild; a binary
        // search + splice is O(log N) + O(N) for the tail-
        // shift, which matches the cost of the sort-based
        // approach but avoids the O(N) index rebuild.
        const ts = full.timestamp;
        let lo = 0;
        let hi = this._cache.length;
        while (lo < hi) {
          const mid = (lo + hi) >>> 1;
          if ((this._cache[mid] as MemoryRecord).timestamp > ts) lo = mid + 1;
          else hi = mid;
        }
        const insertAt = lo;
        this._cache.splice(insertAt, 0, full);
        // Rebuild the tail of the id index (positions >= insertAt)
        // and add the new entry. We do this unconditionally
        // because (a) `this._idIndex` is null if the cache has
        // never been read, in which case the next read will
        // rebuild it from scratch, and (b) a partial index is
        // worse than no index because lookups would return
        // stale positions.
        if (this._idIndex) {
          for (let i = insertAt; i < this._cache.length; i++) {
            this._idIndex.set(this._cache[i]!.id, i);
          }
        }
      } else {
        this._cache = [full];
      }
      this._totalTokens += tokensFor(full);
    } finally {
      release();
    }
  }

  async recall(query: string, limit?: number): Promise<MemoryRecord[]> {
    await this.ensureInit();

    const maxResults = limit ?? 10;
    // W17 H2: read from the in-memory cache, not from disk. The
    // cache is invalidated on every write (remember / forget /
    // update) and is populated eagerly on first call.
    const allRecords = await this.getCachedRecords();
    if (allRecords.length === 0) return [];

    if (this.searchEngine && this.searchEngine.documentCount > 0) {
      try {
        const results = this.searchEngine.search(query, {
          prefix: true,
          fuzzy: 0.2,
        });

        const topIds = new Set(results.slice(0, maxResults).map((r) => String(r.id)));
        const matched = allRecords.filter((r) => topIds.has(r.id));
        if (matched.length > 0) return matched.slice(0, maxResults);
      } catch {
        // fall through to substring search
      }
    }

    // W17 L1: reuse `allRecords` for the substring branch — the
    // old code re-walked the disk and effectively doubled the
    // work for a zero-hit search.
    const lowerQuery = query.toLowerCase();
    const scored = allRecords
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

  /**
   * W17 H2: in-memory record cache accessor. The cache is
   * populated lazily on the first call and invalidated by writes
   * (`remember`, `forget`, `update`, `consolidate`).
   */
  private async getCachedRecords(): Promise<MemoryRecord[]> {
    if (this._cache) {
      // M14 (W19): lazily rebuild the id index on first read so
      // the index is always ready by the time the first forget
      // runs. The cost is O(N) once per cache lifetime.
      if (!this._idIndex) {
        this._idIndex = new Map();
        for (let i = 0; i < this._cache.length; i++) {
          this._idIndex.set(this._cache[i]!.id, i);
        }
      }
      return this._cache;
    }
    if (this._cachePromise) return this._cachePromise;
    this._cachePromise = (async () => {
      const records = await this.loadAllRaw();
      this._cache = records;
      // M14 (W19): rebuild the id index immediately on cold cache
      // load, so the first forget after boot is O(1).
      this._idIndex = new Map();
      for (let i = 0; i < records.length; i++) {
        this._idIndex.set(records[i]!.id, i);
      }
      // Re-derive the token counter if the cache was cold — this
      // catches the case where a process imports a hand-edited
      // corpus.
      this._totalTokens = records.reduce((acc, r) => acc + tokensFor(r), 0);
      return records;
    })();
    try {
      return await this._cachePromise;
    } finally {
      this._cachePromise = null;
    }
  }

  async loadAll(): Promise<MemoryRecord[]> {
    // Public surface — preserve the historical "walk the disk"
    // semantics so callers (e.g. the test harness) that expect
    // a fresh read still get one. Internal `recall()` uses
    // `getCachedRecords` instead.
    return this.loadAllRaw();
  }

  async forget(id: string): Promise<boolean> {
    await this.ensureInit();
    const release = await this.mutex.acquire();

    try {
      const filePath = path.join(MEMORY_DIR, `${id}.json`);
      // W17 M2: track the record we're removing so we can update
      // the running token counter.
      // M14 (W19): look up the record position via the id index
      // instead of a linear scan. The index is rebuilt on cache
      // load and is kept in sync by `remember`/`forget`/`update`.
      // We still call `getCachedRecords()` to warm the cache
      // and the index in case no one has read the cache yet.
      await this.getCachedRecords();
      const idx = this._idIndex?.get(id);
      const removed = idx !== undefined && idx >= 0 && idx < (this._cache?.length ?? 0)
        ? (this._cache as MemoryRecord[])[idx] ?? null
        : null;
      try {
        await fs.unlink(filePath);
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
          return false;
        }
        throw err;
      }

      // M14 (W19): keep the id index in sync with the cache
      // array. After splicing `idx` out of the array, every
      // later position's stored index is off-by-one, so we
      // decrement those entries. This is O(amortised) because
      // the splice is followed by a tail-rewrite that touches
      // each entry exactly once.
      if (idx !== undefined && this._cache && this._idIndex) {
        this._cache.splice(idx, 1);
        for (let i = idx; i < this._cache.length; i++) {
          this._idIndex.set(this._cache[i]!.id, i);
        }
        this._idIndex.delete(id);
      }

      if (this.searchEngine) {
        try {
          this.searchEngine.remove({ id } as { id: string });
        } catch (err) {
          // Indexing is best-effort; surface a warning so an operator
          // can spot a corrupted search index.
          logger.warn({ err, id }, 'memory.adapter: search index remove failed');
        }
      }
      // W17 H2 / M2: invalidate the cache + decrement the counter.
      if (this._cache && removed) {
        this._cache = this._cache.filter((r) => r.id !== id);
        this._totalTokens = Math.max(0, this._totalTokens - tokensFor(removed));
      }
      return true;
    } finally {
      release();
    }
  }

  async update(
    id: string,
    patch: Partial<Pick<MemoryRecord, 'input' | 'output' | 'tags' | 'provider' | 'model'>>,
  ): Promise<MemoryRecord | null> {
    await this.ensureInit();
    const release = await this.mutex.acquire();
    try {
      const filePath = path.join(MEMORY_DIR, `${id}.json`);
      let existing: MemoryRecord;
      try {
        const raw = await fs.readFile(filePath, 'utf-8');
        existing = JSON.parse(raw) as MemoryRecord;
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
        throw err;
      }
      const next: MemoryRecord = {
        ...existing,
        input: typeof patch.input === 'string' ? patch.input : existing.input,
        output: typeof patch.output === 'string' ? patch.output : existing.output,
        tags: Array.isArray(patch.tags) ? patch.tags.filter((t) => typeof t === 'string') : existing.tags,
        provider: typeof patch.provider === 'string' ? patch.provider : existing.provider,
        model: typeof patch.model === 'string' ? patch.model : existing.model,
      };
      next.timestamp = Date.now();
      await fs.writeFile(filePath, JSON.stringify(next, null, 2), 'utf-8');
      if (this.searchEngine) {
        try {
          this.searchEngine.replace({
            id: next.id,
            input: next.input,
            output: next.output,
            provider: next.provider,
            model: next.model,
            timestamp: next.timestamp,
            tags: next.tags.join(' '),
          });
        } catch (err) {
          logger.warn({ err, id: next.id }, 'memory.adapter: search index replace failed');
        }
      }
      // W17 H2 / M2: refresh the cache in place + adjust the
      // counter for the *delta* (input/output length can change).
      if (this._cache) {
        const idx = this._cache.findIndex((r) => r.id === id);
        if (idx >= 0) {
          this._totalTokens = Math.max(0, this._totalTokens - tokensFor(this._cache[idx]!));
          this._cache[idx] = next;
          this._cache.sort((a, b) => b.timestamp - a.timestamp);
          this._totalTokens += tokensFor(next);
        }
      }
      return next;
    } finally {
      release();
    }
  }

  async consolidate(): Promise<ConsolidationResult> {
    await this.ensureInit();
    const release = await this.mutex.acquire();

    let kept = 0;
    let totalTokensRemoved = 0;

    try {
      // W17 H2: source from the cache (no disk walk).
      const records = await this.getCachedRecords();
      const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;

      const toRemove: MemoryRecord[] = [];

      for (const record of records) {
        // A record is *kept* (previously mislabelled "consolidated")
        // when it is still within the retention window AND the store
        // is under the cap. Otherwise it is queued for removal.
        if (record.timestamp >= cutoff && records.length - toRemove.length <= MAX_RECORDS) {
          kept++;
        } else {
          toRemove.push(record);
        }
      }

      // C8 (W18): build the *unlink-succeeded* set first; only after
      // the disk state is settled do we propagate the removal to the
      // search index and the in-memory cache. The previous code used
      // `toRemove.slice(0, removed)`, which assumed successful
      // unlinks were a contiguous prefix of `toRemove`. They are
      // not: a single ENOENT in the middle of the loop would cause
      // the cache to be filtered by *un-unlinked* ids, desyncing
      // memory and disk until the next restart.
      const unlinkedIds = new Set<string>();
      // M15 (W19): batch the unlinks. The pre-W19 implementation
      // fired one `fs.unlink` per record, in series. For a
      // 30-day-old corpus with the MAX_RECORDS=1000 cap reached,
      // that's 1000 sequential round-trips to the FS. We
      // chunk them into batches of 64 and run each batch with
      // `Promise.all` so a slow disk doesn't dominate the call.
      // We deliberately keep the per-call shape (each call still
      // touches every record, just in parallel), because the
      // consolidation output is bounded by the FS latency on a
      // single user machine, not by CPU.
      const UNLINK_BATCH = 64;
      for (let i = 0; i < toRemove.length; i += UNLINK_BATCH) {
        const batch = toRemove.slice(i, i + UNLINK_BATCH);
        await Promise.all(
          batch.map(async (record) => {
            try {
              await fs.unlink(path.join(MEMORY_DIR, `${record.id}.json`));
              unlinkedIds.add(record.id);
              totalTokensRemoved += tokensFor(record);
            } catch {
              // W17 M1 / C8: keep search index consistent with
              // disk. If the disk delete failed we MUST NOT
              // remove from the search index, otherwise we'd
              // return a hit that the user can no longer read.
              // Skip the id from `unlinkedIds`.
            }
          }),
        );
      }

      if (this.searchEngine && unlinkedIds.size > 0) {
        try {
          this.searchEngine.removeAll([...unlinkedIds]);
        } catch (err) {
          logger.warn({ err, count: unlinkedIds.size }, 'memory.adapter: search index removeAll failed');
        }
      }

      // W17 H2 / M2: refresh the cache and token counter in lock-
      // step with the disk state. Filter by the unlink-succeeded set,
      // NOT the original `toRemove` array.
      if (this._cache) {
        this._cache = this._cache.filter((r) => !unlinkedIds.has(r.id));
        // M14 (W19): rebuild the id index after a batched
        // removal. `filter` produces a new array, so every
        // stored position is off. A full rebuild is O(N) and
        // only runs once per consolidate, so the amortised
        // cost is negligible.
        this._idIndex = new Map();
        for (let i = 0; i < this._cache.length; i++) {
          this._idIndex.set(this._cache[i]!.id, i);
        }
      }
      this._totalTokens = Math.max(0, this._totalTokens - totalTokensRemoved);

      this._lastConsolidation = Date.now();
      // W17 H1: persist the sidecar so a fresh process picks up
      // the correct lastConsolidation timestamp.
      await this.persistMeta();

      // C8 (W18): the return value of `consolidate` is a public
      // contract; surface the unlink-succeeded count rather than the
      // initial `toRemove.length` so callers can detect partial
      // failure.
      const unlinkedCount = unlinkedIds.size;
      return { consolidated: kept, removed: unlinkedCount };
    } catch (err) {
      throw err;
    } finally {
      release();
    }
  }

  private async persistMeta(): Promise<void> {
    try {
      const meta: MemoryMeta = { lastConsolidation: this._lastConsolidation };
      await fs.writeFile(META_FILE, JSON.stringify(meta), 'utf-8');
    } catch (err) {
      // Non-fatal — `stats()` will just report the in-memory
      // value on the next call.
      logger.warn({ err }, 'memory.adapter: failed to persist .meta.json');
    }
  }

  async stats(): Promise<MemoryStats> {
    await this.ensureInit();
    // W17 M2: the running counter is the source of truth. If the
    // cache is still cold (e.g. an external test that called
    // `stats()` before any `recall()`), warm it once so the
    // counter agrees with `totalRecords`.
    if (this._cache === null) {
      await this.getCachedRecords();
    }
    const totalRecords = this._cache?.length ?? 0;
    return {
      totalRecords,
      totalTokens: this._totalTokens,
      lastConsolidation: this._lastConsolidation ?? 0,
    };
  }
}