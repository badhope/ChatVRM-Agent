/**
 * File-backed vector store.
 *
 * Wraps {@link InMemoryVectorStore} and adds JSON persistence to disk
 * so a corpus survives restarts. Intended for dev / small corpora; for
 * production use sqlite-vss / qdrant / pgvector adapters that share
 * the same {@link VectorStore} port.
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { InMemoryVectorStore } from './vector-store.memory.js';
import type { VectorRecord, VectorQuery, VectorHit } from '../ports/vector-store.port.js';

interface Persisted {
  dim: number;
  records: Array<{
    id: string;
    vector: number[];
    text: string;
    metadata?: Record<string, unknown>;
  }>;
}

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
        throw new Error(`dim mismatch: file=${parsed.dim} store=${this.dim}`);
      }
      const records: VectorRecord[] = parsed.records.map((r) => ({
        id: r.id,
        text: r.text,
        metadata: r.metadata,
        vector: Float32Array.from(r.vector),
      }));
      await this.mem.add(records);
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
    const out: Persisted = {
      dim: this.dim,
      records: Array.from(internal.records.values()).map((r) => ({
        id: r.id,
        text: r.text,
        metadata: r.metadata,
        vector: Array.from(r.vector),
      })),
    };
    await fs.mkdir(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(out), 'utf8');
    await fs.rename(tmp, this.file);
    this.dirty = false;
  }
}
