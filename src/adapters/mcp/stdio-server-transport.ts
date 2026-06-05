/**
 * Inbound stdio transport for MCP.
 *
 * The standard MCP server-side stdio transport reads JSON-RPC
 * newline-delimited messages from this process's `process.stdin` and
 * writes responses / notifications to `process.stdout`. This is what
 * allows a host like Cursor or Claude Desktop to launch us as a
 * subprocess and call our tools.
 *
 * It is the mirror of {@link StdioTransport}: that one spawns a
 * child (we are the **client**); this one attaches to **our own**
 * stdio (we are the **server**).
 */

import { EventEmitter } from 'eventemitter3';
import { Readable, Writable } from 'node:stream';
import type { MCPTransport } from '../../ports/mcp.port.js';

interface StdioServerTransportEvents {
  message: (msg: unknown) => void;
  error: (err: Error) => void;
  close: () => void;
}

export interface StdioServerTransportOptions {
  /** Override the input stream (defaults to process.stdin). */
  input?: Readable;
  /** Override the output stream (defaults to process.stdout). */
  output?: Writable;
  /** If true, suppress log noise to stdout. */
  quiet?: boolean;
}

export class StdioServerTransport extends EventEmitter<StdioServerTransportEvents> implements MCPTransport {
  private readonly input: Readable;
  private readonly output: Writable;
  private buffer = '';
  private closed = false;
  private readonly quiet: boolean;
  private readonly isRealStdin: boolean;

  constructor(options: StdioServerTransportOptions = {}) {
    super();
    this.input = options.input ?? process.stdin;
    this.output = options.output ?? process.stdout;
    this.quiet = options.quiet ?? false;
    this.isRealStdin = options.input === undefined;
  }

  async start(): Promise<void> {
    if (this.isRealStdin) {
      // In a real server we want to read raw NDJSON off stdin.
      // process.stdin is paused by default — resume it.
      this.input.resume();
      this.input.setEncoding('utf8');
    }
    this.input.on('data', (chunk: string) => this.onData(chunk));
    this.input.on('error', (err) => this.emit('error', err));
    this.input.on('end', () => this.emit('close'));
    this.input.on('close', () => this.emit('close'));
  }

  async send(message: unknown): Promise<void> {
    if (this.closed) throw new Error('StdioServerTransport is closed');
    const line = JSON.stringify(message) + '\n';
    await new Promise<void>((resolve, reject) => {
      this.output.write(line, (err) => (err ? reject(err) : resolve()));
    });
  }

  async *messages(): AsyncIterable<unknown> {
    // The transport is event-driven via 'message'; the server pumps
    // those events into the message handler. We still expose the
    // async iterator for transport-agnostic consumers.
    const queue: unknown[] = [];
    let resolveNext: (() => void) | null = null;
    this.on('message', (m) => {
      queue.push(m);
      const r = resolveNext;
      resolveNext = null;
      r?.();
    });
    while (!this.closed) {
      if (queue.length > 0) {
        const m = queue.shift();
        if (m !== undefined) yield m;
      } else {
        await new Promise<void>((r) => {
          resolveNext = r;
        });
      }
    }
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    if (this.isRealStdin && this.input === process.stdin) {
      this.input.pause();
    }
    this.emit('close');
  }

  private onData(chunk: string): void {
    this.buffer += chunk;
    let nl: number;
    while ((nl = this.buffer.indexOf('\n')) >= 0) {
      const line = this.buffer.slice(0, nl).trimEnd();
      this.buffer = this.buffer.slice(nl + 1);
      if (!line) continue;
      try {
        const msg = JSON.parse(line);
        this.emit('message', msg);
      } catch (err) {
        this.emit('error', new Error(`StdioServerTransport: invalid JSON line: ${(err as Error).message}`));
      }
    }
  }
}
