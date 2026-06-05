/**
 * Token budget & cost tracker.
 *
 * Wraps an ILLMPort and records every chat() call's usage. Provides:
 *  - per-call accounting
 *  - per-session aggregation
 *  - a `BudgetGuard` that throws when a configured limit is hit
 *  - per-model pricing (USD / 1K tokens) for cost estimation
 *
 * Use this when:
 *  - the user is on a metered plan and you want to abort on overrun
 *  - the app has a daily/weekly budget you want to enforce
 *  - you need to surface a real-time token counter in the UI
 *
 * Threading model: in-process only. The store is a single Map keyed
 * by session id (default 'default'). For multi-tenant / multi-process
 * scenarios, plumb a shared store on top.
 */

import type { ILLMPort, ChatParams, ChatResponse } from '../ports/llm.port.js';

export interface ModelPrice {
  /** USD per 1K prompt tokens. */
  promptPer1k: number;
  /** USD per 1K completion tokens. */
  completionPer1k: number;
}

export interface BudgetConfig {
  /** Soft limit: warn (via onWarn) but allow more calls. */
  warnAt?: { sessionId?: string; totalTokens?: number; usd?: number };
  /** Hard limit: throw TokenBudgetError before the next call. */
  hardAt?: { sessionId?: string; totalTokens?: number; usd?: number };
  /**
   * Optional callback for soft-limit crossings. Useful for logging,
   * surfacing a banner in the UI, or flipping a flag in observability.
   * Called once per crossing event.
   */
  onWarn?: (event: {
    sessionId: string;
    usage: TokenUsage;
    limit: { totalTokens?: number; usd?: number };
    kind: 'tokens' | 'usd';
  }) => void;
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  usd: number;
  calls: number;
}

export class TokenBudgetError extends Error {
  readonly code = 'TOKEN_BUDGET_EXCEEDED';
  constructor(public readonly sessionId: string, public readonly current: TokenUsage, public readonly limit: { totalTokens?: number; usd?: number }) {
    super(`Token budget exceeded for session "${sessionId}": ${JSON.stringify(current)} > ${JSON.stringify(limit)}`);
  }
}

export class TokenBudget {
  private readonly sessions = new Map<string, TokenUsage>();
  private readonly prices = new Map<string, ModelPrice>();
  private readonly config: BudgetConfig;

  constructor(config: BudgetConfig = {}) {
    this.config = config;
  }

  /** Register or update a model's pricing. */
  setPrice(model: string, price: ModelPrice): void {
    this.prices.set(model, price);
  }

  /** Set / merge the budget config at runtime. */
  setConfig(config: BudgetConfig): void {
    Object.assign(this.config, config);
  }

  /** Get the current usage for a session. Returns zero usage if unknown. */
  get(sessionId = 'default'): TokenUsage {
    return this.sessions.get(sessionId) ?? { promptTokens: 0, completionTokens: 0, totalTokens: 0, usd: 0, calls: 0 };
  }

  /** Record a single call's usage. Returns the updated total. */
  record(sessionId: string, model: string, usage: ChatResponse['usage']): TokenUsage {
    const price = this.prices.get(model);
    const usd = price
      ? (usage.promptTokens / 1000) * price.promptPer1k + (usage.completionTokens / 1000) * price.completionPer1k
      : 0;
    const cur = this.sessions.get(sessionId) ?? { promptTokens: 0, completionTokens: 0, totalTokens: 0, usd: 0, calls: 0 };
    const next: TokenUsage = {
      promptTokens: cur.promptTokens + usage.promptTokens,
      completionTokens: cur.completionTokens + usage.completionTokens,
      totalTokens: cur.totalTokens + usage.totalTokens,
      usd: cur.usd + usd,
      calls: cur.calls + 1,
    };
    this.sessions.set(sessionId, next);
    this.checkWarnLimit(sessionId, next);
    this.checkHardLimit(sessionId, next);
    return next;
  }

  /** Reset a session (or all sessions if id is undefined). */
  reset(sessionId?: string): void {
    if (sessionId === undefined) this.sessions.clear();
    else this.sessions.delete(sessionId);
  }

  /** All sessions and their usage. */
  snapshot(): Record<string, TokenUsage> {
    const out: Record<string, TokenUsage> = {};
    for (const [k, v] of this.sessions) out[k] = v;
    return out;
  }

  /**
   * Wrap an ILLMPort. Every call's usage is recorded under the
   * `sessionId` carried in the request (X-Session-Id header is not
   * available here; we use an explicit per-call session via the
   * `withSession()` helper or default to 'default').
   *
   * Pre-call guard: when a hard limit is configured and the projected
   * prompt size alone would push the session over the limit, the
   * call is rejected **before** the LLM is invoked. This avoids
   * paying for a call whose result would be thrown away.
   */
  wrap(port: ILLMPort, sessionId = 'default'): ILLMPort {
    return {
      chat: async (req: ChatParams) => {
        this.preCallCheck(sessionId, this.estimatePromptTokens(req));
        const out = await port.chat(req);
        this.record(sessionId, out.model || req.model || 'unknown', out.usage);
        return out;
      },
      stream: port.stream.bind(port),
      listModels: ((...args: Parameters<ILLMPort['listModels']>) => port.listModels(...args)) as ILLMPort['listModels'],
      isAvailable: ((...args: Parameters<ILLMPort['isAvailable']>) => port.isAvailable(...args)) as ILLMPort['isAvailable'],
    };
  }

  /**
   * Return a wrapper that infers the session id from a `X-Session-Id`
   * analogue: the call-site passes the id explicitly. Useful when
   * the agent knows its own session id.
   */
  withSession(port: ILLMPort, getSessionId: () => string): ILLMPort {
    return {
      chat: async (req: ChatParams) => {
        const sid = getSessionId();
        this.preCallCheck(sid, this.estimatePromptTokens(req));
        const out = await port.chat(req);
        this.record(sid, out.model || req.model || 'unknown', out.usage);
        return out;
      },
      stream: port.stream.bind(port),
      listModels: ((...args: Parameters<ILLMPort['listModels']>) => port.listModels(...args)) as ILLMPort['listModels'],
      isAvailable: ((...args: Parameters<ILLMPort['isAvailable']>) => port.isAvailable(...args)) as ILLMPort['isAvailable'],
    };
  }

  /**
   * Rough upper-bound on the input size, used by pre-call guards to
   * abort *before* paying for an LLM call whose result would be
   * discarded by the hard limit. The estimate is intentionally
   * conservative (~3.5 chars / token) and ignores tool specs.
   */
  private estimatePromptTokens(req: ChatParams): number {
    const parts: string[] = [];
    if (Array.isArray(req.messages)) {
      for (const m of req.messages) {
        if (m.role === 'system' || m.role === 'user' || m.role === 'assistant' || m.role === 'tool') {
          parts.push(m.content);
        }
      }
    }
    const chars = parts.reduce((n, s) => n + s.length, 0);
    return Math.ceil(chars / 3.5);
  }

  private preCallCheck(sessionId: string, projectedPromptTokens: number): void {
    const h = this.config.hardAt;
    if (!h) return;
    if (h.totalTokens === undefined && h.usd === undefined) return;
    const cur = this.get(sessionId);
    if (h.totalTokens !== undefined && cur.totalTokens + projectedPromptTokens > h.totalTokens) {
      throw new TokenBudgetError(sessionId, cur, h);
    }
    if (h.usd !== undefined && cur.usd > h.usd) {
      throw new TokenBudgetError(sessionId, cur, h);
    }
  }

  private checkWarnLimit(sessionId: string, usage: TokenUsage): void {
    const w = this.config.warnAt;
    if (!w) return;
    if (w.totalTokens !== undefined && usage.totalTokens > w.totalTokens) {
      this.config.onWarn?.({ sessionId, usage, limit: w, kind: 'tokens' });
    }
    if (w.usd !== undefined && usage.usd > w.usd) {
      this.config.onWarn?.({ sessionId, usage, limit: w, kind: 'usd' });
    }
  }

  private checkHardLimit(sessionId: string, usage: TokenUsage): void {
    const h = this.config.hardAt;
    if (!h) return;
    if (h.totalTokens !== undefined && usage.totalTokens > h.totalTokens) {
      throw new TokenBudgetError(sessionId, usage, h);
    }
    if (h.usd !== undefined && usage.usd > h.usd) {
      throw new TokenBudgetError(sessionId, usage, h);
    }
  }
}

/** Default pricing table for common models. Numbers are USD / 1K tokens. */
export const DEFAULT_PRICES: Record<string, ModelPrice> = {
  'gpt-4o': { promptPer1k: 0.005, completionPer1k: 0.015 },
  'gpt-4o-mini': { promptPer1k: 0.00015, completionPer1k: 0.0006 },
  'gpt-4.1': { promptPer1k: 0.01, completionPer1k: 0.03 },
  'gpt-4.1-mini': { promptPer1k: 0.0004, completionPer1k: 0.0016 },
  'claude-3-5-sonnet': { promptPer1k: 0.003, completionPer1k: 0.015 },
  'claude-3-haiku': { promptPer1k: 0.00025, completionPer1k: 0.00125 },
  'gemini-1.5-pro': { promptPer1k: 0.0035, completionPer1k: 0.0105 },
  'gemini-1.5-flash': { promptPer1k: 0.000075, completionPer1k: 0.0003 },
};
