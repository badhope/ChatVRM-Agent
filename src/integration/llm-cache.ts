/**
 * LLM response cache.
 *
 * A small, in-process LRU cache that keys on a stable hash of the
 * chat request. Use it to:
 *  - skip identical repeated prompts in tests
 *  - cache cheap-to-save LLM completions for retry scenarios
 *  - implement "speculative" pre-warming of likely follow-ups
 *
 * The cache is *transparent*: you call `wrap(port)` to get a new
 * ILLMPort that proxies to the underlying one and memoises results.
 * Streaming responses are NOT cached (they're typically very large
 * and most callers want fresh data).
 *
 * Cache key: stable JSON of (provider, model, messages, tools, temperature,
 * maxTokens, topP, presencePenalty, frequencyPenalty). Two equivalent calls
 * produce the same key. If you change the model behaviour (topP / penalties)
 * the cache key changes, so stale responses are not returned.
 *
 * H9 (W18): key derivation is now a sha256 hash of the canonical
 * stringification instead of a recursive `stableStringify` that
 * produced a multi-MB string for large messages+tools arrays. The
 * stored key is short, comparable, and the hot path no longer
 * allocates one giant string per request.
 *
 * TTL: per-entry expiry; default 5 minutes. LRU eviction: when the
 * cache exceeds `maxEntries`, the least-recently-used entry is removed.
 */

import { createHash } from 'node:crypto';
import type { ILLMPort, ChatResponse, ChatParams } from '../ports/llm.port.js';

export interface LLMCacheOptions {
  /** Max cached entries. Default 256. */
  maxEntries?: number;
  /** Per-entry TTL in ms. Default 5 * 60 * 1000 (5 min). */
  ttlMs?: number;
  /** Optional clock for testing. */
  now?: () => number;
}

interface CacheEntry {
  key: string;
  value: ChatResponse;
  expiresAt: number;
  insertedAt: number;
}

export class LLMCache {
  private readonly maxEntries: number;
  private readonly ttlMs: number;
  private readonly now: () => number;
  private readonly map = new Map<string, CacheEntry>();
  private hits = 0;
  private misses = 0;

  constructor(opts: LLMCacheOptions = {}) {
    this.maxEntries = opts.maxEntries ?? 256;
    this.ttlMs = opts.ttlMs ?? 5 * 60 * 1000;
    this.now = opts.now ?? (() => Date.now());
  }

  /** Compute the cache key for a request. */
  /**
   * Recursive, type-stable serialiser for cache-key normalisation.
   *
   * M16 (W19): the previous `keyOf` used `JSON.stringify` directly,
   * which (a) blows up on circular references, (b) gives different
   * strings for `Date`s (`"2025-01-01T00:00:00.000Z"` vs an ISO
   * string vs a number) and (c) treats `Map`/`Set` as `{}` or `{}`
   * with no keys. Two semantically-equivalent requests — one
   * passing `Date.now()` and one passing a fresh `Date(...)` — would
   * land in different cache buckets, the cache hit-rate metric
   * drops, and (worse) the agent re-bills the LLM. We now:
   *   - Detect cycles via a `WeakSet`
   *   - Coerce `Date` to its `toISOString()` form
   *   - Sort object keys alphabetically
   *   - Render `Map` and `Set` as sorted `[k, v]` arrays
   * The output is a stable string that matches what the on-disk
   * cache file would contain, so a hit on a process restart
   * reuses the on-disk entry.
   */
  private static stableStringify(v: unknown, seen: WeakSet<object> = new WeakSet()): string {
    if (v === null) return 'null';
    if (v === undefined) return 'undefined';
    const t = typeof v;
    if (t === 'number' || t === 'boolean') return JSON.stringify(v);
    if (t === 'string') return JSON.stringify(v);
    if (t === 'bigint') return JSON.stringify(v.toString());
    if (t === 'function' || t === 'symbol') return JSON.stringify(String(v));
    // From here on, `v` is an object. Detect cycles.
    if (seen.has(v as object)) return '"[Circular]"';
    seen.add(v as object);
    if (v instanceof Date) return JSON.stringify(v.toISOString());
    if (Array.isArray(v)) {
      return '[' + v.map((x) => LLMCache.stableStringify(x, seen)).join(',') + ']';
    }
    if (v instanceof Map) {
      // Sort by key-string for determinism.
      const entries = Array.from(v.entries()).map(([k, vv]) => [k, vv] as [unknown, unknown]);
      entries.sort((a, b) => JSON.stringify(a[0]).localeCompare(JSON.stringify(b[0])));
      return '[' + entries.map(([k, vv]) => `${LLMCache.stableStringify(k, seen)}:${LLMCache.stableStringify(vv, seen)}`).join(',') + ']';
    }
    if (v instanceof Set) {
      const arr = Array.from(v).map((x) => LLMCache.stableStringify(x, seen));
      arr.sort();
      return '[' + arr.join(',') + ']';
    }
    // Plain object: sort keys.
    const obj = v as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    return '{' + keys.map((k) => `${JSON.stringify(k)}:${LLMCache.stableStringify(obj[k], seen)}`).join(',') + '}';
  }

  static keyOf(req: ChatParams): string {
    // M16 (W19): use the stable serialiser. `req.signal` is
    // deliberately excluded — an AbortSignal is mutable state, not
    // request identity.
    const { signal: _signal, ...rest } = req as ChatParams & { signal?: AbortSignal };
    return LLMCache.stableStringify(rest);
  }

  get size(): number { return this.map.size; }
  get hitCount(): number { return this.hits; }
  get missCount(): number { return this.misses; }

  get(key: string): ChatResponse | undefined {
    const entry = this.map.get(key);
    if (!entry) {
      this.misses += 1;
      return undefined;
    }
    if (entry.expiresAt < this.now()) {
      this.map.delete(key);
      this.misses += 1;
      return undefined;
    }
    // LRU: re-insert to mark as recently used.
    this.map.delete(key);
    this.map.set(key, { ...entry, insertedAt: this.now() });
    this.hits += 1;
    // H5 (W18): return a structural clone so callers can't mutate the
    // cached value in place. The previous code returned the same
    // reference every time, so a route that appended `usage` or
    // rearranged `toolCalls` on the response would silently poison
    // every subsequent cache hit. structuredClone preserves the
    // ChatResponse shape (including toolCalls, usage, content) bit-
    // exactly and is fast enough for our cache size.
    // M7 (W18): tag the cloned response with `cacheHit: true` so
    // downstream `TokenBudget` observers can avoid double-counting
    // tokens/cost when the cache is stacked under/over a budget.
    // L10 (W18): also stamp the cloned response with
    // `cachedAt: <insertedAt>`, so a downstream log/observability
    // path can tell the *age* of a cache hit (useful for SLO
    // analysis, e.g. "what fraction of hits are > 1 min stale?").
    // The value is the original insert epoch-millis.
    const cloned = structuredClone(entry.value);
    cloned.cacheHit = true;
    cloned.cachedAt = entry.insertedAt;
    return cloned;
  }

  set(key: string, value: ChatResponse): void {
    if (this.map.has(key)) this.map.delete(key);
    const entry: CacheEntry = {
      key,
      value,
      expiresAt: this.now() + this.ttlMs,
      insertedAt: this.now(),
    };
    this.map.set(key, entry);
    while (this.map.size > this.maxEntries) {
      // The first key in Map iteration order is the least-recently
      // used because we re-insert on get().
      const firstKey = this.map.keys().next().value;
      if (firstKey === undefined) break;
      this.map.delete(firstKey);
    }
  }

  has(key: string): boolean {
    const entry = this.map.get(key);
    if (!entry) return false;
    if (entry.expiresAt < this.now()) {
      this.map.delete(key);
      return false;
    }
    return true;
  }

  clear(): void {
    this.map.clear();
    this.hits = 0;
    this.misses = 0;
  }

  /**
   * Wrap an LLM port with this cache. The returned port proxies to
   * `port.chat()` for cache misses and short-circuits for hits.
   * Streaming is always passed through (uncached).
   */
  wrap(port: ILLMPort): ILLMPort {
    const cachedChat = async (req: ChatParams): Promise<unknown> => {
      const key = LLMCache.keyOf(req);
      const hit = this.get(key);
      if (hit) {
        // H11 (W19): respect the request's AbortSignal. A cache
        // hit is a synchronous-style return path — the cost of
        // re-running the LLM is replaced with a Map lookup, but
        // a client that has already disconnected should not
        // receive a "successful" response with content they
        // will never see. Without this check, a long-poll
        // client that times out while we were computing the
        // key would still get the full cached payload back and
        // (worse) the cache would still record the hit, so
        // subsequent retries would be falsely cache-hit.
        if (req.signal?.aborted) {
          throw new DOMException('Aborted', 'AbortError');
        }
        return hit;
      }
      const out = await port.chat(req);
      // H11b (W19): also check the abort signal *after* the
      // upstream call resolves but *before* we write to the
      // cache. If the client disconnected during the upstream
      // call, two bad things can happen if we don't check:
      //   1. We cache a response that no one will read this
      //      time around, polluting the LRU with an entry that
      //      was effectively "freed" (a later caller might see
      //      a stale, no-longer-wanted entry).
      //   2. We return the response to a dead caller, holding
      //      the event loop briefly while the GC collects the
      //      sockets — wasteful.
      // Throwing an `AbortError` here also matches what the
      // H11 cache-hit path does, so callers can handle both
      // cases the same way.
      if (req.signal?.aborted) {
        throw new DOMException('Aborted', 'AbortError');
      }
      this.set(key, out);
      return out;
    };
    return {
      chat: cachedChat as ILLMPort['chat'],
      // H12 (W19): cache `chatExact` too, using the same lookup
      // table. Without this, the AI route's `chatExact ?? chat`
      // branch would silently bypass the cache for the
      // "no-fallback" health-check path, leading to the same
      // request being billed twice (once via `chat`, once via
      // `chatExact`) and the cache hit-rate metric being wrong.
      chatExact: port.chatExact
        ? (async (req: ChatParams) => {
            const key = LLMCache.keyOf(req);
            const hit = this.get(key);
            if (hit) {
              if (req.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
              return hit;
            }
            const out = await port.chatExact!(req);
            // H11b (W19): same abort check as `chat` above — see
            // the rationale there.
            if (req.signal?.aborted) {
              throw new DOMException('Aborted', 'AbortError');
            }
            this.set(key, out);
            return out;
          })
        : undefined,
      stream: port.stream.bind(port),
      // Keep `this` bound to `port` so instance methods like
      // `getBreaker` on the underlying adapter keep working.
      listModels: ((...args: Parameters<ILLMPort['listModels']>) => port.listModels(...args)) as ILLMPort['listModels'],
      isAvailable: ((...args: Parameters<ILLMPort['isAvailable']>) => port.isAvailable(...args)) as ILLMPort['isAvailable'],
    };
  }
}
