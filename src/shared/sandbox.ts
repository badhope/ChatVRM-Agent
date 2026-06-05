/**
 * Sandbox helper for LLM-supplied paths.
 *
 * Exported separately so server tools and unit tests can share the
 * same path-resolving logic. Resolves `inputPath` against the
 * workspace root and rejects anything that escapes the root. LLM-
 * supplied paths (via tool args) get funneled through here so a
 * prompt-injection attack cannot read or write `/etc/passwd`,
 * `~/.ssh/id_rsa`, etc.
 *
 * The root is taken from `WORKSPACE_ROOT` env, falling back to
 * `process.cwd()`. Both the absolute and resolved paths are checked
 * with a trailing-separator prefix to prevent the classic
 * `/foo/bar` vs `/foo/barbaz` escape.
 *
 * H4 (W18): in addition to the local WORKSPACE_ROOT check, the
 * resolved path is also validated against the wider workspace root
 * allowlist (PA_WORKSPACE_ROOTS) when set. This catches the case
 * where a tool runs in /tmp/a but the user explicitly whitelisted
 * /tmp/b; the old code only checked the cwd-equivalent root, so
 * legitimate paths outside cwd but inside the allowlist would be
 * rejected, and a cwd-only /tmp/ would silently let an attacker
 * write to /tmp/a/something.
 */
/**
 * L2 (W18): the default workspace root, used when neither
 * `WORKSPACE_ROOT` nor `PA_WORKSPACE_ROOTS` is set. We default to
 * `~/.personal-assistant/workspace` instead of `process.cwd()` so
 * a server started in `/` (e.g. by a Docker entrypoint or a
 * misconfigured systemd unit) doesn't make the entire filesystem
 * "in-workspace". The directory is created lazily — we just
 * *return* the path; actual file ops will surface ENOENT if the
 * directory is missing. The fallback only applies when the
 * `allowAbsolute` option is set; relative paths still resolve
 * against the env-supplied `WORKSPACE_ROOT` or `cwd`.
 */
import { resolve as resolveNodePath, sep } from 'node:path';
import { homedir } from 'node:os';

const ROOTS_ENV = 'PA_WORKSPACE_ROOTS';

function defaultWorkspaceRoot(): string {
  return resolveNodePath(homedir(), '.personal-assistant', 'workspace');
}

function getWorkspaceRoots(): string[] {
  const raw = process.env[ROOTS_ENV];
  const fallback = defaultWorkspaceRoot();
  if (!raw || raw.length === 0) return [fallback];
  return raw
    .split(process.platform === 'win32' ? ';' : ':')
    .map((p) => resolveNodePath(p.trim()))
    .filter((p) => p.length > 0);
}

function isPathUnderRoots(p: string, roots: string[]): boolean {
  const resolved = resolveNodePath(p);
  for (const root of roots) {
    const cmp = process.platform === 'win32' ? resolved.toLowerCase() : resolved;
    const rootCmp = process.platform === 'win32' ? root.toLowerCase() : root;
    if (cmp === rootCmp) return true;
    const rootWithSep = rootCmp.endsWith('/') || rootCmp.endsWith('\\') ? rootCmp : rootCmp + sep;
    if (cmp.startsWith(rootWithSep)) return true;
  }
  return false;
}

export function sandboxPath(
  inputPath: string,
  opts: { allowAbsolute?: boolean } = {},
): { ok: true; resolved: string } | { ok: false; error: string } {
  if (typeof inputPath !== 'string' || inputPath.length === 0) {
    return { ok: false, error: 'path is required' };
  }
  // W17 M8: POSIX file systems terminate strings at NUL. A path like
  // `good/../etc/passwd\0.png` would be accepted by `path.resolve()`
  // (which just treats the NUL as a regular char on non-Node-native
  // layers) and then truncated by the kernel to `/etc/passwd` once it
  // reaches the syscall. Reject the path early.
  if (inputPath.indexOf('\0') !== -1) {
    return { ok: false, error: 'path contains NUL byte' };
  }
  const root = resolveNodePath(process.env['WORKSPACE_ROOT'] ?? process.cwd());
  const resolved = resolveNodePath(root, inputPath);
  // trailing-separator prefix prevents the `/foo/bar` vs `/foo/barbaz` trick
  const rootWithSep = root.endsWith(sep) ? root : root + sep;
  if (resolved !== root && !resolved.startsWith(rootWithSep)) {
    if (!opts.allowAbsolute || !resolved.startsWith(sep)) {
      return { ok: false, error: `path escapes workspace root: ${inputPath}` };
    }
  }
  // H4 (W18): also reject paths that escape the wider allowlist set
  // by PA_WORKSPACE_ROOTS. Without this, an attacker who can control
  // WORKSPACE_ROOT via a config bug could redirect tool writes to an
  // arbitrary directory; the allowlist enforces the operator's stated
  // intent regardless of which root the run claims.
  if (opts.allowAbsolute && resolved.startsWith(sep)) {
    const roots = getWorkspaceRoots();
    if (!isPathUnderRoots(resolved, roots)) {
      return { ok: false, error: `path outside allowlisted workspace roots: ${inputPath}` };
    }
  }
  return { ok: true, resolved };
}
