/**
 * Semantic Code Chunker (简化版)
 *
 * 简化版：暂时返回空结果，移除对 tree-sitter 的依赖
 */

import * as fs from 'fs';
import type { CodeChunk, ChunkOptions } from './chunker/types.js';

/**
 * Split a single file into semantically meaningful chunks (simplified)
 */
export async function chunkFile(filePath: string, _options?: ChunkOptions): Promise<CodeChunk[]> {
  try {
    if (!fs.existsSync(filePath)) {
      return [];
    }
    const content = fs.readFileSync(filePath, 'utf-8');
    // 暂时返回一个包含整个文件内容的 chunk
    return [
      {
        id: `${filePath}#0`,
        name: filePath,
        type: 'module',
        filePath,
        startLine: 1,
        endLine: content.split('\n').length,
        content,
        tokens: content.split(/\s+/).length,
        nestingLevel: 0,
        dependencies: [],
      },
    ];
  } catch {
    return [];
  }
}

/**
 * Chunk multiple files into semantically meaningful pieces
 */
export async function chunkFiles(
  filePaths: string[],
  options?: ChunkOptions
): Promise<Map<string, CodeChunk[]>> {
  const result = new Map<string, CodeChunk[]>();

  for (const filePath of filePaths) {
    const chunks = await chunkFile(filePath, options);
    if (chunks.length > 0) {
      result.set(filePath, chunks);
    }
  }

  return result;
}

/**
 * Retrieve a chunk by its unique ID
 */
export function getChunkById(chunks: Map<string, CodeChunk[]>, id: string): CodeChunk | null {
  for (const fileChunks of chunks.values()) {
    for (const chunk of fileChunks) {
      if (chunk.id === id) return chunk;
    }
  }
  return null;
}

/**
 * Find chunks relevant to a text query using simple text matching
 */
export function findRelevantChunks(
  chunks: Map<string, CodeChunk[]>,
  query: string,
  maxResults: number = 10
): CodeChunk[] {
  const lowerQuery = query.toLowerCase();
  const scored: Array<{ chunk: CodeChunk; score: number }> = [];

  for (const fileChunks of chunks.values()) {
    for (const chunk of fileChunks) {
      let score = 0;

      if (chunk.name && chunk.name.toLowerCase().includes(lowerQuery)) {
        score += 60;
      }

      if (chunk.content.toLowerCase().includes(lowerQuery)) {
        score += 20;
        const occurrences = chunk.content.toLowerCase().split(lowerQuery).length - 1;
        score += Math.min(occurrences * 5, 30);
      }

      if (score > 0) {
        scored.push({ chunk, score });
      }
    }
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, maxResults).map((s) => s.chunk);
}
