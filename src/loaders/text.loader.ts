/**
 * Plain-text loader. Handles .txt, .md, and any other text-like file
 * when the extension matches.
 */

import * as fs from 'node:fs/promises';
import type { Document, Loader } from '../ports/loader.port.js';

export class TextLoader implements Loader {
  readonly extensions: string[];

  constructor(extensions: string[] = ['.txt', '.md', '.markdown', '.log']) {
    this.extensions = extensions;
  }

  async load(path: string): Promise<Document[]> {
    // L11 (W19): cap the file size we are willing to read. The
    // pre-W19 loader passed `path` straight to `fs.readFile`,
    // so a malicious or accidental ingestion of a 4 GB log
    // would OOM the process. The 25 MB cap is below the
    // default `chunkSize` * `chunkOverlap` budget for a single
    // document, so the chunker is always able to produce a
    // reasonable number of chunks without having to split a
    // 1 GB blob into 50k pieces. Operators can raise the cap
    // by setting `PA_TEXT_LOADER_MAX_BYTES` (positive integer).
    const cap = Number.parseInt(process.env.PA_TEXT_LOADER_MAX_BYTES ?? `${25 * 1024 * 1024}`, 10);
    if (Number.isFinite(cap) && cap > 0) {
      const stat = await fs.stat(path);
      if (stat.size > cap) {
        throw new Error(
          `text loader: file ${path} is ${stat.size} bytes, exceeds the ${cap}-byte cap ` +
            `(set PA_TEXT_LOADER_MAX_BYTES to raise).`,
        );
      }
    }
    const text = await fs.readFile(path, 'utf8');
    return [{ source: path, text, metadata: { path } }];
  }

  async loadBuffer(buf: Buffer): Promise<Document[]> {
    // L11 (W19): the buffer path skips the size cap above (we
    // already have the bytes in memory). For a defence-in-depth
    // check we still refuse buffers larger than the cap, so a
    // caller that re-routes a giant stream through the buffer
    // entry-point can't bypass the limit.
    const cap = Number.parseInt(process.env.PA_TEXT_LOADER_MAX_BYTES ?? `${25 * 1024 * 1024}`, 10);
    if (Number.isFinite(cap) && cap > 0 && buf.length > cap) {
      throw new Error(
        `text loader: buffer is ${buf.length} bytes, exceeds the ${cap}-byte cap ` +
          `(set PA_TEXT_LOADER_MAX_BYTES to raise).`,
      );
    }
    return [{ text: buf.toString('utf8'), metadata: { bytes: buf.length } }];
  }
}
