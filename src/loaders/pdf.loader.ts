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
    const result = await parse(buf);
    const text: string = result.text ?? '';
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
