/**
 * CSV loader.
 *
 * Treats each row as one {@link Document} (text = serialized row). The
 * header row is captured in metadata so downstream prompts can label
 * columns. Handles quoted fields, escaped quotes, and CRLF line endings.
 *
 * Pure JS — no `papaparse` dep. Big CSVs are streamed via readline would
 * be a future improvement; for now we read the whole file (CSV files
 * shipped to personal-assistant are <10 MB in practice).
 */

import * as fs from 'node:fs/promises';
import type { Document, Loader } from '../ports/loader.port.js';
import { enforceBufferSizeCap, enforceFileSizeCap } from './size-cap.js';

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        row.push(cell);
        cell = '';
      } else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && text[i + 1] === '\n') i++;
        row.push(cell);
        cell = '';
        if (row.some((c) => c.length > 0)) rows.push(row);
        row = [];
      } else {
        cell += ch;
      }
    }
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    if (row.some((c) => c.length > 0)) rows.push(row);
  }
  return rows;
}

export class CsvLoader implements Loader {
  readonly extensions = ['.csv', '.tsv'];
  /** When true, treat first row as header. Default true. */
  readonly hasHeader: boolean;

  constructor(hasHeader: boolean = true) {
    this.hasHeader = hasHeader;
  }

  async load(path: string): Promise<Document[]> {
    // L11b (W19): share the size cap. CSVs grow large quickly
    // (a million-row export is not unusual), so the cap
    // defaults to 25 MB but operators can set
    // `PA_CSV_LOADER_MAX_BYTES` to raise it.
    await enforceFileSizeCap(path, { envVar: 'PA_CSV_LOADER_MAX_BYTES' });
    const text = await fs.readFile(path, 'utf8');
    return this.parse(text, path);
  }

  async loadBuffer(buf: Buffer): Promise<Document[]> {
    enforceBufferSizeCap(buf, { envVar: 'PA_CSV_LOADER_MAX_BYTES' });
    return this.parse(buf.toString('utf8'));
  }

  private parse(text: string, source?: string): Document[] {
    const normalized = this.extensions.includes('.tsv') ? text.replace(/\t/g, ',') : text;
    const rows = parseCsv(normalized);
    if (rows.length === 0) return [];
    let headers: string[];
    let dataRows: string[][];
    if (this.hasHeader) {
      headers = rows[0].map((h, i) => h.trim() || `col_${i + 1}`);
      dataRows = rows.slice(1);
    } else {
      headers = rows[0].map((_, i) => `col_${i + 1}`);
      dataRows = rows;
    }
    return dataRows.map((r, idx) => ({
      source,
      locator: `row:${idx + 1}`,
      text: r.map((c, i) => `${headers[i]}: ${c}`).join(' | '),
      metadata: { row: idx + 1, headers, cells: r },
    }));
  }
}
