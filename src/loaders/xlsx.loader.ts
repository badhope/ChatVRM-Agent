/**
 * XLSX (Excel) loader.
 *
 * Uses the `xlsx` package (SheetJS) to read all sheets and produce one
 * {@link Document} per sheet. Install with:
 *
 *     npm install xlsx
 *
 * The sheet is rendered as a CSV-like string of `header: cell` rows
 * so the chunker can split on newlines the same way it does for CSV.
 */

import * as fs from 'node:fs/promises';
import type { Document, Loader } from '../ports/loader.port.js';

interface Sheet2JsonOpts {
  header?: number | string[];
  defval?: string;
  raw?: boolean;
  blankrows?: boolean;
}

interface XLSXModule {
  read(data: Buffer | ArrayBuffer, opts: { type: 'buffer' }): {
    SheetNames: string[];
    Sheets: Record<string, Record<string, unknown>>;
  };
  utils: {
    sheet_to_json(sheet: unknown, opts?: Sheet2JsonOpts): Array<Record<string, unknown>>;
  };
}

async function importXlsx(): Promise<XLSXModule> {
  try {
    return (await import('xlsx')) as unknown as XLSXModule;
  } catch {
    throw new Error('XLSX loader requires `xlsx`. Install with: npm install xlsx');
  }
}

export class XlsxLoader implements Loader {
  readonly extensions = ['.xlsx', '.xls', '.xlsm', '.xlsb'];

  async load(path: string): Promise<Document[]> {
    const buf = await fs.readFile(path);
    return this.parse(buf, path);
  }

  async loadBuffer(buf: Buffer): Promise<Document[]> {
    return this.parse(buf);
  }

  private async parse(buf: Buffer, source?: string): Promise<Document[]> {
    const xlsx = await importXlsx();
    const wb = xlsx.read(buf, { type: 'buffer' });
    const docs: Document[] = [];
    for (const name of wb.SheetNames) {
      const sheet = wb.Sheets[name];
      if (!sheet) continue;
      const rows = xlsx.utils.sheet_to_json(sheet, { defval: '', raw: false, blankrows: false });
      if (rows.length === 0) {
        docs.push({
          source,
          locator: `sheet:${name}`,
          text: '',
          metadata: { sheet: name, rowCount: 0 },
        });
        continue;
      }
      const headers = Object.keys(rows[0] as Record<string, unknown>);
      const text = rows
        .map((row, idx) => {
          const r = row as Record<string, unknown>;
          return `row ${idx + 1}: ` + headers.map((h) => `${h}=${r[h] ?? ''}`).join(' | ');
        })
        .join('\n');
      docs.push({
        source,
        locator: `sheet:${name}`,
        text,
        metadata: { sheet: name, rowCount: rows.length, headers },
      });
    }
    return docs;
  }
}
