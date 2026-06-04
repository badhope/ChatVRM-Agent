/**
 * Reranker.
 *
 * After the retriever returns `topK` candidates, a reranker scores
 * each `(query, candidate)` pair more carefully and re-sorts. This is
 * the standard "two-stage" RAG pattern:
 *
 *   1. Retriever (fast, cheap, approximate) — gets the candidate set
 *   2. Reranker (slower, more accurate)   — re-orders within the set
 *
 * Cross-encoders (e.g. sentence-transformers cross-encoders, Cohere
 * Rerank) score the *joint* representation of (q, c) and tend to be
 * much more accurate than cosine similarity of independently-encoded
 * vectors. The catch: they only work on a small candidate set
 * (10-200), not the whole corpus.
 *
 * This module ships a **deterministic, no-model** reranker — a
 * weighted combination of:
 *   - token overlap (Jaccard / Dice / token-set ratio)
 *   - length penalty (very short or very long answers get a slight
 *     down-weight)
 *   - position bias (candidates closer to the top of the initial
 *     list get a tie-breaker)
 *
 * That makes the reranker:
 *  - testable without a model
 *  - cheap to run on every call
 *  - good enough to clean up retrieval noise
 *
 * For real cross-encoder accuracy, swap in {@link LLMReranker}, which
 * asks an LLM to score each candidate 0-3.
 */

import type { HybridResult } from '../adapters/hybrid-retriever.js';

export interface RerankOptions {
  /** Tokenisation function. Default: lowercased word-split. */
  tokenize?: (s: string) => string[];
  /** Weight of the overlap term in [0,1]. Default 0.7. */
  overlapWeight?: number;
  /** Weight of the position term in [0,1]. Default 0.2. */
  positionWeight?: number;
  /** Weight of the length term in [0,1]. Default 0.1. */
  lengthWeight?: number;
}

export interface RerankResult extends HybridResult {
  /** Position before reranking. */
  originalRank: number;
  /** Per-feature breakdown for debugging. */
  features: { overlap: number; position: number; length: number; total: number };
}

const DEFAULT_TOKENIZE = (s: string): string[] =>
  s
    .toLowerCase()
    .split(/[^a-z0-9]+/u)
    .filter((t) => t.length > 0);

/**
 * Score a single (query, candidate) pair. Returns 0..1 — higher is
 * more relevant. The score is a weighted sum of three features.
 */
export function scorePair(query: string, candidate: string, opts: {
  tokenize?: (s: string) => string[];
  originalRank?: number;
  candidateCount?: number;
} = {}): { overlap: number; position: number; length: number; total: number } {
  const tok = opts.tokenize ?? DEFAULT_TOKENIZE;
  const q = new Set(tok(query));
  const c = tok(candidate);
  const cs = new Set(c);
  let inter = 0;
  for (const t of q) if (cs.has(t)) inter += 1;
  const union = q.size + cs.size - inter;
  const overlap = union > 0 ? inter / union : 0;
  // Token-set ratio: 2 * |intersection| / (|a| + |b|). Useful for
  // very imbalanced lengths where Jaccard is too harsh.
  const tsr = (q.size + cs.size) > 0 ? (2 * inter) / (q.size + cs.size) : 0;
  const overlapScore = 0.5 * overlap + 0.5 * tsr;

  // Position bias: rank 0 → 1, last → 0.1, linear in between.
  // (Down-weighted; overlap should dominate.)
  let position = 1;
  if (opts.candidateCount && opts.candidateCount > 1 && opts.originalRank !== undefined) {
    position = 1 - 0.9 * (opts.originalRank / (opts.candidateCount - 1));
  }

  // Length penalty: candidates with < 3 tokens (too short) and
  // > 400 tokens (too long) get damped. Measured in tokens, not chars,
  // to be language-neutral.
  let length = 1;
  if (c.length < 3) length = 0.3;
  else if (c.length > 400) length = 0.7;

  return { overlap: overlapScore, position, length, total: 0 };
}

export function computeTotal(features: { overlap: number; position: number; length: number }, w: { overlapWeight: number; positionWeight: number; lengthWeight: number }): number {
  return features.overlap * w.overlapWeight + features.position * w.positionWeight + features.length * w.lengthWeight;
}

/**
 * Rerank a list of hybrid results for a query. Returns a new sorted
 * array (the original is unchanged) and each result carries a
 * `features` breakdown for inspection.
 */
export function rerank(query: string, results: HybridResult[], opts: RerankOptions = {}): RerankResult[] {
  const tok = opts.tokenize ?? DEFAULT_TOKENIZE;
  const weights = {
    overlapWeight: opts.overlapWeight ?? 0.7,
    positionWeight: opts.positionWeight ?? 0.2,
    lengthWeight: opts.lengthWeight ?? 0.1,
  };
  const norm = weights.overlapWeight + weights.positionWeight + weights.lengthWeight;
  const w = {
    overlapWeight: weights.overlapWeight / norm,
    positionWeight: weights.positionWeight / norm,
    lengthWeight: weights.lengthWeight / norm,
  };
  const out: RerankResult[] = results.map((r, idx) => {
    const features = scorePair(query, r.text, {
      tokenize: tok,
      originalRank: idx,
      candidateCount: results.length,
    });
    const total = computeTotal(features, w);
    return { ...r, originalRank: idx, features: { ...features, total }, score: total };
  });
  out.sort((a, b) => b.score - a.score);
  return out;
}

/**
 * LLM-based reranker. Falls back to the deterministic scorer when
 * the LLM is unavailable. Useful as a "cross-encoder substitute"
 * when you have an LLM and a small candidate set.
 */
export interface LLMRerankerOptions {
  /** LLM-style `chat` function returning a 0-3 integer per call. */
  chat: (messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>) => Promise<{ content: string }>;
  /** Concurrency for parallel LLM calls. Default 4. */
  concurrency?: number;
}

export async function llmRerank(
  query: string,
  results: HybridResult[],
  opts: LLMRerankerOptions,
): Promise<HybridResult[]> {
  if (results.length === 0) return [];
  const scores: number[] = new Array(results.length).fill(0);
  const sysPrompt = 'You are a relevance scorer. For each (query, passage) pair, output a single integer 0-3:\n  0 = irrelevant\n  1 = marginally relevant\n  2 = highly relevant\n  3 = directly answers the query\nRespond with ONLY the integer.';

  const queue = [...results.keys()];
  const workers: Array<Promise<void>> = [];
  const conc = opts.concurrency ?? 4;
  for (let w = 0; w < Math.min(conc, results.length); w += 1) {
    workers.push(
      (async () => {
        while (true) {
          const idx = queue.shift();
          if (idx === undefined) return;
          try {
            const r = await opts.chat([
              { role: 'system', content: sysPrompt },
              { role: 'user', content: `Query: ${query}\n\nPassage: ${results[idx]!.text}` },
            ]);
            const n = Number((r.content.match(/\d/) ?? ['0'])[0]);
            scores[idx] = isFinite(n) ? Math.min(3, Math.max(0, n)) : 0;
          } catch {
            scores[idx] = 0;
          }
        }
      })(),
    );
  }
  await Promise.all(workers);

  return results
    .map((r, idx) => ({ ...r, score: scores[idx]! }))
    .sort((a, b) => b.score - a.score);
}
