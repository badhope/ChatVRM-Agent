/**
 * File-backed vector store.
 *
 * Wraps {@link InMemoryVectorStore} and adds JSON persistence to disk
 * so a corpus survives restarts. Intended for dev / small corpora; for
 * production use sqlite-vss / qdrant / pgvector adapters that share
 * the same {@link VectorStore} port.
 *
 * C3 (W18): the on-disk format was upgraded to v2 (base64 Float32) so
 * a persistent corpus round-trips without precision loss and matches
 * the format `InMemoryVectorStore.saveToFile` writes since W17 H4.
 * Old v1 files (raw `vector: number[]`) are auto-migrated on load;
 * new files always include `version: 2` and a `vectorB64` field.
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { InMemoryVectorStore, b64ToFloat32, float32ToB64 } from './vector-store.memory.js';
import type { VectorRecord, VectorQuery, VectorHit, VectorStore } from '../ports/vector-store.port.js';

interface PersistedV1 {
  dim: number;
  records: Array<{
    id: string;
    vector: number[];
    text: string;
    metadata?: Record<string, unknown>;
  }>;
}

interface PersistedV2 {
  version: 2;
  dim: number;
  records: Array<{
    id: string;
    vectorB64: string;
    text: string;
    metadata?: Record<string, unknown>;
  }>;
}

type Persisted = PersistedV1 | PersistedV2;

export class PersistentVectorStore implements VectorStore {
  readonly name = 'persistent-json';
  readonly dim: number;
  private file: string;
  private mem: InMemoryVectorStore;
  private dirty = false;

  constructor(dim: number, file: string) {
    this.dim = dim;
    this.file = file;
    this.mem = new InMemoryVectorStore(dim);
  }

  static async open(dim: number, file: string): Promise<PersistentVectorStore> {
    const s = new PersistentVectorStore(dim, file);
    await s.load();
    return s;
  }

  private async load(): Promise<void> {
    try {
      const raw = await fs.readFile(this.file, 'utf8');
      const parsed = JSON.parse(raw) as Persisted;
      if (parsed.dim !== this.dim) {
        // M7 (W19): refuse to silently proceed with a dim mismatch.
        // The pre-W19 code logged a warning and continued, which
        // meant a server started with a 768-dim OpenAI key after
        // running with a 1536-dim key on the same `path` would
        // produce a vector file with mismatched dimensions and the
        // cosine-similarity results would be garbage (NaN, then
        // silently rejected by Qdrant-style backends). We now
        // throw with a clear remediation message. The operator
        // can either (a) re-ingest against the new dim, (b)
        // back-up and delete the on-disk file, or (c) change the
        // dim back to match.
        throw new Error(
          `vector store dim mismatch: on-disk file at ${this.file} has dim=${parsed.dim} ` +
            `but adapter is configured for dim=${this.dim}. Either re-ingest or delete the ` +
            `existing file at ${this.file}.`,
        );
      }
      // C3 (W18): read either v1 (vector: number[]) or v2
      // (vectorB64: base64). v1 is silently migrated to v2 on the
      // next `persist()` call.
      const records: VectorRecord[] = parsed.records.map((r) => {
        const v2 = r as PersistedV2['records'][number];
        const v1 = r as PersistedV1['records'][number];
        const vector =
          typeof v2.vectorB64 === 'string' && v2.vectorB64.length > 0
            ? b64ToFloat32(v2.vectorB64)
            : Float32Array.from(v1.vector);
        return {
          id: v2.id ?? v1.id,
          text: v2.text ?? v1.text,
          metadata: v2.metadata ?? v1.metadata,
          vector,
        };
      });
      await this.mem.add(records);
      // If we read a v1 file, mark dirty so the next persist() rewrites
      // it as v2.
      if ((parsed as PersistedV1).records.length > 0 && !('version' in parsed && parsed.version === 2)) {
        if (records.length > 0 && records[0]!.vector.length === this.dim) {
          this.dirty = true;
        }
      }
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw err;
      }
    }
  }

  async add(records: VectorRecord[]): Promise<void> {
    await this.mem.add(records);
    this.dirty = true;
  }

  async remove(ids: string[]): Promise<void> {
    await this.mem.remove(ids);
    this.dirty = true;
  }

  async query(q: VectorQuery): Promise<VectorHit[]> {
    return this.mem.query(q);
  }

  async size(): Promise<number> {
    return this.mem.size();
  }

  async persist(): Promise<void> {
    if (!this.dirty) return;
    const internal = this.mem as unknown as {
      records: Map<string, { id: string; vector: Float32Array; text: string; metadata?: Record<string, unknown> }>;
    };
    const out: PersistedV2 = {
      version: 2,
      dim: this.dim,
      records: Array.from(internal.records.values()).map((r) => ({
        id: r.id,
        text: r.text,
        metadata: r.metadata,
        // C3 (W18): write Float32 as base64 little-endian binary so
        // round-trip is bit-exact and the file is ~1/3 the size of a
        // JSON array of numbers.
        vectorB64: float32ToB64(r.vector),
      })),
    };
    await fs.mkdir(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    // M9 (W19): best-effort cleanup of a stale tmp file from a
    // previous crash. A leftover `*.tmp` from an interrupted
    // `fs.rename` (e.g. process killed mid-write) would block
    // future writes because the next `fs.writeFile(tmp, ...)`
    // would happily overwrite it, but the parent `this.file`
    // would be left untouched. We proactively remove it so a
    // crash-recovery boot starts with a clean slate.
    try { await fs.unlink(tmp); } catch { /* ENOENT or permission — both are fine */ }
    await fs.writeFile(tmp, JSON.stringify(out), 'utf8');
    // M8 (W19): the "atomic" rename is only atomic on the same
    // filesystem. On Windows, `fs.rename` will fail with EPERM
    // when the source and destination are on different drives —
    // which is exactly what happens if the data dir is on a
    // network share or a Docker volume mounted with a different
    // backing device. We branch on platform: POSIX keeps the
    // fast `rename` path, Windows falls back to a copy +
    // unlink so a write can never silently leave the store
    // half-updated.
    if (process.platform === 'win32') {
      try {
        await fs.copyFile(tmp, this.file);
      } finally {
        // M9 (W19): always try to remove the tmp file. A failed
        // unlink (e.g. the tmp was already removed by a previous
        // crash) is silently swallowed so the next persist
        // attempt doesn't see a stale leftover.
        try { await fs.unlink(tmp); } catch { /* ignore */ }
      }
    } else {
      try {
        await fs.rename(tmp, this.file);
      } catch (err) {
        // M8 (W19): if rename fails on POSIX (e.g. cross-device
        // link), fall back to copy + unlink so the call still
        // succeeds.
        try {
          await fs.copyFile(tmp, this.file);
          try { await fs.unlink(tmp); } catch { /* ignore */ }
        } catch (fallbackErr) {
          // M9 (W19): clean up tmp on failure too.
          try { await fs.unlink(tmp); } catch { /* ignore */ }
          throw err;
        }
      }
    }
    this.dirty = false;
  }
}
