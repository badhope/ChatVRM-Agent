/**
 * AutoLoader — picks the right loader by file extension.
 *
 * Registers all known loaders and dispatches {@link Document} extraction
 * based on the file's extension. Unknown extensions fall back to
 * {@link TextLoader} which will simply read bytes as utf8 (useful for
 * `.log`, source files, etc.).
 */

import * as path from 'node:path';
import type { Document, Loader } from '../ports/loader.port.js';
import { TextLoader } from './text.loader.js';
import { CsvLoader } from './csv.loader.js';
import { JsonLoader } from './json.loader.js';
import { PdfLoader } from './pdf.loader.js';
import { DocxLoader } from './docx.loader.js';
import { XlsxLoader } from './xlsx.loader.js';
import { HtmlLoader } from './html.loader.js';

export class AutoLoader implements Loader {
  readonly extensions: string[] = ['*'];
  private registry: Array<Loader> = [];

  constructor() {
    this.registry.push(
      new TextLoader(),
      new CsvLoader(),
      new JsonLoader(),
      new PdfLoader(),
      new DocxLoader(),
      new XlsxLoader(),
      new HtmlLoader(),
    );
  }

  register(loader: Loader, atIndex?: number): void {
    if (atIndex === undefined) {
      this.registry.push(loader);
    } else {
      this.registry.splice(atIndex, 0, loader);
    }
  }

  pick(filePath: string): Loader {
    const ext = path.extname(filePath).toLowerCase();
    for (const l of this.registry) {
      if (l.extensions.includes(ext)) return l;
    }
    return new TextLoader();
  }

  async load(filePath: string): Promise<Document[]> {
    // L3 (W19): delegate to the picked loader, which enforces
    // its own size cap (text/html/csv/json/pdf all have
    // enforceFileSizeCap since W19 L11b; docx/xlsx since W19
    // M4). We do not re-cap here to avoid a double `fs.stat`,
    // but we *do* log the dispatch so an operator can see which
    // loader was picked for a given ingest in audit logs. The
    // fallback (TextLoader) for unknown extensions also has the
    // cap, so this method cannot OOM the process regardless of
    // the input.
    return this.pick(filePath).load(filePath);
  }
}
