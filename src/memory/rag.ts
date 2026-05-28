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
          Authorization: `Bearer ${this.apiKey}`,
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
        logger.error(
          { status: response.status, statusText: response.statusText },
          'Embedding API request failed'
        );
        return null;
      }

      const data = (await response.json()) as EmbeddingApiResponse;

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
      const validTexts = batch.map((t) => (t && t.trim() ? t.trim() : ''));

      try {
        const response = await fetch(EMBEDDING_API_URL, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
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
          logger.error(
            { status: response.status, statusText: response.statusText },
            'Batch Embedding API request failed'
          );
          continue;
        }

        const data = (await response.json()) as EmbeddingApiResponse;

        if (data.data && data.data.length > 0) {
          for (let j = 0; j < data.data.length && i + j < texts.length; j++) {
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

      const texts = items.map((item) => item.text);
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
  protected searchWithMiniSearch(query: string, limit: number): SearchResult[] {
    try {
      const results = this.miniSearch.search(query, { prefix: true, fuzzy: 0.2 });
      return results.slice(0, limit).map((result) => {
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
  protected async searchWithEmbedding(query: string, limit: number): Promise<SearchResult[]> {
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

    return scored.sort((a, b) => b.score - a.score).slice(0, limit);
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
    k = 60
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

// ============================================================================
// RAG增强功能
// ============================================================================

/**
 * 检索质量评估结果
 */
export interface QualityAssessment {
  relevance: number;
  coverage: number;
  diversity: number;
  overall: number;
  issues: string[];
  suggestions: string[];
}

/**
 * 检索策略
 */
export type RetrievalStrategy = 'keyword' | 'semantic' | 'hybrid' | 'adaptive';

/**
 * RAG检索配置
 */
export interface RAGRetrievalConfig {
  strategy: RetrievalStrategy;
  topK: number;
  minScore: number;
  enableReranking: boolean;
  enableQualityAssessment: boolean;
}

/**
 * RAG增强模块
 */
export class RAGModuleEnhanced extends RAGModule {
  private retrievalHistory: Array<{
    query: string;
    results: SearchResult[];
    timestamp: number;
    quality?: QualityAssessment;
  }> = [];
  private readonly MAX_HISTORY = 100;
  private config: RAGRetrievalConfig = {
    strategy: 'hybrid',
    topK: 5,
    minScore: 0.3,
    enableReranking: true,
    enableQualityAssessment: true,
  };

  /**
   * 设置检索配置
   */
  setConfig(config: Partial<RAGRetrievalConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * 获取当前配置
   */
  getConfig(): RAGRetrievalConfig {
    return { ...this.config };
  }

  /**
   * 增强检索：支持多种策略和质量评估
   */
  async enhancedSearch(
    query: string,
    topK?: number,
    strategy?: RetrievalStrategy
  ): Promise<{
    results: SearchResult[];
    quality: QualityAssessment;
    usedStrategy: RetrievalStrategy;
  }> {
    const k = topK || this.config.topK;
    const strat = strategy || this.config.strategy;

    let results: SearchResult[];

    // 根据策略选择检索方法
    switch (strat) {
      case 'keyword':
        results = await this.keywordSearch(query, k * 3);
        break;
      case 'semantic':
        results = await this.semanticSearch(query, k * 3);
        break;
      case 'adaptive':
        results = await this.adaptiveSearch(query, k * 3);
        break;
      case 'hybrid':
      default:
        results = await this.search(query, k * 3);
        break;
    }

    // 过滤低分结果
    results = results.filter(r => r.score >= this.config.minScore);

    // 重排序
    if (this.config.enableReranking) {
      results = this.rerank(query, results);
    }

    // 截取topK
    results = results.slice(0, k);

    // 质量评估
    let quality: QualityAssessment;
    if (this.config.enableQualityAssessment) {
      quality = this.assessQuality(query, results);
    } else {
      quality = {
        relevance: 0,
        coverage: 0,
        diversity: 0,
        overall: 0,
        issues: [],
        suggestions: [],
      };
    }

    // 记录历史
    this.recordHistory(query, results, quality);

    return { results, quality, usedStrategy: strat };
  }

  /**
   * 关键词检索
   */
  private async keywordSearch(query: string, limit: number): Promise<SearchResult[]> {
    return this.searchWithMiniSearch(query, limit);
  }

  /**
   * 语义检索
   */
  private async semanticSearch(query: string, limit: number): Promise<SearchResult[]> {
    return this.searchWithEmbedding(query, limit);
  }

  /**
   * 自适应检索：根据查询特征自动选择策略
   */
  private async adaptiveSearch(query: string, limit: number): Promise<SearchResult[]> {
    const queryLower = query.toLowerCase();

    // 代码标识符特征：驼峰、下划线、路径
    const hasCodePatterns = /[A-Z]|[_/\\]|\\.(ts|js|py|go|rs)$/.test(query);
    if (hasCodePatterns) {
      // 代码查询优先关键词
      return this.keywordSearch(query, limit);
    }

    // 技术术语特征
    const techTerms = ['react', 'vue', 'angular', 'node', 'python', 'java', 'api', 'http'];
    const hasTechTerms = techTerms.some(term => queryLower.includes(term));
    if (hasTechTerms) {
      // 技术查询使用混合策略
      return this.search(query, limit);
    }

    // 自然语言查询优先语义
    const hasNaturalLanguage = /^[a-z]+(\\s[a-z]+)+$/i.test(query);
    if (hasNaturalLanguage) {
      return this.semanticSearch(query, limit);
    }

    // 默认使用混合策略
    return this.search(query, limit);
  }

  /**
   * 结果重排序
   */
  private rerank(query: string, results: SearchResult[]): SearchResult[] {
    const queryTokens = query.toLowerCase().split(/\\s+/);
    const reranked = results.map(result => {
      let positionScore = 1 - results.indexOf(result) / results.length;
      let termMatchScore = 0;

      for (const token of queryTokens) {
        if (result.text.toLowerCase().includes(token)) {
          termMatchScore += 1;
        }
      }
      termMatchScore = termMatchScore / Math.max(queryTokens.length, 1);

      // 综合分数：原始分数 + 位置分数 + 词匹配分数
      const combinedScore = result.score * 0.6 + positionScore * 0.2 + termMatchScore * 0.2;

      return { ...result, score: combinedScore };
    });

    return reranked.sort((a, b) => b.score - a.score);
  }

  /**
   * 检索质量评估
   */
  private assessQuality(query: string, results: SearchResult[]): QualityAssessment {
    const issues: string[] = [];
    const suggestions: string[] = [];

    // 相关性评估
    const queryTokens = new Set(query.toLowerCase().split(/\\s+/));
    let relevanceSum = 0;
    for (const result of results) {
      const textTokens = new Set(result.text.toLowerCase().split(/\\s+/));
      const intersection = [...queryTokens].filter(t => textTokens.has(t));
      const relevance = intersection.length / Math.max(queryTokens.size, 1);
      relevanceSum += relevance;
    }
    const relevance = results.length > 0 ? relevanceSum / results.length : 0;

    // 覆盖率评估
    const coveredTokens = new Set<string>();
    for (const result of results) {
      const textTokens = result.text.toLowerCase().split(/\\s+/);
      for (const token of textTokens) {
        if (token.length > 3) {
          coveredTokens.add(token);
        }
      }
    }
    const coverage = Math.min(1, coveredTokens.size / 50);

    // 多样性评估
    const uniqueTerms = new Set<string>();
    for (const result of results) {
      const terms = result.text.toLowerCase().split(/[\\s,.!?;:'"()]+/);
      for (const term of terms) {
        if (term.length > 5) {
          uniqueTerms.add(term);
        }
      }
    }
    const avgTermsPerResult = uniqueTerms.size / Math.max(results.length, 1);
    const diversity = Math.min(1, avgTermsPerResult / 20);

    // 综合评分
    const overall = relevance * 0.4 + coverage * 0.3 + diversity * 0.3;

    // 问题识别
    if (relevance < 0.3) {
      issues.push('检索结果与查询相关性较低');
      suggestions.push('考虑使用更精确的查询词或调整检索策略');
    }

    if (results.length < 3) {
      issues.push('检索结果数量不足');
      suggestions.push('扩展查询范围或降低最小分数阈值');
    }

    if (diversity < 0.3) {
      issues.push('检索结果多样性不足');
      suggestions.push('尝试不同的检索策略或使用混合检索');
    }

    if (overall < 0.5) {
      issues.push('整体检索质量偏低');
      suggestions.push('建议优化查询词或调整RAG配置');
    }

    return {
      relevance: Math.round(relevance * 100) / 100,
      coverage: Math.round(coverage * 100) / 100,
      diversity: Math.round(diversity * 100) / 100,
      overall: Math.round(overall * 100) / 100,
      issues,
      suggestions,
    };
  }

  /**
   * 记录检索历史
   */
  private recordHistory(query: string, results: SearchResult[], quality?: QualityAssessment): void {
    this.retrievalHistory.push({
      query,
      results,
      timestamp: Date.now(),
      quality,
    });

    if (this.retrievalHistory.length > this.MAX_HISTORY) {
      this.retrievalHistory.shift();
    }
  }

  /**
   * 获取检索历史
   */
  getRetrievalHistory(limit = 10): typeof this.retrievalHistory {
    return this.retrievalHistory.slice(-limit);
  }

  /**
   * 获取检索统计
   */
  getRetrievalStats(): {
    totalQueries: number;
    averageQuality: number;
    strategyUsage: Record<string, number>;
  } {
    const totalQueries = this.retrievalHistory.length;
    const avgQuality = totalQueries > 0
      ? this.retrievalHistory.reduce((sum, h) => sum + (h.quality?.overall || 0), 0) / totalQueries
      : 0;

    const strategyUsage: Record<string, number> = {};
    for (const h of this.retrievalHistory) {
      // 简化统计
    }

    return {
      totalQueries,
      averageQuality: Math.round(avgQuality * 100) / 100,
      strategyUsage,
    };
  }

  /**
   * 优化检索参数
   * 基于历史检索结果自动调整参数
   */
  optimizeParameters(): void {
    if (this.retrievalHistory.length < 10) {
      return;
    }

    const recentHistory = this.retrievalHistory.slice(-20);
    const avgQuality = recentHistory.reduce((sum, h) => sum + (h.quality?.overall || 0), 0) / recentHistory.length;

    // 如果平均质量较低，尝试调整参数
    if (avgQuality < 0.5) {
      // 降低最小分数阈值
      this.config.minScore = Math.max(0.1, this.config.minScore - 0.05);
      // 增加topK
      this.config.topK = Math.min(20, this.config.topK + 2);
    } else if (avgQuality > 0.8) {
      // 如果质量较高，可以适当提高阈值以减少无关结果
      this.config.minScore = Math.min(0.5, this.config.minScore + 0.02);
    }
  }

  /**
   * 多源信息融合
   * 从多个来源检索并融合结果
   */
  async multiSourceSearch(
    query: string,
    sources: Array<{
      search: (q: string) => Promise<SearchResult[]>;
      weight: number;
    }>,
    topK = 5
  ): Promise<SearchResult[]> {
    const allResults: Array<{ result: SearchResult; sourceWeight: number }> = [];

    for (const source of sources) {
      try {
        const results = await source.search(query);
        for (const result of results) {
          allResults.push({
            result,
            sourceWeight: source.weight,
          });
        }
      } catch (error) {
        console.error('Multi-source search error:', error);
      }
    }

    // 综合评分：原始分数 * 来源权重
    const scored = allResults.map(item => ({
      ...item.result,
      score: item.result.score * item.sourceWeight,
    }));

    // 去重并合并
    const merged = this.mergeResults(scored);

    // 排序并返回
    return merged.sort((a, b) => b.score - a.score).slice(0, topK);
  }

  /**
   * 合并重复结果
   */
  private mergeResults(results: SearchResult[]): SearchResult[] {
    const merged = new Map<string, SearchResult>();

    for (const result of results) {
      const existing = merged.get(result.id);
      if (existing) {
        // 保留最高分
        if (result.score > existing.score) {
          merged.set(result.id, result);
        }
      } else {
        merged.set(result.id, result);
      }
    }

    return Array.from(merged.values());
  }
}

/** 增强版RAG模块全局单例 */
export const ragModuleEnhanced = new RAGModuleEnhanced();
