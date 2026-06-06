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
    // Strip comments and CDATA sections.
    text = text.replace(/<!--[\s\S]*?-->/g, ' ');
    text = text.replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, ' ');
    // Strip script and style blocks.
    // L4 (W19): a self-closing tag like `<script src=.../>`
    // (XHTML-style) is intentionally NOT matched by the regex
    // below — it has no `</script>` end, so the block-replace is
    // a no-op for that element. The pre-W19 loader would happily
    // leave the entire body of an XHTML page in the chunk text
    // if every `<script/>` was self-closed (some embedded
    // template engines emit that form). The mitigation here is
    // a follow-up tag-strip: even if a `<script src=.../>` slips
    // through, the generic `<[^>]+>` replace at line 52 will
    // remove the tag. Note that the *contents* of any inline
    // `<script src=...>...</script>` would still be in the text
    // — operators should consider pre-processing XHTML inputs.
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
