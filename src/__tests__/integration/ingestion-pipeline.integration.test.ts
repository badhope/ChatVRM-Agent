/**
 * Document ingestion pipeline tests.
 *
 * End-to-end: chunker → embedder → vector store, plus
 * the path-based entry point that uses AutoLoader.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFile, rm, mkdir } from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { IngestionPipeline, type IngestionProgress } from '../../integration/ingestion-pipeline.js';
import { HashingEmbedder } from '../../adapters/embedder.hashing.js';
import { InMemoryVectorStore } from '../../adapters/vector-store.memory.js';
import { RecursiveTextChunker } from '../../adapters/text-chunker.js';
import { TextLoader } from '../../loaders/text.loader.js';
import type { Document, Loader } from '../../ports/loader.port.js';
import type { VectorStore } from '../../ports/vector-store.port.js';
import type { Embedder } from '../../ports/embeddings.port.js';

// C1 (W19): the temp dir is now under the workspace root so the
// sandbox check accepts it. The pre-W19 test used `/tmp/...`
// which `sandboxPath` refused because it was outside the
// workspace. We use a sibling of the project root (resolved
// absolutely) and register it as a `PA_WORKSPACE_ROOTS` entry
// via the env, so the sandbox's `allowAbsolute` path is happy.
const WORKSPACE_ROOT = path.resolve(process.cwd(), '.ingest-test-tmp');
async function mkTempDir(): Promise<string> {
  const d = path.join(WORKSPACE_ROOT, `case-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`);
  await mkdir(d, { recursive: true });
  return d;
}

// C1 (W19): register the temp dir as an allowed root for the
// lifetime of the test process. The sandbox reads this at call
// time, so the env override is enough — no module-mock needed.
if (!process.env['PA_WORKSPACE_ROOTS']) {
  process.env['PA_WORKSPACE_ROOTS'] = WORKSPACE_ROOT;
} else if (!process.env['PA_WORKSPACE_ROOTS'].split(':').includes(WORKSPACE_ROOT)) {
  process.env['PA_WORKSPACE_ROOTS'] = `${process.env['PA_WORKSPACE_ROOTS']}:${WORKSPACE_ROOT}`;
}

describe('IngestionPipeline', () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkTempDir();
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('ingestDocuments: chunks, embeds, and stores', async () => {
    const embedder = new HashingEmbedder({ dim: 64 });
    const store = new InMemoryVectorStore(64);
    const chunker = new RecursiveTextChunker({ chunkSize: 100, chunkOverlap: 20 });
    const pipeline = new IngestionPipeline({ embedder, vectorStore: store, chunker });

    const docs: Document[] = [
      { text: 'a'.repeat(150) + ' ' + 'b'.repeat(150), source: 'doc1' },
      { text: 'short text', source: 'doc2' },
    ];
    const r = await pipeline.ingestDocuments(docs);
    expect(r.chunks).toBeGreaterThan(2);
    expect(r.vectors).toBe(r.chunks);
    expect(r.errors).toEqual([]);
    expect(await store.size()).toBe(r.vectors);
  });

  it('ingestPath: dispatches by extension to custom loader', async () => {
    const file = path.join(dir, 'doc.memo');
    await writeFile(file, 'irrelevant');
    const embedder = new HashingEmbedder({ dim: 64 });
    const store = new InMemoryVectorStore(64);
    const loader: Loader = {
      extensions: ['.memo'],
      async load() { return [{ text: 'in-memory load', source: 'memo' }]; },
    };
    const pipeline = new IngestionPipeline({ embedder, vectorStore: store, loader });
    // C1 (W19): opt into the wider allowlist (multi-workspace mode)
    // so the test's /tmp path passes the sandbox check. Tests that
    // want to assert sandbox enforcement use `sandboxPath` directly.
    const r = await pipeline.ingestPath(file, undefined, { allowAbsolute: true });
    expect(r.documents).toBe(1);
    expect(r.chunks).toBe(1);
  });

  it('ingestPath: dispatches by extension to TextLoader', async () => {
    const file = path.join(dir, 'doc.txt');
    await writeFile(file, 'the quick brown fox jumps over the lazy dog ' .repeat(20));
    const embedder = new HashingEmbedder({ dim: 64 });
    const store = new InMemoryVectorStore(64);
    const chunker = new RecursiveTextChunker({ chunkSize: 50, chunkOverlap: 10 });
    const pipeline = new IngestionPipeline({ embedder, vectorStore: store, chunker });
    const r = await pipeline.ingestPath(file, undefined, { allowAbsolute: true });
    expect(r.documents).toBe(1);
    expect(r.chunks).toBeGreaterThan(0);
    expect(r.errors).toEqual([]);
  });

  it('ingestPath: emits progress events', async () => {
    const file = path.join(dir, 'doc.txt');
    await writeFile(file, 'content');
    const embedder = new HashingEmbedder({ dim: 64 });
    const store = new InMemoryVectorStore(64);
    const pipeline = new IngestionPipeline({ embedder, vectorStore: store });
    const seen: IngestionProgress[] = [];
    await pipeline.ingestPath(file, (p) => seen.push({ ...p }), { allowAbsolute: true });
    const stages = seen.map((s) => s.stage);
    expect(stages).toContain('load');
    expect(stages).toContain('chunk');
    expect(stages).toContain('embed');
    expect(stages).toContain('store');
    expect(stages[stages.length - 1]).toBe('done');
  });

  it('ingestPath: handles loader failure gracefully', async () => {
    const file = path.join(dir, 'doc.txt');
    await writeFile(file, 'whatever');
    const embedder = new HashingEmbedder({ dim: 64 });
    const store = new InMemoryVectorStore(64);
    // Force a load failure by passing a loader that throws.
    const broken: Loader = {
      extensions: ['.txt'],
      async load() { throw new Error('nope'); },
    };
    const pipeline = new IngestionPipeline({ embedder, vectorStore: store, loader: broken });
    const r = await pipeline.ingestPath(file, undefined, { allowAbsolute: true });
    expect(r.documents).toBe(0);
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0]?.error).toBe('nope');
  });

  it('sourceTag attaches to every chunk', async () => {
    const embedder = new HashingEmbedder({ dim: 64 });
    const store = new InMemoryVectorStore(64);
    const pipeline = new IngestionPipeline({ embedder, vectorStore: store, sourceTag: 'corpus-v1' });
    await pipeline.ingestDocuments([{ text: 'one chunk', source: 'a.txt' }]);
    const r = await store.query({ vector: await embedder.embed('one chunk'), topK: 1 });
    expect(r[0]?.metadata?.['sourceTag']).toBe('corpus-v1');
  });

  it('uses default AutoLoader when no loader is provided (TextLoader fallback)', () => {
    const embedder = new HashingEmbedder({ dim: 64 });
    const store = new InMemoryVectorStore(64);
    const pipeline = new IngestionPipeline({ embedder, vectorStore: store });
    // The pipeline must have a non-null loader.
    expect((pipeline as unknown as { loader: Loader }).loader).toBeDefined();
  });

  it('preserves metadata fields from input documents', async () => {
    const embedder = new HashingEmbedder({ dim: 64 });
    const store = new InMemoryVectorStore(64);
    const pipeline = new IngestionPipeline({ embedder, vectorStore: store });
    await pipeline.ingestDocuments([
      { text: 'hello', source: 'a', metadata: { author: 'alice', lang: 'en' } },
    ]);
    const r = await store.query({ vector: await embedder.embed('hello'), topK: 1 });
    expect(r[0]?.metadata?.['author']).toBe('alice');
    expect(r[0]?.metadata?.['lang']).toBe('en');
  });
});

