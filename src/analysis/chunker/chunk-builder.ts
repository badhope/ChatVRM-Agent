/**
 * Chunk building utilities for semantic code chunking
 */

import { estimateTokens } from '../../utils/tokens.js';
import type { CodeChunk } from './types.js';
import {
  COMMENT_TYPES,
  DEFAULT_MAX_CHUNK_TOKENS,
  IMPORT_TYPES,
  nodeTypeToChunkType,
} from './types.js';
import type { CodeSymbol } from '../../parser/symbols.js';

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Tree-sitter AST 节点位置信息
 */
export interface TreeSitterPosition {
  row: number;
  column: number;
}

/**
 * Tree-sitter AST 节点接口
 * 与 parser/engine.ts 的 ParseTreeNode 保持一致
 */
export interface TreeSitterNode {
  type: string;
  text: string;
  startPosition: TreeSitterPosition;
  endPosition: TreeSitterPosition;
  childCount: number;
  children: TreeSitterNode[];
  previousNamedSibling?: TreeSitterNode | null;
  parent: TreeSitterNode | null;
  child(index: number): TreeSitterNode | null;
  childForFieldName(fieldName: string): TreeSitterNode | null;
  descendantForPosition(position: TreeSitterPosition): TreeSitterNode;
}

/**
 * Tree-sitter 解析树接口
 */
export interface TreeSitterTree {
  rootNode: TreeSitterNode;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Extract lines from source text for a given 1-based line range.
 */
export function extractLines(
  source: string,
  startLine: number,
  endLine: number
): string {
  const lines = source.split('\n');
  const startIdx = Math.max(0, startLine - 1);
  const endIdx = Math.min(lines.length, endLine);
  return lines.slice(startIdx, endIdx).join('\n');
}

/**
 * Extract the leading JSDoc or comment block attached to a node.
 * Returns the start line of the comment block (1-based), or null.
 */
export function findLeadingComment(
  node: TreeSitterNode,
  source: string
): { startLine: number; endLine: number } | null {
  const lines = source.split('\n');
  const nodeStartLine = node.startPosition.row; // 0-based

  // Look backwards from the node's start position for comments
  let prevSibling = node.previousNamedSibling;
  if (!prevSibling) {
    // Try the actual previous sibling (which might be a comment)
    const parent = node.parent;
    if (parent) {
      for (let i = 0; i < parent.childCount; i++) {
        const child = parent.child(i);
        if (child === node) break;
        if (child && COMMENT_TYPES.has(child.type)) {
          prevSibling = child;
        } else if (child && !COMMENT_TYPES.has(child.type)) {
          prevSibling = null;
        }
      }
    }
  }

  if (prevSibling && COMMENT_TYPES.has(prevSibling.type)) {
    const commentEndLine = prevSibling.endPosition.row;
    // Check there are only blank lines between comment and node
    const gap = nodeStartLine - commentEndLine - 1;
    if (gap <= 1) {
      return {
        startLine: prevSibling.startPosition.row + 1, // convert to 1-based
        endLine: prevSibling.endPosition.row + 1,
      };
    }
  }

  return null;
}

/**
 * Extract leading comments for a chunk (attaches to the chunk content).
 */
export function extractLeadingComments(
  node: TreeSitterNode,
  source: string
): { content: string; startLine: number } | null {
  const leadingComment = findLeadingComment(node, source);
  if (!leadingComment) return null;

  const content = extractLines(source, leadingComment.startLine, leadingComment.endLine);
  return {
    content,
    startLine: leadingComment.startLine,
  };
}

/**
 * Extract imported symbol names from an import node for dependency tracking.
 */
export function extractImportedNames(node: TreeSitterNode): string[] {
  const names: string[] = [];
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (!child) continue;

    // import { Foo, Bar } from '...'
    if (child.type === 'import_specifier' || child.type === 'identifier') {
      const name = child.text;
      if (name && name !== 'from' && name !== 'type' && name !== 'import') {
        names.push(name);
      }
    }
    // import * as Foo from '...'
    if (child.type === 'namespace_import') {
      const nameNode = child.childForFieldName('name');
      if (nameNode) names.push(nameNode.text);
    }
    // import Foo from '...' (default import)
    if (child.type === 'import_clause') {
      for (let j = 0; j < child.childCount; j++) {
        const sub = child.child(j);
        if (sub && sub.type === 'identifier') {
          names.push(sub.text);
        }
      }
    }
  }
  return names;
}

/**
 * Group multiple import nodes into a single import chunk.
 */
export function groupImportsIntoChunk(
  importNodes: TreeSitterNode[],
  source: string,
  filePath: string
): CodeChunk | null {
  if (importNodes.length === 0) return null;

  const firstImport = importNodes[0];
  const lastImport = importNodes[importNodes.length - 1];
  const startLine = firstImport.startPosition.row + 1; // 1-based
  const endLine = lastImport.endPosition.row + 1;
  const content = extractLines(source, startLine, endLine);
  const importedNames = importNodes.flatMap(extractImportedNames);

  return {
    id: `${filePath}:${startLine}`,
    filePath,
    startLine,
    endLine,
    content,
    type: 'import-section',
    nestingLevel: 0,
    tokens: estimateTokens(content),
    dependencies: importedNames.map(n => `${filePath}:${n}`),
  };
}

// ============================================================================
// Large Chunk Splitting
// ============================================================================

/**
 * Try to split a large class chunk at method boundaries.
 */
export function splitLargeClass(
  node: TreeSitterNode,
  source: string,
  filePath: string,
  className: string,
  baseNestingLevel: number,
  maxTokens: number
): CodeChunk[] {
  const chunks: CodeChunk[] = [];

  // Collect method nodes
  const methods: TreeSitterNode[] = [];
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child && (
      child.type === 'method_definition' ||
      child.type === 'public_field_definition' ||
      child.type === 'property_definition' ||
      child.type === 'method_signature'
    )) {
      methods.push(child);
    }
  }

  if (methods.length <= 1) return [];

  // Group consecutive methods to fit within token budget
  let groupStart: TreeSitterNode = methods[0];
  let groupEnd: TreeSitterNode = methods[0];

  for (let i = 1; i < methods.length; i++) {
    const proposedEnd = methods[i];
    const content = extractLines(
      source,
      groupStart.startPosition.row + 1,
      proposedEnd.endPosition.row + 1
    );
    const tokens = estimateTokens(content);

    if (tokens > maxTokens && groupStart !== groupEnd) {
      // Emit current group
      const chunkContent = extractLines(
        source,
        groupStart.startPosition.row + 1,
        groupEnd.endPosition.row + 1
      );
      chunks.push({
        id: `${filePath}:${groupStart.startPosition.row + 1}`,
        filePath,
        startLine: groupStart.startPosition.row + 1,
        endLine: groupEnd.endPosition.row + 1,
        content: chunkContent,
        type: 'block',
        name: `${className}.${groupStart.childForFieldName('name')?.text ?? 'anonymous'}`,
        nestingLevel: baseNestingLevel + 1,
        tokens: estimateTokens(chunkContent),
        dependencies: [],
      });
      groupStart = proposedEnd;
      groupEnd = proposedEnd;
    } else {
      groupEnd = proposedEnd;
    }
  }

  // Emit final group
  const finalContent = extractLines(
    source,
    groupStart.startPosition.row + 1,
    groupEnd.endPosition.row + 1
  );
  chunks.push({
    id: `${filePath}:${groupStart.startPosition.row + 1}`,
    filePath,
    startLine: groupStart.startPosition.row + 1,
    endLine: groupEnd.endPosition.row + 1,
    content: finalContent,
    type: 'block',
    name: `${className}.${groupStart.childForFieldName('name')?.text ?? 'anonymous'}`,
    nestingLevel: baseNestingLevel + 1,
    tokens: estimateTokens(finalContent),
    dependencies: [],
  });

  return chunks;
}

/**
 * Try to split a large class at method boundaries.
 * Alias for splitLargeClass for backward compatibility.
 */
export function splitClassAtMethods(
  node: TreeSitterNode,
  source: string,
  filePath: string,
  className: string,
  baseNestingLevel: number,
  maxTokens: number
): CodeChunk[] {
  return splitLargeClass(node, source, filePath, className, baseNestingLevel, maxTokens);
}

// ============================================================================
// Chunk Building
// ============================================================================

/**
 * Build chunks from a parsed file.
 *
 * @param rootNode - The root node of the parsed AST
 * @param source - The source code text
 * @param filePath - Absolute path to the source file
 * @param symbols - Extracted symbols from the file
 * @param options - Chunking options
 * @returns Array of code chunks
 */
export function buildChunks(
  rootNode: TreeSitterNode,
  source: string,
  filePath: string,
  symbols: CodeSymbol[],
  options?: {
    maxChunkTokens?: number;
    minChunkLines?: number;
    respectBoundaries?: boolean;
  }
): CodeChunk[] {
  const maxTokens = options?.maxChunkTokens ?? DEFAULT_MAX_CHUNK_TOKENS;
  const minLines = options?.minChunkLines ?? 3;
  const respectBoundaries = options?.respectBoundaries ?? true;

  const chunks: CodeChunk[] = [];

  // Build a map of symbol start lines for quick lookup
  const symbolByLine = new Map<number, CodeSymbol>();
  for (const sym of symbols) {
    symbolByLine.set(sym.startLine, sym);
  }

  // Collect import nodes at the top level
  const importNodes: TreeSitterNode[] = [];
  // Collect top-level declaration nodes
  const declarationNodes: TreeSitterNode[] = [];
  // Track which lines are covered by declarations/imports
  const coveredLines = new Set<number>();

  for (let i = 0; i < rootNode.childCount; i++) {
    const child = rootNode.child(i);
    if (!child) continue;

    if (IMPORT_TYPES.has(child.type)) {
      importNodes.push(child);
      for (let l = child.startPosition.row; l <= child.endPosition.row; l++) {
        coveredLines.add(l);
      }
    } else if (child.type.startsWith('function') ||
               child.type.startsWith('class') ||
               child.type.startsWith('interface') ||
               child.type.startsWith('type') ||
               child.type.startsWith('enum') ||
               child.type === 'lexical_declaration' ||
               child.type === 'variable_declaration' ||
               child.type.startsWith('export')) {
      declarationNodes.push(child);
      for (let l = child.startPosition.row; l <= child.endPosition.row; l++) {
        coveredLines.add(l);
      }
    }
  }

  // 1. Create import-section chunk if there are imports
  const importChunk = groupImportsIntoChunk(importNodes, source, filePath);
  if (importChunk) {
    chunks.push(importChunk);
  }

  // 2. Create chunks for each declaration
  for (const node of declarationNodes) {
    const nodeStartLine = node.startPosition.row; // 0-based
    const nodeEndLine = node.endPosition.row; // 0-based

    // Find leading comment
    const leadingComment = findLeadingComment(node, source);
    let effectiveStartLine = nodeStartLine + 1; // 1-based
    if (leadingComment) {
      effectiveStartLine = leadingComment.startLine;
    }

    const effectiveEndLine = nodeEndLine + 1; // 1-based
    const content = extractLines(source, effectiveStartLine, effectiveEndLine);
    const tokenCount = estimateTokens(content);

    // Look up symbol info
    const sym = symbolByLine.get(nodeStartLine);
    const chunkType = nodeTypeToChunkType(node.type, sym?.kind);
    const chunkName = sym?.name;
    const signature = sym?.signature;

    // Check if chunk exceeds token budget
    if (tokenCount > maxTokens && respectBoundaries) {
      // Try to split classes at method boundaries
      if (node.type === 'class_declaration' || node.type === 'class_definition') {
        const subChunks = splitLargeClass(
          node, source, filePath, chunkName ?? 'anonymous', 1, maxTokens
        );
        if (subChunks.length > 0) {
          chunks.push(...subChunks);
          continue;
        }
      }
      // For oversized chunks that can't be split, keep as-is
    }

    // Skip chunks below minimum line threshold (unless they are imports or comments)
    const lineCount = effectiveEndLine - effectiveStartLine + 1;
    if (lineCount < minLines && chunkType !== 'import-section' && chunkType !== 'comment-section') {
      continue;
    }

    chunks.push({
      id: `${filePath}:${effectiveStartLine}`,
      filePath,
      startLine: effectiveStartLine,
      endLine: effectiveEndLine,
      content,
      type: chunkType,
      name: chunkName,
      signature,
      nestingLevel: 0,
      tokens: tokenCount,
      dependencies: [],
    });
  }

  // 3. Collect standalone comment blocks not attached to any declaration
  for (let i = 0; i < rootNode.childCount; i++) {
    const child = rootNode.child(i);
    if (!child || !COMMENT_TYPES.has(child.type)) continue;

    const startRow = child.startPosition.row;
    if (coveredLines.has(startRow)) continue;

    const startLine = startRow + 1; // 1-based
    const endLine = child.endPosition.row + 1;
    const content = extractLines(source, startLine, endLine);

    chunks.push({
      id: `${filePath}:${startLine}`,
      filePath,
      startLine,
      endLine,
      content,
      type: 'comment-section',
      nestingLevel: 0,
      tokens: estimateTokens(content),
      dependencies: [],
    });

    for (let l = startRow; l <= child.endPosition.row; l++) {
      coveredLines.add(l);
    }
  }

  // Sort chunks by start line
  chunks.sort((a, b) => a.startLine - b.startLine);

  return chunks;
}

/**
 * Build a single chunk from a symbol.
 */
export function buildChunkFromSymbol(
  sym: CodeSymbol,
  source: string,
  filePath: string
): CodeChunk {
  const content = extractLines(source, sym.startLine, sym.endLine);
  const chunkType = nodeTypeToChunkType(sym.kind);

  return {
    id: `${filePath}:${sym.startLine}`,
    filePath,
    startLine: sym.startLine,
    endLine: sym.endLine,
    content,
    type: chunkType,
    name: sym.name,
    signature: sym.signature,
    nestingLevel: sym.nestingLevel ?? 0,
    tokens: estimateTokens(content),
    dependencies: [],
  };
}
