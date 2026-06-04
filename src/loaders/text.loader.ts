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
    const text = await fs.readFile(path, 'utf8');
    return [{ source: path, text, metadata: { path } }];
  }

  async loadBuffer(buf: Buffer): Promise<Document[]> {
    return [{ text: buf.toString('utf8'), metadata: { bytes: buf.length } }];
  }
}
