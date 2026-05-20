/**
 * Semantic Code Chunker
 *
 * Splits source files into semantically meaningful chunks using tree-sitter
 * AST analysis. Each top-level declaration (function, class, interface, etc.)
 * becomes a chunk, with import statements grouped together and leading
 * comments attached to their following declarations.
 */

import { parseFile } from '../parser/engine.js';
import { extractSymbols } from '../parser/symbols.js';

import type { CodeChunk, ChunkOptions } from './chunker/types.js';
import { DEFAULT_MAX_CHUNK_TOKENS, DEFAULT_MIN_CHUNK_LINES } from './chunker/types.js';
import { buildChunks } from './chunker/chunk-builder.js';

/**
 * Split a single file into semantically meaningful chunks.
 */
export async function chunkFile(
  filePath: string,
  options?: ChunkOptions
): Promise<CodeChunk[]> {
  const parseResult = await parseFile(filePath);
  if (!parseResult) return [];

  const { tree, source } = parseResult;
  const rootNode = tree.rootNode;
  const symbols = extractSymbols(parseResult);

  return buildChunks(rootNode, source, filePath, symbols, {
    maxChunkTokens: options?.maxChunkTokens ?? DEFAULT_MAX_CHUNK_TOKENS,
    minChunkLines: options?.minChunkLines ?? DEFAULT_MIN_CHUNK_LINES,
    respectBoundaries: options?.respectBoundaries ?? true,
  });
}

/**
 * Chunk multiple files into semantically meaningful pieces.
 */
export async function chunkFiles(
  filePaths: string[],
  options?: ChunkOptions
): Promise<Map<string, CodeChunk[]>> {
  const result = new Map<string, CodeChunk[]>();

  const batchSize = 10;
  for (let i = 0; i < filePaths.length; i += batchSize) {
    const batch = filePaths.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map(async (fp) => {
        const chunks = await chunkFile(fp, options);
        return [fp, chunks] as const;
      })
    );
    for (const [fp, fileChunks] of batchResults) {
      if (fileChunks.length > 0) {
        result.set(fp, fileChunks);
      }
    }
  }

  return result;
}

/**
 * Retrieve a chunk by its unique ID.
 */
export function getChunkById(
  chunks: Map<string, CodeChunk[]>,
  id: string
): CodeChunk | null {
  for (const fileChunks of chunks.values()) {
    for (const chunk of fileChunks) {
      if (chunk.id === id) return chunk;
    }
  }
  return null;
}

/**
 * Find chunks relevant to a text query using simple text matching.
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

      if (chunk.name && chunk.name.toLowerCase() === lowerQuery) {
        score += 100;
      } else if (chunk.name && chunk.name.toLowerCase().startsWith(lowerQuery)) {
        score += 80;
      } else if (chunk.name && chunk.name.toLowerCase().includes(lowerQuery)) {
        score += 60;
      }

      if (chunk.type.toLowerCase().includes(lowerQuery)) {
        score += 40;
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

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (a.chunk.filePath !== b.chunk.filePath) {
      return a.chunk.filePath.localeCompare(b.chunk.filePath);
    }
    return a.chunk.startLine - b.chunk.startLine;
  });

  return scored.slice(0, maxResults).map(s => s.chunk);
}
