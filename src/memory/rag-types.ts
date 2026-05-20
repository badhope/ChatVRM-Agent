// ============================================================
// RAG 模块类型定义与常量
// ============================================================

/** 向量文档条目 */
export interface VectorDocument {
  /** 文档唯一标识 */
  id: string;
  /** 原始文本内容 */
  text: string;
  /** 向量（1024 维） */
  embedding: number[] | null;
  /** 创建时间（ISO 字符串） */
  createdAt: string;
  /** 最后更新时间（ISO 字符串） */
  updatedAt: string;
}

/** 搜索结果 */
export interface SearchResult {
  /** 文档 ID */
  id: string;
  /** 原始文本 */
  text: string;
  /** 余弦相似度分数（0~1） */
  score: number;
}

/** 统计信息 */
export interface RAGStats {
  /** 文档总数 */
  totalDocuments: number;
  /** 有效向量数（embedding 不为 null） */
  validVectors: number;
  /** 空向量数（API 调用失败降级的） */
  nullVectors: number;
  /** 向量维度 */
  dimensions: number;
  /** 存储文件路径 */
  storagePath: string;
  /** 是否已初始化 */
  initialized: boolean;
}

/** 阿里云百炼 Embedding API 响应 */
export interface EmbeddingApiResponse {
  data: Array<{
    embedding: number[];
    index: number;
    object: string;
  }>;
  model: string;
  object: string;
  usage: {
    prompt_tokens: number;
    total_tokens: number;
  };
}

// ============================================================
// 常量
// ============================================================

/** 阿里云百炼 Embedding API 地址 */
export const EMBEDDING_API_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1/embeddings';

/** 使用的 Embedding 模型 */
export const EMBEDDING_MODEL = 'text-embedding-v3';

/** 向量维度 */
export const EMBEDDING_DIMENSIONS = 1024;

/** 批量 Embedding 的最大批次大小 */
export const BATCH_SIZE = 10;

/** API 请求超时时间（毫秒） */
export const API_TIMEOUT = 30000;
