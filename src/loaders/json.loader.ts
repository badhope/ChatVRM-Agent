/**
 * JSON loader.
 *
 * Flattens JSON into a sequence of {@link Document}s. Supports:
 *   - array of objects           -> one document per object
 *   - { items: [...] }           -> same
 *   - arbitrary object tree      -> one document = JSON.stringify of the tree
 *   - JSONL / NDJSON (per line)  -> one document per line
 *
 * The shape is auto-detected from the file extension when `load(path)`
 * is used; for `loadBuffer` the caller can pass an explicit `format`:
 * `'auto' | 'json' | 'jsonl'` (default `'auto'`, which falls back to
 * JSONL if the input is one-JSON-per-line and otherwise parses as a
 * single JSON value).
 *
 * For object-shaped records, each field is rendered as `key: value` so
 * the chunker can split cleanly. Nested objects are stringified.
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { Document, Loader } from '../ports/loader.port.js';

export type JsonFormat = 'auto' | 'json' | 'jsonl';

export class JsonLoader implements Loader {
  readonly extensions = ['.json', '.jsonl', '.ndjson'];

  async load(filePath: string): Promise<Document[]> {
    const text = await fs.readFile(filePath, 'utf8');
    const ext = path.extname(filePath).toLowerCase();
    const format: JsonFormat =
      ext === '.jsonl' || ext === '.ndjson' ? 'jsonl' : 'json';
    return this.parse(text, format, filePath);
  }

  async loadBuffer(buf: Buffer, format: JsonFormat = 'auto'): Promise<Document[]> {
    return this.parse(buf.toString('utf8'), format);
  }

  private parse(text: string, format: JsonFormat, source?: string): Document[] {
    const trimmed = text.trim();
    if (!trimmed) return [];

    if (format === 'jsonl') {
      return this.parseJsonl(trimmed, source);
    }
    if (format === 'json') {
      return this.parseJson(trimmed, source);
    }
    // auto: peek for JSONL shape (one '{' or '[' per line, multiple lines).
    const lines = trimmed.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (lines.length >= 2 && lines.every((l) => /^\s*[\[{]/.test(l))) {
      return this.parseJsonl(trimmed, source);
    }
    return this.parseJson(trimmed, source);
  }

  private parseJsonl(trimmed: string, source?: string): Document[] {
    const docs: Document[] = [];
    const lines = trimmed.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      try {
        const obj = JSON.parse(line) as unknown;
        docs.push({
          source,
          locator: `line:${i + 1}`,
          text: renderObject(obj),
          metadata: { line: i + 1 },
        });
      } catch {
        docs.push({
          source,
          locator: `line:${i + 1}`,
          text: line,
          metadata: { line: i + 1, parseError: true },
        });
      }
    }
    return docs;
  }

  private parseJson(trimmed: string, source?: string): Document[] {
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch (err) {
      return [{ source, text: trimmed, metadata: { parseError: true, error: String(err) } }];
    }

    if (Array.isArray(parsed)) {
      return parsed.map((item, idx) => ({
        source,
        locator: `item:${idx}`,
        text: renderObject(item),
        metadata: { index: idx },
      }));
    }

    if (parsed && typeof parsed === 'object') {
      const obj = parsed as Record<string, unknown>;
      if (Array.isArray(obj.items)) {
        return obj.items.map((item: unknown, idx: number) => ({
          source,
          locator: `items[${idx}]`,
          text: renderObject(item),
          metadata: { index: idx },
        }));
      }
      if (Array.isArray(obj.documents)) {
        return (obj.documents as unknown[]).map((item: unknown, idx: number) => ({
          source,
          locator: `documents[${idx}]`,
          text: renderObject(item),
          metadata: { index: idx },
        }));
      }
    }

    return [{ source, text: renderObject(parsed), metadata: { kind: typeof parsed } }];
  }
}

function renderObject(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (Array.isArray(v)) {
    return v.map((x) => renderObject(x)).filter((s) => s.length > 0).join('\n');
  }
  if (typeof v === 'object') {
    const obj = v as Record<string, unknown>;
    return Object.entries(obj)
      .map(([k, val]) => {
        const rendered = renderObject(val);
        if (!rendered) return null;
        if (typeof val === 'string') return `${k}: ${val}`;
        return `${k}:\n${rendered}`;
      })
      .filter((s): s is string => s !== null)
      .join('\n');
  }
  return String(v);
}
