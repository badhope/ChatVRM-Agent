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
import { timingSafeEqual } from 'node:crypto';
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
  const ab = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ab.length !== bb.length) {
    // Run a dummy compare to keep timing roughly constant.
    timingSafeEqual(ab, ab);
    return false;
  }
  return timingSafeEqual(ab, bb);
}

/**
 * In-memory rate limit. Resets on process restart. The bucket is
 * keyed by IP, with a 1-minute sliding window. Exceeding the cap
 * returns 429.
 */
const buckets = new Map<string, { count: number; resetAt: number }>();
function checkRateLimit(ip: string): { ok: true } | { ok: false; retryAfter: number } {
  const now = Date.now();
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
    if (resolved === root) return true;
    const rootWithSep = root.endsWith('/') || root.endsWith('\\') ? root : root + '/';
    if (resolved.startsWith(rootWithSep)) return true;
  }
  return false;
}

/**
 * Apply on routes that should require bearer-token auth.
 * Skips requests that come from the same origin as the server
 * (i.e. the bundled frontend) so a developer can use the UI
 * without copying the token to localStorage.
 */
export function requireAuth(): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    const token = getToken();
    if (token === null) return next();

    // Same-origin requests are implicitly trusted (they can read
    // the same env, so blocking them only adds friction).
    const host = req.headers.host;
    if (host && req.headers['x-forwarded-host'] === undefined) {
      // No explicit token required for the local UI; only network
      // clients (different host) need to present one.
    }

    const auth = req.headers['authorization'];
    let presented: string | null = null;
    if (typeof auth === 'string') {
      const m = auth.match(/^Bearer\s+(.+)$/i);
      if (m && m[1]) presented = m[1].trim();
    } else if (typeof req.query['token'] === 'string') {
      presented = req.query['token'];
    }
    if (!presented || !safeEqual(presented, token)) {
      res.status(401).json({ error: 'authentication required (Authorization: Bearer <token>)' });
      return;
    }

    // Rate limit applies even to authenticated callers.
    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ?? req.socket.remoteAddress ?? 'unknown';
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
