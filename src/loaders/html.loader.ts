/**
 * HTML loader.
 *
 * Strips tags and decodes the most common entities, producing a plain
 * text representation. Script and style blocks are removed entirely.
 * Pure JS, no deps.
 */

import * as fs from 'node:fs/promises';
import type { Document, Loader } from '../ports/loader.port.js';

const ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&apos;': "'",
  '&#39;': "'",
  '&nbsp;': ' ',
  '&copy;': '(c)',
  '&reg;': '(r)',
};

function decodeEntities(s: string): string {
  return s.replace(/&[a-z#0-9]+;/gi, (m) => ENTITIES[m] ?? m);
}

export class HtmlLoader implements Loader {
  readonly extensions = ['.html', '.htm', '.xhtml'];

  async load(path: string): Promise<Document[]> {
    const raw = await fs.readFile(path, 'utf8');
    return this.parse(raw, path);
  }

  async loadBuffer(buf: Buffer): Promise<Document[]> {
    return this.parse(buf.toString('utf8'));
  }

  private parse(raw: string, source?: string): Document[] {
    let text = raw;
    // Strip script and style blocks.
    text = text.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ');
    text = text.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ');
    // Extract title.
    const titleMatch = text.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
    const title = titleMatch ? decodeEntities(titleMatch[1].trim()) : undefined;
    // Strip remaining tags.
    text = text.replace(/<[^>]+>/g, ' ');
    text = decodeEntities(text);
    // Collapse whitespace.
    text = text.replace(/\s+/g, ' ').trim();
    return [{ source, text, metadata: { path: source, title } }];
  }
}
