/**
 * RAG routes — search, ingest, list, and clear the in-memory
 * knowledge base backing the running server.
 *
 *   GET  /api/rag/status      → { documents, dim, hydrated }
 *   GET  /api/rag/documents   → [{ id, text, metadata }, ...]
 *   POST /api/rag/search      → { hits: [{ id, score, text, metadata, sources }] }
 *   POST /api/rag/upsert      → { id, text, metadata? }   (single-record insert)
 *   POST /api/rag/ingest      → { documents, chunks, vectors, errors, path } (file/dir → pipeline)
 *   POST /api/rag/persist     → { saved, path }         (write to disk)
 *   DELETE /api/rag/documents → { removed }             (clear)
 */

import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { IngestionPipeline } from '../../src/integration/ingestion-pipeline.js';
import { RecursiveTextChunker } from '../../src/adapters/text-chunker.js';
import { getRuntime } from '../runtime.js';
import { stat } from 'node:fs/promises';
import type { IngestionResult } from '../../src/integration/ingestion-pipeline.js';

const SearchSchema = z.object({
  query: z.string().min(1).max(2000),
  topK: z.number().int().positive().max(50).optional().default(5),
  source: z.enum(['vector', 'keyword', 'hybrid']).optional().default('hybrid'),
  vectorWeight: z.number().min(0).max(1).optional().default(0.6),
  rerank: z.boolean().optional().default(false),
});

const UpsertSchema = z.object({
  id: z.string().min(1).optional(),
  text: z.string().min(1).max(50_000),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const IngestSchema = z.object({
  path: z.string().min(1),
  tag: z.string().optional(),
  chunkSize: z.number().int().positive().optional().default(800),
  chunkOverlap: z.number().int().min(0).optional().default(120),
  persist: z.boolean().optional().default(true),
});

export function ragRoutes(): Router {
  const router = Router();

  router.get('/status', async (_req: Request, res: Response) => {
    const rt = getRuntime();
    const n = await rt.vectorStore.size();
    res.json({
      documents: n,
      dim: rt.vectorStore.dim,
      hydrated: n > 0,
    });
  });

  router.get('/documents', async (_req: Request, res: Response) => {
    const rt = getRuntime();
    const records = await rt.vectorStore.all();
    res.json({
      documents: records.map((r: { id: string; text: string; metadata?: Record<string, unknown> }) => ({
        id: r.id,
        text: r.text,
        metadata: r.metadata,
      })),
    });
  });

  router.post('/search', async (req: Request, res: Response) => {
    const parsed = SearchSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid_request', issues: parsed.error.issues });
      return;
    }
    const { query, topK, source, vectorWeight, rerank } = parsed.data;
    const rt = getRuntime();
    try {
      const results = await rt.retriever.retrieve({
        query,
        topK: rerank ? topK * 2 : topK,
        source,
        vectorWeight,
      });
      const out = rerank ? results.slice(0, topK) : results;
      res.json({
        hits: out.map((r) => ({
          id: r.id,
          score: r.score,
          text: r.text,
          metadata: r.metadata ?? {},
          sources: r.sources,
        })),
      });
    } catch (err) {
      res.status(500).json({ error: 'retrieval_failed', message: (err as Error).message });
    }
  });

  router.post('/upsert', async (req: Request, res: Response) => {
    const parsed = UpsertSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid_request', issues: parsed.error.issues });
      return;
    }
    const { id, text, metadata } = parsed.data;
    const rt = getRuntime();
    const recordId = id ?? `doc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    try {
      const vector = await rt.embedder.embed(text);
      await rt.vectorStore.add([{ id: recordId, vector, text, metadata: metadata ?? {} }]);
      // Also index in the retriever so hybrid/keyword search works
      // without needing a full re-ingest.
      await rt.retriever.add([{ id: recordId, text, metadata: metadata ?? {} }]);
      res.status(201).json({ id: recordId, text, metadata: metadata ?? {} });
    } catch (err) {
      res.status(500).json({ error: 'upsert_failed', message: (err as Error).message });
    }
  });

  router.post('/ingest', async (req: Request, res: Response) => {
    const parsed = IngestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid_request', issues: parsed.error.issues });
      return;
    }
    const { path: target, tag, chunkSize, chunkOverlap, persist } = parsed.data;
    let targetStat;
    try {
      targetStat = await stat(target);
    } catch {
      res.status(404).json({ error: 'not_found', path: target });
      return;
    }
    const rt = getRuntime();
    const chunker = new RecursiveTextChunker({ chunkSize, chunkOverlap });
    const pipeline = new IngestionPipeline({
      embedder: rt.embedder,
      vectorStore: rt.vectorStore,
      chunker,
      sourceTag: tag,
    });
    try {
      const result: IngestionResult = await pipeline.ingestPath(target);
      // Also push through the retriever's BM25 index so search works
      // immediately (the vector store is already populated above).
      if (result.chunks > 0) {
        const docs = (await rt.vectorStore.all()).map((d) => ({
          id: d.id,
          text: d.text,
          metadata: d.metadata,
        }));
        // Only add the newly-ingested chunks (filter by id prefix from this run).
        const recent = docs.slice(-result.chunks);
        await rt.retriever.add?.(recent);
      }
      if (persist) await rt.saveToDisk();
      res.json({
        documents: result.documents,
        chunks: result.chunks,
        vectors: result.vectors,
        errors: result.errors.map((e: { document: string; error: string }) => ({
          document: e.document,
          error: e.error,
        })),
        persisted: persist,
        path: target,
        durationMs: result.durationMs,
      });
    } catch (err) {
      res.status(500).json({ error: 'ingest_failed', message: (err as Error).message });
    }
  });

  router.post('/persist', async (_req: Request, res: Response) => {
    try {
      const result = await getRuntime().saveToDisk();
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: 'persist_failed', message: (err as Error).message });
    }
  });

  router.delete('/documents', async (_req: Request, res: Response) => {
    const rt = getRuntime();
    const n = await rt.vectorStore.size();
    rt.vectorStore.clear();
    res.json({ removed: n });
  });

  return router;
}
