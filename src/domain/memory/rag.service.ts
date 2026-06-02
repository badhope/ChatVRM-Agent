import { KnowledgeEntity, KnowledgeGraph } from './memory.service.js';

export interface RAGQuery {
  query: string;
  topK: number;
  minConfidence: number;
}

export interface RAGResult {
  entity: KnowledgeEntity;
  score: number;
  snippet: string;
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 0);
}

function computeTF(term: string, tokens: string[]): number {
  if (tokens.length === 0) {
    return 0;
  }
  const count = tokens.filter((t) => t === term).length;
  return count / tokens.length;
}

function extractSnippet(entity: KnowledgeEntity, queryTokens: string[]): string {
  const description = entity.description || entity.label;
  const maxLength = 200;

  if (description.length <= maxLength) {
    return description;
  }

  const lower = description.toLowerCase();
  let bestStart = 0;
  let bestScore = 0;

  for (const token of queryTokens) {
    const idx = lower.indexOf(token);
    if (idx !== -1) {
      const start = Math.max(0, idx - 40);
      const score = queryTokens.filter((t) =>
        lower.substring(start, start + maxLength).includes(t),
      ).length;
      if (score > bestScore) {
        bestScore = score;
        bestStart = start;
      }
    }
  }

  return description.substring(bestStart, bestStart + maxLength);
}

export class RAGService {
  private knowledgeGraph: KnowledgeGraph;

  constructor(knowledgeGraph: KnowledgeGraph) {
    this.knowledgeGraph = knowledgeGraph;
  }

  async search(query: RAGQuery): Promise<RAGResult[]> {
    const { query: queryText, topK = 5, minConfidence = 30 } = query;
    const queryTokens = tokenize(queryText);

    const candidates = this.knowledgeGraph.query(queryText);
    const results: RAGResult[] = [];

    for (const entity of candidates) {
      if (entity.confidence < minConfidence) {
        continue;
      }

      const entityTokens = tokenize(
        `${entity.label} ${entity.description} ${entity.type}`,
      );

      let score = 0;
      for (const qt of queryTokens) {
        const tf = computeTF(qt, entityTokens);
        if (tf > 0) {
          score += tf * (1 + Math.log(1 + tf));
        }
        const labelScore = entity.label.toLowerCase().includes(qt) ? 2 : 0;
        score += labelScore;
      }

      if (score > 0) {
        const snippet = extractSnippet(entity, queryTokens);
        results.push({
          entity,
          score: Math.round(score * 100) / 100,
          snippet,
        });
      }
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, topK);
  }

  rerank(results: RAGResult[], query: string): RAGResult[] {
    const queryTokens = tokenize(query);

    const scored = results.map((r) => {
      const entityText =
        `${r.entity.label} ${r.entity.description}`.toLowerCase();
      let bonus = 0;
      for (const qt of queryTokens) {
        if (r.entity.label.toLowerCase() === qt) {
          bonus += 10;
        } else if (r.entity.label.toLowerCase().includes(qt)) {
          bonus += 5;
        } else if (entityText.includes(qt)) {
          bonus += 2;
        }
      }
      return {
        ...r,
        score: Math.round((r.score + bonus) * 100) / 100,
      };
    });

    scored.sort((a, b) => b.score - a.score);
    return scored;
  }

  generateContext(results: RAGResult[], maxTokens: number = 2000): string {
    if (results.length === 0) {
      return '';
    }

    const chunks: string[] = [];
    let currentTokens = 0;

    for (const result of results) {
      const line = `[${result.entity.type}: ${result.entity.label}] (confidence: ${result.entity.confidence}) ${result.snippet}`;
      const estimatedTokens = Math.ceil(line.length / 4);
      if (currentTokens + estimatedTokens > maxTokens) {
        break;
      }
      chunks.push(line);
      currentTokens += estimatedTokens;
    }

    return chunks.join('\n');
  }
}