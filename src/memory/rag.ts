/**
 * RAG 检索增强生成模块
 *
 * 使用 MiniSearch 进行全文搜索（BM25 排序），
 * 结合 Embedding API 进行语义搜索，
 * 通过 Reciprocal Rank Fusion 融合两种搜索结果。
 *
 * 设计原则：
 * - MiniSearch 提供快速关键词搜索，特别适合代码标识符
 * - Embedding API 提供语义理解能力
 * - 两种搜索结果通过 RRF 融合，取长补短
 * - API 调用失败时优雅降级，不抛错
 */

import MiniSearch from 'minisearch';
import { MEMORY_DIR } from '../utils/index.js';
import path from 'path';
import fs from 'fs/promises';
import type { VectorDocument, SearchResult, RAGStats, EmbeddingApiResponse } from './rag-types.js';
import {
  EMBEDDING_API_URL,
  EMBEDDING_MODEL,
  EMBEDDING_DIMENSIONS,
  BATCH_SIZE,
  API_TIMEOUT,
} from './rag-types.js';
import { AsyncLock } from '../utils/async-lock.js';
import { createLogger } from '../services/logger.js';

const logger = createLogger('rag');

// Re-export 类型
export type { VectorDocument, SearchResult, RAGStats, EmbeddingApiResponse };

// ============================================================================
// SECTION: MiniSearch Document Type
// ============================================================================

/** MiniSearch 索引的文档结构 */
interface SearchDocument {
  /** 文档 ID */
  id: string;
  /** 文档文本内容 */
  text: string;
}

// ============================================================================
// SECTION: RAGModule Class
// ============================================================================

/**
 * RAG 检索模块
 *
 * 混合检索方案：
 * 1. MiniSearch BM25 全文搜索（快速，适合精确匹配和代码标识符）
 * 2. Embedding 向量语义搜索（理解语义，适合自然语言查询）
 * 3. Reciprocal Rank Fusion 融合排序
 */
export class RAGModule {
  /** 阿里云百炼 API Key */
  private apiKey = '';

  /** 向量存储文件路径 */
  private storagePath: string;

  /** 内存中的文档向量库 */
  private documents: Map<string, VectorDocument> = new Map();

  /** MiniSearch 全文搜索引擎 */
  private miniSearch: MiniSearch<SearchDocument>;

  /** 是否已初始化 */
  private initialized = false;

  private initLock = new AsyncLock();
  private saveLock = new AsyncLock();
  private docLock = new AsyncLock();

  constructor() {
    this.storagePath = path.join(MEMORY_DIR, 'vectors.json');
    this.miniSearch = new MiniSearch<SearchDocument>({
      fields: ['text'],
      idField: 'id',
      searchOptions: {
        boost: { text: 1 },
        prefix: true,
        fuzzy: 0.2,
      },
    });
  }

  // ============================================================================
  // SECTION: Initialization
  // ============================================================================

  /**
   * 初始化 RAG 模块
   * @param apiKey - 阿里云百炼 API Key
   * @description 加载已有的向量数据，确保存储目录存在
   */
  async init(apiKey: string): Promise<void> {
    await this.initLock.acquire(async () => {
      if (this.initialized) return;
      this.apiKey = apiKey;

      const dir = path.dirname(this.storagePath);
      await fs.mkdir(dir, { recursive: true });

      await this.load();

      this.initialized = true;
    });
  }

  // ============================================================================
  // SECTION: Embedding Generation
  // ============================================================================

  /**
   * 生成单个文本的向量
   * @param text - 输入文本
   * @returns 向量数组，API 调用失败时返回 null
   */
  async embed(text: string): Promise<number[] | null> {
    if (!text || !text.trim()) return null;

    try {
      const response = await fetch(EMBEDDING_API_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: EMBEDDING_MODEL,
          input: text.trim(),
          dimensions: EMBEDDING_DIMENSIONS,
        }),
        signal: AbortSignal.timeout(API_TIMEOUT),
      });

      if (!response.ok) {
        logger.error({ status: response.status, statusText: response.statusText }, 'Embedding API request failed');
        return null;
      }

      const data = await response.json() as EmbeddingApiResponse;

      if (!data.data || data.data.length === 0) {
        logger.error('Embedding API returned empty data');
        return null;
      }

      return data.data[0].embedding;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error({ error: message }, 'Embedding API call exception');
      return null;
    }
  }

  /**
   * 批量生成向量
   * @param texts - 输入文本数组
   * @returns 向量数组，失败项为 null
   */
  async embedBatch(texts: string[]): Promise<Array<number[] | null>> {
    if (!texts || texts.length === 0) return [];

    const results: Array<number[] | null> = new Array(texts.length).fill(null);

    for (let i = 0; i < texts.length; i += BATCH_SIZE) {
      const batch = texts.slice(i, i + BATCH_SIZE);
      const validTexts = batch.map(t => (t && t.trim()) ? t.trim() : '');

      try {
        const response = await fetch(EMBEDDING_API_URL, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: EMBEDDING_MODEL,
            input: validTexts,
            dimensions: EMBEDDING_DIMENSIONS,
          }),
          signal: AbortSignal.timeout(API_TIMEOUT),
        });

        if (!response.ok) {
          logger.error({ status: response.status, statusText: response.statusText }, 'Batch Embedding API request failed');
          continue;
        }

        const data = await response.json() as EmbeddingApiResponse;

        if (data.data && data.data.length > 0) {
          for (let j = 0; j < data.data.length && (i + j) < texts.length; j++) {
            results[i + j] = data.data[j].embedding;
          }
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error({ error: message }, 'Batch Embedding API call exception');
      }
    }

    return results;
  }

  // ============================================================================
  // SECTION: Document Management (Indexing)
  // ============================================================================

  /**
   * 添加文档并生成向量
   * @param id - 文档唯一标识
   * @param text - 文档文本内容
   */
  async addDocument(id: string, text: string): Promise<void> {
    await this.docLock.acquire(async () => {
      if (!id || !text) return;

      const now = new Date().toISOString();
      const existing = this.documents.get(id);

      const embedding = await this.embed(text);

      const doc: VectorDocument = {
        id,
        text,
        embedding,
        createdAt: existing?.createdAt || now,
        updatedAt: now,
      };

      this.documents.set(id, doc);

      // 更新 MiniSearch 索引
      if (existing) {
        this.miniSearch.replace({ id, text });
      } else {
        this.miniSearch.add({ id, text });
      }

      await this.save();
    });
  }

  /**
   * 批量添加文档
   * @param items - 文档数组 [{id, text}]
   */
  async addDocuments(items: Array<{ id: string; text: string }>): Promise<void> {
    await this.docLock.acquire(async () => {
      if (!items || items.length === 0) return;

      const texts = items.map(item => item.text);
      const embeddings = await this.embedBatch(texts);
      const now = new Date().toISOString();

      for (let i = 0; i < items.length; i++) {
        const { id, text } = items[i];
        const existing = this.documents.get(id);

        const doc: VectorDocument = {
          id,
          text,
          embedding: embeddings[i],
          createdAt: existing?.createdAt || now,
          updatedAt: now,
        };

        this.documents.set(id, doc);

        if (existing) {
          this.miniSearch.replace({ id, text });
        } else {
          this.miniSearch.add({ id, text });
        }
      }

      await this.save();
    });
  }

  /**
   * 删除文档
   * @param id - 文档 ID
   * @returns 是否成功删除
   */
  async removeDocument(id: string): Promise<boolean> {
    return this.docLock.acquire(async () => {
      const deleted = this.documents.delete(id);
      if (deleted) {
        this.miniSearch.discard(id);
        await this.save();
      }
      return deleted;
    });
  }

  /**
   * 获取文档
   * @param id - 文档 ID
   * @returns 文档数据或 undefined
   */
  getDocument(id: string): VectorDocument | undefined {
    return this.documents.get(id);
  }

  /**
   * 获取所有文档 ID
   * @returns 文档 ID 数组
   */
  getAllDocumentIds(): string[] {
    return Array.from(this.documents.keys());
  }

  // ============================================================================
  // SECTION: Hybrid Search (Retrieval & Reranking)
  // ============================================================================

  /**
   * 混合搜索：BM25 全文搜索 + 语义向量搜索 + RRF 融合
   *
   * @param query - 查询文本
   * @param topK - 返回最相似的前 K 个结果，默认 5
   * @returns 按融合分数降序排列的搜索结果
   */
  async search(query: string, topK = 5): Promise<SearchResult[]> {
    if (!query || !query.trim()) return [];

    // 1. MiniSearch BM25 全文搜索
    const bm25Results = this.searchWithMiniSearch(query, topK * 2);

    // 2. Embedding 语义搜索
    const semanticResults = await this.searchWithEmbedding(query, topK * 2);

    // 3. 如果只有一种结果，直接返回
    if (semanticResults.length === 0) {
      return bm25Results.slice(0, topK);
    }
    if (bm25Results.length === 0) {
      return semanticResults.slice(0, topK);
    }

    // 4. Reciprocal Rank Fusion
    return this.reciprocalRankFusion(bm25Results, semanticResults, topK);
  }

  /**
   * 使用 MiniSearch 进行 BM25 全文搜索
   *
   * @param query - 查询文本
   * @param limit - 最大返回数
   * @returns 搜索结果列表
   */
  private searchWithMiniSearch(query: string, limit: number): SearchResult[] {
    try {
      const results = this.miniSearch.search(query, { prefix: true, fuzzy: 0.2 });
      return results.slice(0, limit).map(result => {
        const doc = this.documents.get(result.id);
        return {
          id: result.id,
          text: doc?.text ?? '',
          score: result.score,
        };
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error({ error: message }, 'MiniSearch search exception');
      return [];
    }
  }

  /**
   * 使用 Embedding 进行语义搜索
   *
   * @param query - 查询文本
   * @param limit - 最大返回数
   * @returns 搜索结果列表
   */
  private async searchWithEmbedding(query: string, limit: number): Promise<SearchResult[]> {
    const queryEmbedding = await this.embed(query);
    if (!queryEmbedding) return [];

    const scored: SearchResult[] = [];

    for (const doc of this.documents.values()) {
      if (!doc.embedding) continue;

      const score = this.cosineSimilarity(queryEmbedding, doc.embedding);
      scored.push({
        id: doc.id,
        text: doc.text,
        score,
      });
    }

    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  /**
   * Reciprocal Rank Fusion 融合两组搜索结果
   *
   * @param resultsA - 第一组搜索结果（BM25）
   * @param resultsB - 第二组搜索结果（语义）
   * @param topK - 返回前 K 个结果
   * @param k - RRF 常数（默认 60）
   * @returns 融合后的搜索结果
   */
  private reciprocalRankFusion(
    resultsA: SearchResult[],
    resultsB: SearchResult[],
    topK: number,
    k = 60,
  ): SearchResult[] {
    const scoreMap = new Map<string, number>();
    const docMap = new Map<string, SearchResult>();

    // 计算结果 A 的 RRF 分数
    for (let rank = 0; rank < resultsA.length; rank++) {
      const result = resultsA[rank];
      const rrfScore = 1 / (k + rank + 1);
      scoreMap.set(result.id, (scoreMap.get(result.id) ?? 0) + rrfScore);
      docMap.set(result.id, result);
    }

    // 计算结果 B 的 RRF 分数
    for (let rank = 0; rank < resultsB.length; rank++) {
      const result = resultsB[rank];
      const rrfScore = 1 / (k + rank + 1);
      scoreMap.set(result.id, (scoreMap.get(result.id) ?? 0) + rrfScore);
      if (!docMap.has(result.id)) {
        docMap.set(result.id, result);
      }
    }

    // 按 RRF 分数降序排列
    return Array.from(scoreMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, topK)
      .map(([id, score]) => {
        const doc = docMap.get(id)!;
        return { ...doc, score };
      });
  }

  /**
   * 余弦相似度计算
   * @param a - 向量 A
   * @param b - 向量 B
   * @returns 相似度分数（-1 ~ 1）
   */
  cosineSimilarity(a: number[], b: number[]): number {
    if (!a || !b || a.length !== b.length || a.length === 0) return 0;

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    if (denominator === 0) return 0;

    return dotProduct / denominator;
  }

  // ============================================================================
  // SECTION: Persistence
  // ============================================================================

  /**
   * 保存向量数据到磁盘
   */
  async save(): Promise<void> {
    await this.saveLock.acquire(async () => {
      try {
        const data: Record<string, VectorDocument> = {};
        for (const [id, doc] of this.documents) {
          data[id] = doc;
        }

        const dir = path.dirname(this.storagePath);
        await fs.mkdir(dir, { recursive: true });

        const tmpPath = this.storagePath + '.tmp';
        await fs.writeFile(tmpPath, JSON.stringify(data, null, 2), 'utf-8');
        await fs.rename(tmpPath, this.storagePath);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error({ error: message }, 'Failed to save vector data');
      }
    });
  }

  /**
   * 从磁盘加载向量数据并重建 MiniSearch 索引
   */
  private async load(): Promise<void> {
    try {
      const content = await fs.readFile(this.storagePath, 'utf-8');
      const data = JSON.parse(content) as Record<string, VectorDocument>;

      this.documents.clear();
      this.miniSearch = new MiniSearch<SearchDocument>({
        fields: ['text'],
        idField: 'id',
        searchOptions: {
          boost: { text: 1 },
          prefix: true,
          fuzzy: 0.2,
        },
      });

      const searchDocs: SearchDocument[] = [];

      for (const [id, doc] of Object.entries(data)) {
        this.documents.set(id, doc);
        searchDocs.push({ id, text: doc.text });
      }

      // 批量添加到 MiniSearch
      if (searchDocs.length > 0) {
        this.miniSearch.addAll(searchDocs);
      }
    } catch (error) {
      this.documents.clear();
      this.miniSearch = new MiniSearch<SearchDocument>({
        fields: ['text'],
        idField: 'id',
        searchOptions: {
          boost: { text: 1 },
          prefix: true,
          fuzzy: 0.2,
        },
      });
    }
  }

  // ============================================================================
  // SECTION: Statistics
  // ============================================================================

  /**
   * 获取统计信息
   * @returns RAG 模块的运行统计数据
   */
  getStats(): RAGStats {
    let validVectors = 0;
    let nullVectors = 0;

    for (const doc of this.documents.values()) {
      if (doc.embedding) {
        validVectors++;
      } else {
        nullVectors++;
      }
    }

    return {
      totalDocuments: this.documents.size,
      validVectors,
      nullVectors,
      dimensions: EMBEDDING_DIMENSIONS,
      storagePath: this.storagePath,
      initialized: this.initialized,
    };
  }

  // ============================================================================
  // SECTION: Utility Methods
  // ============================================================================

  /**
   * 清空所有文档
   */
  async clear(): Promise<void> {
    await this.docLock.acquire(async () => {
      this.documents.clear();
      this.miniSearch = new MiniSearch<SearchDocument>({
        fields: ['text'],
        idField: 'id',
        searchOptions: {
          boost: { text: 1 },
          prefix: true,
          fuzzy: 0.2,
        },
      });
      await this.save();
    });
  }

  /**
   * 检查是否已初始化
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * 获取文档总数
   */
  size(): number {
    return this.documents.size;
  }
}

// ============================================================================
// SECTION: Global Singleton
// ============================================================================

/** RAG 模块全局单例 */
export const ragModule = new RAGModule();
