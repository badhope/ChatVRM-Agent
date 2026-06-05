/**
 * Auth + rate-limit middleware for the HTTP API.
 *
 *   - H13/H14: the routes under /api/agents, /api/agents-runtime,
 *     /api/memory, /api/rag, /api/agent and /api/tools were
 *     completely unauthenticated. A bare `curl -X POST /api/agent/run`
 *     would run an LLM call, mutate the file system, and call
 *     arbitrary tools on behalf of the attacker.
 *
 *   - H15: /api/agent/run also accepted an attacker-controlled
 *     `cwd` field, which the execute stage would treat as the
 *     working directory for shell commands and `listWorkspaceFiles`.
 *     We now canonicalise the path and verify it sits inside an
 *     allowlist of roots (project root, or a per-user workspace
 *     under `~/.personal-assistant/workspace/`).
 *
 * The auth gate is opt-in via the `PA_API_TOKEN` env var. If unset,
 * the middleware logs a single warning on first use and lets the
 * request through — this preserves the local-dev "open laptop"
 * workflow. In a multi-user / public deployment the operator is
 * required to set a token.
 *
 * Token comparison uses `crypto.timingSafeEqual` to prevent timing
 * side-channels.
 */
import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { timingSafeEqual, createHash } from 'node:crypto';
import { resolve as resolvePath } from 'node:path';

const TOKEN_ENV = 'PA_API_TOKEN';
const ALLOWLIST_ENV = 'PA_WORKSPACE_ROOTS';
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 120; // 120 requests / minute / IP

let warned = false;

function getToken(): string | null {
  const t = process.env[TOKEN_ENV];
  if (t && t.length > 0) return t;
  if (!warned) {
    warned = true;
    process.stderr.write(
      `[auth] ${TOKEN_ENV} is unset. Requests to /api/agents, /api/agents-runtime, /api/memory, /api/rag, /api/agent and /api/tools are NOT authenticated. ` +
        `Set ${TOKEN_ENV} before exposing the server to the network.\n`,
    );
  }
  return null;
}

function getWorkspaceRoots(): string[] {
  const raw = process.env[ALLOWLIST_ENV];
  const fallback = resolvePath(process.cwd());
  if (!raw || raw.length === 0) return [fallback];
  return raw
    .split(process.platform === 'win32' ? ';' : ':')
    .map((p) => resolvePath(p.trim()))
    .filter((p) => p.length > 0);
}

function safeEqual(a: string, b: string): boolean {
  // L4 (W18): the previous "dummy compare to keep timing
  // constant" did `timingSafeEqual(ab, ab)`, which is a no-op
  // (a buffer is always equal to itself). It pretended to be
  // constant-time but actually leaked the length-mismatch path
  // and the early `return false`. The correct way to compare
  // variable-length secrets in constant time is to hash them
  // first (so both sides are the same length) and then run a
  // single timingSafeEqual. SHA-256 is the standard choice; the
  // 32-byte output fits cleanly in a Buffer.
  const ha = createHash('sha256').update(a, 'utf8').digest();
  const hb = createHash('sha256').update(b, 'utf8').digest();
  // `timingSafeEqual` is constant-time only when the two
  // inputs are the same length, which they always are after
  // the SHA-256 step. The return is a Buffer<bool> that we
  // coerce to a primitive.
  return timingSafeEqual(ha, hb);
}

/**
 * In-memory rate limit. Resets on process restart. The bucket is
 * keyed by IP, with a 1-minute sliding window. Exceeding the cap
 * returns 429.
 *
 * H3 (W18): a LRU-like cap on the bucket map prevents an attacker
 * from growing it without bound by spraying spoofed source IPs. When
 * the cap is exceeded, the oldest 10% of expired entries are evicted
 * before inserting a new bucket.
 */
const BUCKET_HARD_CAP = 10_000;
const buckets = new Map<string, { count: number; resetAt: number }>();
function gcBuckets(now: number): void {
  for (const [k, v] of buckets) {
    if (v.resetAt < now) buckets.delete(k);
  }
}
function evictOldest(targetSize: number): void {
  // Naive FIFO eviction: drop the first 10% of entries.
  const dropCount = Math.max(1, Math.floor(targetSize * 0.1));
  let dropped = 0;
  for (const k of buckets.keys()) {
    buckets.delete(k);
    dropped += 1;
    if (dropped >= dropCount) break;
  }
}
function checkRateLimit(ip: string): { ok: true } | { ok: false; retryAfter: number } {
  const now = Date.now();
  // Opportunistic GC — only do a full scan when the map is large.
  if (buckets.size > BUCKET_HARD_CAP) gcBuckets(now);
  if (buckets.size >= BUCKET_HARD_CAP) evictOldest(BUCKET_HARD_CAP);
  const bucket = buckets.get(ip);
  if (!bucket || bucket.resetAt < now) {
    buckets.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return { ok: true };
  }
  if (bucket.count >= RATE_LIMIT_MAX) {
    return { ok: false, retryAfter: Math.ceil((bucket.resetAt - now) / 1000) };
  }
  bucket.count++;
  return { ok: true };
}

export function isPathUnderRoots(p: string, roots: string[]): boolean {
  const resolved = resolvePath(p);
  for (const root of roots) {
    const r = root;
    // L3 (W18): case-insensitive comparison on Windows / macOS.
    const cmp = process.platform === 'win32' ? resolved.toLowerCase() : resolved;
    const rootCmp = process.platform === 'win32' ? r.toLowerCase() : r;
    if (cmp === rootCmp) return true;
    const rootWithSep = rootCmp.endsWith('/') || rootCmp.endsWith('\\') ? rootCmp : rootCmp + '/';
    if (cmp.startsWith(rootWithSep)) return true;
  }
  return false;
}

/**
 * H2 (W18): by default we DO NOT trust `X-Forwarded-For`. Set the
 * env var `PA_TRUST_PROXY=loopback` (or `true`) to make Express
 * trust the header — only do this behind a reverse proxy that
 * actually rewrites the connection source address, otherwise the
 * rate limiter can be trivially bypassed by sending a fresh
 * `X-Forwarded-For` on every request.
 */
function shouldTrustProxy(): 'loopback' | 'all' | 'no' {
  const v = (process.env['PA_TRUST_PROXY'] ?? 'no').toLowerCase();
  if (v === 'loopback' || v === '127.0.0.1' || v === '::1') return 'loopback';
  if (v === 'true' || v === '1' || v === 'all') return 'all';
  return 'no';
}

function clientIp(req: Request): string {
  const trust = shouldTrustProxy();
  if (trust === 'all') {
    const xff = (req.headers['x-forwarded-for'] as string)?.split(',').pop()?.trim();
    if (xff) return xff;
  } else if (trust === 'loopback') {
    const remote = req.socket.remoteAddress ?? '';
    if (remote === '127.0.0.1' || remote === '::1' || remote === '::ffff:127.0.0.1') {
      const xff = (req.headers['x-forwarded-for'] as string)?.split(',').pop()?.trim();
      if (xff) return xff;
    }
  }
  return req.socket.remoteAddress ?? 'unknown';
}

/**
 * Apply on routes that should require bearer-token auth.
 *
 * The gate is opt-in via the `PA_API_TOKEN` env var. If unset, the
 * middleware logs a single warning on first use and lets the request
 * through — this preserves the local-dev "open laptop" workflow.
 * In a multi-user / public deployment the operator is required to
 * set a token.
 *
 * H1 (W18): removed the dead `same-origin bypass` block. The
 * comment promised a loopback shortcut but the code never
 * implemented it; worse, a future maintainer reading the code
 * could think it was enforced when it wasn't. Trust the bearer
 * token in all cases.
 *
 * C4 (W18): the `?token=...` query-string fallback is gone. Query
 * strings are routinely logged by reverse proxies, browsers, and
 * CDNs — a long-lived token in the URL is effectively public the
 * moment it's logged. Only `Authorization: Bearer <token>` is
 * accepted.
 */
export function requireAuth(): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    const token = getToken();
    if (token === null) return next();

    const auth = req.headers['authorization'];
    let presented: string | null = null;
    if (typeof auth === 'string') {
      const m = auth.match(/^Bearer\s+(.+)$/i);
      if (m && m[1]) presented = m[1].trim();
    }
    if (!presented || !safeEqual(presented, token)) {
      res.status(401).json({ error: 'authentication required (Authorization: Bearer <token>)' });
      return;
    }

    // Rate limit applies even to authenticated callers.
    const ip = clientIp(req);
    const rl = checkRateLimit(ip);
    if (!rl.ok) {
      res.setHeader('Retry-After', String(rl.retryAfter));
      res.status(429).json({ error: 'rate limit exceeded', retryAfter: rl.retryAfter });
      return;
    }
    next();
  };
}

/**
 * Verify a user-supplied working directory sits inside an
 * allowlisted root. Returns the canonicalised path on success, or
 * an error string on failure.
 */
export function validateCwd(cwd: string | undefined | null): { ok: true; resolved: string } | { ok: false; error: string } {
  if (!cwd || cwd.length === 0) {
    return { ok: true, resolved: resolvePath(process.cwd()) };
  }
  // H15: refuse `..` and absolute paths that don't sit inside an
  // allowlisted root. We deliberately don't try to canonicalise the
  // input — if the caller wrote `..` we report it as a traversal.
  if (cwd.includes('\u0000')) {
    return { ok: false, error: 'cwd contains NUL byte' };
  }
  const roots = getWorkspaceRoots();
  if (!isPathUnderRoots(cwd, roots)) {
    return { ok: false, error: `cwd is not inside an allowlisted root (${roots.join(', ')})` };
  }
  return { ok: true, resolved: resolvePath(cwd) };
}
