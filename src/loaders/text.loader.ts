/**
 * Plain-text loader. Handles .txt, .md, and any other text-like file
 * when the extension matches.
 */

import * as fs from 'node:fs/promises';
import type { Document, Loader } from '../ports/loader.port.js';
import { enforceBufferSizeCap, enforceFileSizeCap } from './size-cap.js';

export class TextLoader implements Loader {
  readonly extensions: string[];

  constructor(extensions: string[] = ['.txt', '.md', '.markdown', '.log']) {
    this.extensions = extensions;
  }

  async load(path: string): Promise<Document[]> {
    // L11b (W19): shared cap helper. See `size-cap.ts` for the
    // rationale. Pre-W19 the cap was inline here and only here,
    // so a 1 GB .json or .html submitted to a sibling loader
    // would OOM the process.
    await enforceFileSizeCap(path, { envVar: 'PA_TEXT_LOADER_MAX_BYTES' });
    const text = await fs.readFile(path, 'utf8');
    return [{ source: path, text, metadata: { path } }];
  }

  async loadBuffer(buf: Buffer): Promise<Document[]> {
    // The buffer path skips the file-stat cap (we already have
    // the bytes in memory). For a defence-in-depth check we
    // still refuse buffers larger than the cap, so a caller
    // that re-routes a giant stream through the buffer
    // entry-point can't bypass the limit.
    enforceBufferSizeCap(buf, { envVar: 'PA_TEXT_LOADER_MAX_BYTES' });
    return [{ text: buf.toString('utf8'), metadata: { bytes: buf.length } }];
  }
}
