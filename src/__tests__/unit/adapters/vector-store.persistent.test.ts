import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { PersistentVectorStore } from '../../../adapters/vector-store.persistent.js';
import { HashingEmbedder } from '../../../adapters/embedder.hashing.js';

describe('PersistentVectorStore', () => {
  const dim = 32;
  let tmpDir: string;
  let file: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pa-vstore-'));
    file = path.join(tmpDir, 'store.json');
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('persists and reloads', async () => {
    const emb = new HashingEmbedder({ dim });
    const s1 = await PersistentVectorStore.open(dim, file);
    const v = await emb.embed('persistent test');
    await s1.add([{ id: 'x', text: 'persistent test', vector: v }]);
    await s1.persist();
    expect(await s1.size()).toBe(1);

    const s2 = await PersistentVectorStore.open(dim, file);
    expect(await s2.size()).toBe(1);
    const qv = await emb.embed('persistent test');
    const hits = await s2.query({ vector: qv, topK: 1 });
    expect(hits[0].id).toBe('x');
  });

  it('handles missing file gracefully', async () => {
    const s = await PersistentVectorStore.open(dim, file);
    expect(await s.size()).toBe(0);
  });

  it('removes vectors and reflects on reload', async () => {
    const emb = new HashingEmbedder({ dim });
    const s1 = await PersistentVectorStore.open(dim, file);
    const v = await emb.embed('foo');
    await s1.add([{ id: 'a', text: 'foo', vector: v }]);
    await s1.persist();
    await s1.remove(['a']);
    await s1.persist();

    const s2 = await PersistentVectorStore.open(dim, file);
    expect(await s2.size()).toBe(0);
  });
});
