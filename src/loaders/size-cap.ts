/**
 * Shared size cap helper for the loader family.
 *
 * L11b (W19): the pre-W19 code only capped `text.loader.ts`,
 * which meant a malicious user could submit a 1 GB JSON or PDF
 * and OOM the process by going through one of the *other*
 * loaders (which all did `fs.readFile` with no size check).
 * The cap is now a single shared helper so every loader applies
 * the same budget, and operators raise the ceiling by setting
 * one env var (`PA_LOADER_MAX_BYTES`) instead of having to know
 * about five separate ones.
 *
 * The cap is opt-out via `disabled: true` — loaders that need
 * to accept binary inputs (e.g. PDF) use the same helper but
 * may pass a higher cap or disable it.
 */

import * as fs from 'node:fs/promises';

const DEFAULT_CAP_BYTES = 25 * 1024 * 1024; // 25 MB

export interface SizeCapOptions {
  envVar?: string;
  defaultCapBytes?: number;
  /** Disable the cap (returns immediately). Used for the
   *  buffer entry-point when the caller has already bounded
   *  the input. */
  disabled?: boolean;
}

export function resolveSizeCap(opts: SizeCapOptions = {}): number {
  if (opts.disabled) return Number.POSITIVE_INFINITY;
  const envName = opts.envVar ?? 'PA_LOADER_MAX_BYTES';
  const fallback = opts.defaultCapBytes ?? DEFAULT_CAP_BYTES;
  const raw = process.env[envName];
  if (raw === undefined) return fallback;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return n;
}

export async function enforceFileSizeCap(
  path: string,
  opts: SizeCapOptions = {},
): Promise<void> {
  const cap = resolveSizeCap(opts);
  if (!Number.isFinite(cap)) return;
  const stat = await fs.stat(path);
  if (stat.size > cap) {
    const envName = opts.envVar ?? 'PA_LOADER_MAX_BYTES';
    throw new Error(
      `loader: file ${path} is ${stat.size} bytes, exceeds the ${cap}-byte cap ` +
        `(set ${envName} to raise).`,
    );
  }
}

export function enforceBufferSizeCap(
  buf: Buffer,
  opts: SizeCapOptions = {},
): void {
  const cap = resolveSizeCap(opts);
  if (!Number.isFinite(cap)) return;
  if (buf.length > cap) {
    const envName = opts.envVar ?? 'PA_LOADER_MAX_BYTES';
    throw new Error(
      `loader: buffer is ${buf.length} bytes, exceeds the ${cap}-byte cap ` +
        `(set ${envName} to raise).`,
    );
  }
}
