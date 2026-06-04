/**
 * Recursive character text splitter.
 *
 * Mirrors LangChain's RecursiveCharacterTextSplitter: tries to split on
 * a list of separators from coarsest to finest, recursively descending
 * into chunks that are still too large. This keeps semantic units
 * (paragraphs, then sentences, then words) together whenever possible.
 *
 * Pure JS, no deps.
 */

export interface ChunkerOptions {
  /** Target chunk size in characters. Default 800. */
  chunkSize?: number;
  /** Overlap between consecutive chunks. Default 100. */
  chunkOverlap?: number;
  /** Length function. Default `s => s.length`. */
  lengthFunction?: (s: string) => number;
  /** Separators tried in order, most-preferred first. */
  separators?: string[];
}

export interface Chunk {
  text: string;
  index: number;
  start: number;
  end: number;
}

const DEFAULT_SEPARATORS = ['\n\n', '\n', '. ', '? ', '! ', '; ', ', ', ' ', ''];

export class RecursiveTextChunker {
  private readonly chunkSize: number;
  private readonly chunkOverlap: number;
  private readonly lengthFn: (s: string) => number;
  private readonly separators: string[];

  constructor(opts: ChunkerOptions = {}) {
    this.chunkSize = Math.max(1, opts.chunkSize ?? 800);
    this.chunkOverlap = Math.max(0, Math.min(opts.chunkOverlap ?? 100, this.chunkSize - 1));
    this.lengthFn = opts.lengthFunction ?? ((s: string) => s.length);
    this.separators = opts.separators ?? DEFAULT_SEPARATORS;
  }

  /** Split a single string into chunks. */
  split(text: string): Chunk[] {
    if (this.lengthFn(text) === 0) return [];
    const raw = this.recursiveSplit(text, this.separators);
    const merged = this.merge(raw);
    return merged;
  }

  /** Split a list of strings (e.g. one per page or per file). */
  splitAll(texts: string[]): Chunk[] {
    const out: Chunk[] = [];
    for (const t of texts) {
      for (const c of this.split(t)) out.push(c);
    }
    // Re-number sequentially.
    return out.map((c, i) => ({ ...c, index: i }));
  }

  private recursiveSplit(text: string, separators: string[]): string[] {
    if (this.lengthFn(text) <= this.chunkSize) {
      return [text];
    }
    const sep = separators[0];
    const remaining = separators.slice(1);
    if (sep === '' || remaining.length === 0) {
      // Hard cut.
      return this.hardCut(text);
    }
    const parts = text.split(sep);
    const out: string[] = [];
    let buf = '';
    for (const part of parts) {
      const piece = buf.length === 0 ? part : buf + sep + part;
      if (this.lengthFn(piece) <= this.chunkSize) {
        buf = piece;
      } else {
        if (buf.length > 0) {
          out.push(buf);
          buf = '';
        }
        if (this.lengthFn(part) > this.chunkSize) {
          // Recurse on the part with the next-finer separator.
          out.push(...this.recursiveSplit(part, remaining));
        } else {
          buf = part;
        }
      }
    }
    if (buf.length > 0) out.push(buf);
    return out;
  }

  private hardCut(text: string): string[] {
    const out: string[] = [];
    const step = this.chunkSize - this.chunkOverlap;
    for (let i = 0; i < text.length; i += step) {
      out.push(text.substring(i, i + this.chunkSize));
    }
    return out;
  }

  private merge(raw: string[]): Chunk[] {
    const out: Chunk[] = [];
    let buf = '';
    let bufStart = 0;
    let cursor = 0;
    for (const piece of raw) {
      if (this.lengthFn(buf) + this.lengthFn(piece) + (buf ? 1 : 0) > this.chunkSize && buf.length > 0) {
        out.push({ text: buf, index: out.length, start: bufStart, end: cursor });
        // Overlap: keep tail of buf if overlap > 0.
        if (this.chunkOverlap > 0) {
          const tail = buf.substring(Math.max(0, buf.length - this.chunkOverlap));
          buf = tail;
          bufStart = cursor - tail.length;
        } else {
          buf = '';
          bufStart = cursor;
        }
      }
      if (buf.length > 0) buf += ' ';
      buf += piece;
      cursor += piece.length + 1;
    }
    if (buf.length > 0) {
      out.push({ text: buf, index: out.length, start: bufStart, end: cursor });
    }
    return out;
  }
}
