/**
 * PDF loader.
 *
 * Uses the popular `pdf-parse` package (lazy-imported). Install with:
 *
 *     npm install pdf-parse
 *
 * Each page becomes one {@link Document} so downstream chunks carry
 * page metadata. If the package is missing, `load()` throws a clear
 * install hint.
 */

import * as fs from 'node:fs/promises';
import type { Document, Loader } from '../ports/loader.port.js';

interface PdfParseResult {
  numpages: number;
  numrender: number;
  info: Record<string, unknown>;
  metadata: Record<string, unknown> | null;
  text: string;
}

type PdfParseFn = (buf: Buffer, opts?: Record<string, unknown>) => Promise<PdfParseResult>;

async function importPdfParse(): Promise<PdfParseFn> {
  let mod: { default?: PdfParseFn } & Record<string, unknown>;
  try {
    // pdf-parse is a CJS module whose default export is the function.
    mod = (await import('pdf-parse')) as { default?: PdfParseFn } & Record<string, unknown>;
  } catch {
    throw new Error(
      'PDF loader requires `pdf-parse`. Install with: npm install pdf-parse',
    );
  }
  const fn = (mod as { default?: PdfParseFn }).default ?? (mod as unknown as PdfParseFn);
  if (typeof fn !== 'function') {
    throw new Error('pdf-parse: unexpected module shape (no function export)');
  }
  return fn;
}

export class PdfLoader implements Loader {
  readonly extensions = ['.pdf'];
  /** When true, split output into per-page documents. Default true. */
  readonly perPage: boolean;

  constructor(perPage: boolean = true) {
    this.perPage = perPage;
  }

  async load(path: string): Promise<Document[]> {
    const buf = await fs.readFile(path);
    return this.parse(buf, path);
  }

  async loadBuffer(buf: Buffer): Promise<Document[]> {
    return this.parse(buf);
  }

  private async parse(buf: Buffer, source?: string): Promise<Document[]> {
    const parse = await importPdfParse();
    // L12 (W19): surface parse failures. The pre-W19 code did
    // `await parse(buf)` and the surrounding route handler
    // would log a generic "PDF load failed". The user had no
    // way to distinguish a "malformed PDF" from a "permission
    // error" or an "out-of-memory parser crash". We now log
    // the structured `result` and let the original error
    // propagate, and add a minimal sanity check (the parser
    // returning `numpages: 0` is a clear sign that the file
    // was not parsed as a PDF).
    let result: PdfParseResult;
    try {
      result = await parse(buf);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // Surface the source path in the error so an operator
      // staring at a log line knows which document is the
      // problem. Don't replace the error — re-throw with the
      // original cause attached.
      const wrapped = new Error(`pdf loader: failed to parse ${source ?? '<buffer>'}: ${msg}`);
      (wrapped as Error & { cause?: unknown }).cause = err;
      throw wrapped;
    }
    const text: string = result.text ?? '';
    // L12 (W19): catch the silent-empty-page case. A
    // password-protected PDF or a non-PDF file (e.g. someone
    // renamed a .jpg to .pdf) can produce a `numpages: 0`
    // result. The pre-W19 loader would happily return an
    // empty `Document[]` and the chunker would then have
    // nothing to embed — the user would see a successful
    // ingestion that retrieved 0 chunks. Throw instead so the
    // route handler returns 500 with a useful message.
    if (typeof result.numpages === 'number' && result.numpages <= 0) {
      throw new Error(
        `pdf loader: ${source ?? '<buffer>'} parsed to 0 pages (corrupted, encrypted, or non-PDF?)`,
      );
    }
    if (!this.perPage) {
      return [
        {
          source,
          text,
          metadata: {
            numPages: result.numpages,
            info: result.info,
            pdfMetadata: result.metadata,
          },
        },
      ];
    }
    // pdf-parse appends form-feed (\f) between pages.
    const pages = text.split('\f');
    return pages
      .map((p, idx) => ({ page: idx + 1, text: p.trim() }))
      .filter((p) => p.text.length > 0)
      .map((p) => ({
        source,
        locator: `page:${p.page}`,
        text: p.text,
        metadata: { page: p.page, numPages: result.numpages, info: result.info },
      }));
  }
}
