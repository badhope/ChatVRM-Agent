/**
 * Type stubs for optional/lazy dependencies.
 *
 * Each optional adapter (BullMQ, better-sqlite3, pg, pdf-parse, mammoth,
 * xlsx) is lazy-imported inside its adapter. The packages are NOT in
 * `package.json` because we want the project to install and build even
 * when these backends aren't in use.
 *
 * To use one of these backends, install the package and delete the
 * corresponding stub from this file. TypeScript will then resolve the
 * real type declarations.
 */

declare module 'better-sqlite3' {
  export default class BetterSqlite3 {
    constructor(filename: string, opts?: Record<string, unknown>);
    prepare(sql: string): {
      run(...params: unknown[]): { changes: number; lastInsertRowid: number | bigint };
      get(...params: unknown[]): unknown;
      all(...params: unknown[]): unknown[];
    };
    exec(sql: string): void;
    close(): void;
  }
}

declare module 'pg' {
  export class Pool {
    constructor(opts: Record<string, unknown>);
    connect(): Promise<{
      query(sql: string, params?: unknown[]): Promise<{ rows: Array<Record<string, unknown>>; rowCount: number }>;
      release(): void;
    }>;
    end(): Promise<void>;
    on(event: string, listener: (...args: unknown[]) => void): unknown;
  }
}

declare module 'bullmq' {
  export class Queue {
    constructor(name: string, opts: Record<string, unknown>);
    static name: string;
    name: string;
    add(name: string, data: unknown, opts?: Record<string, unknown>): Promise<unknown>;
    pause(): Promise<void>;
    resume(): Promise<void>;
    isPaused(): Promise<boolean>;
    getJob(id: string): Promise<unknown>;
    count(): Promise<number>;
    close(): Promise<void>;
    on(event: string, listener: (...args: unknown[]) => void): unknown;
    off(event: string, listener: (...args: unknown[]) => void): unknown;
  }
  export class Worker {
    constructor(
      name: string,
      fn: (job: unknown) => Promise<unknown>,
      opts: Record<string, unknown>,
    );
    on(event: string, listener: (...args: unknown[]) => void): unknown;
    close(): Promise<void>;
  }
}

declare module 'pdf-parse' {
  interface PdfParseResult {
    numpages: number;
    numrender: number;
    info: Record<string, unknown>;
    metadata: Record<string, unknown> | null;
    text: string;
  }
  const fn: (buf: Buffer, opts?: Record<string, unknown>) => Promise<PdfParseResult>;
  export default fn;
}

declare module 'mammoth' {
  interface Result {
    value: string;
    messages: Array<{ type: string; message: string }>;
  }
  export function extractRawText(opts: { buffer: Buffer }): Promise<Result>;
}

declare module 'xlsx' {
  export function read(data: Buffer | ArrayBuffer, opts: { type: 'buffer' }): {
    SheetNames: string[];
    Sheets: Record<string, unknown>;
  };
  export const utils: {
    sheet_to_json(sheet: unknown, opts?: Record<string, unknown>): Array<Record<string, unknown>>;
  };
}
