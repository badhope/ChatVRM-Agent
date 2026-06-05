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
 */
import { resolve as resolveNodePath, sep } from 'node:path';

export function sandboxPath(
  inputPath: string,
  opts: { allowAbsolute?: boolean } = {},
): { ok: true; resolved: string } | { ok: false; error: string } {
  if (typeof inputPath !== 'string' || inputPath.length === 0) {
    return { ok: false, error: 'path is required' };
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
  return { ok: true, resolved };
}
