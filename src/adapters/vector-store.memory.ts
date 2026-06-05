/**
 * In-memory vector store with cosine-similarity k-NN search.
 *
 * This is the default {@link VectorStore} used in tests and small corpora.
 * For larger corpora (>~50k vectors) plug in sqlite-vss / qdrant / pgvector
 * by implementing the same interface.
 */

import type { VectorStore, VectorRecord, VectorQuery, VectorHit } from '../ports/vector-store.port.js';

interface StoredRecord {
  id: string;
  vector: Float32Array;
  text: string;
  metadata?: Record<string, unknown>;
  norm: number;
}

export class InMemoryVectorStore implements VectorStore {
  readonly name = 'in-memory';
  readonly dim: number;
  private records = new Map<string, StoredRecord>();

  constructor(dim: number) {
    this.dim = dim;
  }

  async add(records: VectorRecord[]): Promise<void> {
    for (const r of records) {
      if (r.vector.length !== this.dim) {
        throw new Error(
          `vector dim ${r.vector.length} != store dim ${this.dim} (id=${r.id})`,
        );
      }
      this.records.set(r.id, {
        id: r.id,
        vector: r.vector,
        text: r.text,
        metadata: r.metadata,
        norm: l2norm(r.vector),
      });
    }
  }

  async remove(ids: string[]): Promise<void> {
    for (const id of ids) {
      this.records.delete(id);
    }
  }

  async query(q: VectorQuery): Promise<VectorHit[]> {
    // W17 M3: a hand-crafted query vector (e.g. an embedding from
    // a different provider, or a unit test) is not necessarily
    // L2-normalised. The cosine-similarity math still produces a
    // value, but the relative ranking becomes non-deterministic
    // and counter-intuitive. Normalise here so callers don't
    // have to remember the embedder's contract.
    let qVector = q.vector;
    let qNorm = l2norm(qVector);
    if (qNorm > 0) {
      // Re-normalise to unit length in place.
      const out = new Float32Array(qVector.length);
      for (let i = 0; i < qVector.length; i++) out[i] = qVector[i]! / qNorm;
      qVector = out;
      qNorm = 1;
    } else {
      // Zero vector — no hits possible.
      return [];
    }
    const scored: VectorHit[] = [];
    for (const rec of this.records.values()) {
      if (q.filter && !q.filter(rec.metadata)) {
        continue;
      }
      const score = cosine(qVector, qNorm, rec.vector, rec.norm);
      scored.push({ id: rec.id, text: rec.text, metadata: rec.metadata, score });
    }
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, q.topK);
  }

  async size(): Promise<number> {
    return this.records.size;
  }

  /**
   * Return every record in the store. Used by the admin/RAG
   * routes to surface the corpus. By default vectors are NOT
   * included to keep the response small; pass `{ includeVector: true }`
   * to get the raw Float32Array (used by the backup / restore path).
   */
  async all(opts: { includeVector?: boolean } = {}): Promise<Array<{ id: string; text: string; metadata?: Record<string, unknown>; vector?: Float32Array }>> {
    return Array.from(this.records.values()).map((r) => {
      const out: { id: string; text: string; metadata?: Record<string, unknown>; vector?: Float32Array } = {
        id: r.id,
        text: r.text,
        metadata: r.metadata,
      };
      if (opts.includeVector) {
        // Hand back a *copy* so the caller cannot mutate our
        // internal state by writing into the returned array.
        out.vector = new Float32Array(r.vector);
      }
      return out;
    });
  }

  clear(): void {
    this.records.clear();
  }

  /**
   * Persist the store to a file. W17 H4: the previous
   * implementation round-tripped Float32 vectors through
   * `Array.from(r.vector)` (which widens to JS Number) and
   * `new Float32Array(number[])` (which rounds back to Float32),
   * losing low-magnitude components. We now serialise the
   * vector body as a base64-encoded little-endian Float32 binary
   * blob, which is exact. A small JSON header carries the dim
   * and the per-record metadata.
   */
  async saveToFile(filePath: string): Promise<void> {
    const fs = await import('node:fs/promises');
    const pathMod = await import('node:path');
    const dir = pathMod.dirname(filePath);
    if (dir && dir !== '.' && dir !== filePath) await fs.mkdir(dir, { recursive: true });

    const records: Array<{ id: string; vectorB64: string; text: string; metadata?: Record<string, unknown> }> = [];
    for (const r of this.records.values()) {
      // Float32 → little-endian bytes → base64. Round-trip is
      // bit-exact; the previous JSON-of-numbers path could lose
      // the bottom bits of low-magnitude components.
      records.push({
        id: r.id,
        vectorB64: float32ToB64(r.vector),
        text: r.text,
        metadata: r.metadata,
      });
    }
    await fs.writeFile(
      filePath,
      JSON.stringify({ dim: this.dim, version: 2, records }, null, 2),
      'utf8',
    );
  }

  /**
   * Re-load a previously-saved store. Supports both the new v2
   * binary format and the v1 JSON-of-numbers format (auto-detected
   * by the presence of `version`).
   */
  static async loadFromFile(path: string): Promise<InMemoryVectorStore> {
    const fs = await import('node:fs/promises');
    const raw = await fs.readFile(path, 'utf8');
    const parsed = JSON.parse(raw) as {
      dim: number;
      version?: number;
      records: Array<{ id: string; vector?: number[]; vectorB64?: string; text: string; metadata?: Record<string, unknown> }>;
    };
    const store = new InMemoryVectorStore(parsed.dim);
    await store.add(
      parsed.records.map((r) => {
        const vector = typeof r.vectorB64 === 'string' ? b64ToFloat32(r.vectorB64) : new Float32Array(r.vector ?? []);
        return { id: r.id, vector, text: r.text, metadata: r.metadata };
      }),
    );
    return store;
  }
}

export function float32ToB64(v: Float32Array): string {
  // Use the underlying ArrayBuffer view so we get raw little-endian
  // bytes (Node guarantees LE on x86 + arm64).
  return Buffer.from(v.buffer, v.byteOffset, v.byteLength).toString('base64');
}

export function b64ToFloat32(b64: string): Float32Array {
  const buf = Buffer.from(b64, 'base64');
  // Copy through a fresh ArrayBuffer so the Float32Array doesn't
  // share memory with the (resized-once) Buffer pool.
  const ab = new ArrayBuffer(buf.byteLength);
  new Uint8Array(ab).set(buf);
  return new Float32Array(ab);
}

function l2norm(v: Float32Array): number {
  let s = 0;
  for (let i = 0; i < v.length; i++) s += v[i] * v[i];
  return Math.sqrt(s);
}

function cosine(a: Float32Array, aNorm: number, b: Float32Array, bNorm: number): number {
  if (aNorm === 0 || bNorm === 0) return 0;
  // W17 M5: a length mismatch used to be silently truncated via
  // `Math.min(a.length, b.length)`. That produced bogus scores for
  // vectors that *almost* matched. Treat a dim mismatch as a hard zero
  // (i.e. "no overlap" — the highest conservative score).
  if (a.length !== b.length) {
    return 0;
  }
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot / (aNorm * bNorm);
}
