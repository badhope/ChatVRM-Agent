/**
 * Document loader port.
 *
 * A loader turns a file (or in-memory string/buffer) into a normalized
 * list of {@link Document}s, ready to be chunked and embedded.
 *
 * Implementations live in `src/loaders/` and cover plain text, markdown,
 * CSV, JSON, PDF, DOCX, XLSX, and HTML. The {@link AutoLoader} picks
 * the right loader by file extension.
 */

export interface Document {
  /** Optional source URI/path. */
  source?: string;
  /** Page number, sheet name, row index, etc. */
  locator?: string;
  /** The extracted text. */
  text: string;
  /** Free-form metadata (title, author, sheet headers, etc.). */
  metadata?: Record<string, unknown>;
}

export interface Loader {
  /** File extensions this loader handles, e.g. ['.pdf']. */
  readonly extensions: string[];
  load(path: string): Promise<Document[]>;
  loadBuffer?(buf: Buffer, mime?: string): Promise<Document[]>;
}
