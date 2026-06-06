/**
 * DOCX loader.
 *
 * Uses `mammoth` to convert .docx → plain text. Install with:
 *
 *     npm install mammoth
 *
 * Each document is returned as a single {@link Document} (DOCX has no
 * inherent page boundaries we can extract cheaply). The metadata
 * captures the source path and a best-effort title from `core.xml`.
 */

import * as fs from 'node:fs/promises';
import type { Document, Loader } from '../ports/loader.port.js';
import { enforceBufferSizeCap, enforceFileSizeCap } from './size-cap.js';

interface MammothResult {
  value: string;
  messages: Array<{ type: string; message: string }>;
}

interface MammothModule {
  extractRawText(opts: { buffer: Buffer }): Promise<MammothResult>;
}

async function importMammoth(): Promise<MammothModule> {
  try {
    return (await import('mammoth')) as unknown as MammothModule;
  } catch {
    throw new Error('DOCX loader requires `mammoth`. Install with: npm install mammoth');
  }
}

export class DocxLoader implements Loader {
  readonly extensions = ['.docx'];

  async load(path: string): Promise<Document[]> {
    // M4 (W19): apply the size cap on every path. A 1 GB .docx
    // was previously happily `fs.readFile`d and then handed to
    // mammoth, which buffers the entire archive in memory before
    // noticing. We now refuse the file at the boundary. Operators
    // can raise the cap via `PA_DOCX_LOADER_MAX_BYTES`.
    await enforceFileSizeCap(path, { envVar: 'PA_DOCX_LOADER_MAX_BYTES' });
    const buf = await fs.readFile(path);
    const result = await this.parse(buf);
    return [{ source: path, text: result.value, metadata: { path, warnings: result.messages } }];
  }

  async loadBuffer(buf: Buffer): Promise<Document[]> {
    enforceBufferSizeCap(buf, { envVar: 'PA_DOCX_LOADER_MAX_BYTES' });
    const result = await this.parse(buf);
    return [{ text: result.value, metadata: { warnings: result.messages } }];
  }

  private async parse(buf: Buffer): Promise<MammothResult> {
    const m = await importMammoth();
    return m.extractRawText({ buffer: buf });
  }
}
