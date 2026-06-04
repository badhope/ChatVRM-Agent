/**
 * Stdio transport for MCP.
 *
 * Spawns a child process and frames messages as newline-delimited JSON
 * (NDJSON) over its stdout/stdin. This is the original MCP transport
 * and works for locally-installed servers (e.g. `npx -y @modelcontextprotocol/server-filesystem`).
 *
 * The transport is transport-agnostic: it implements
 * {@link MCPTransport} from `src/ports/mcp.port.ts`.
 */

import { spawn, type ChildProcess, type SpawnOptions } from 'node:child_process';
import { EventEmitter } from 'eventemitter3';
import type { MCPTransport } from '../../ports/mcp.port.js';

export interface StdioTransportOptions {
  command: string;
  args?: string[];
  env?: NodeJS.ProcessEnv;
  /** Override spawn for tests. */
  spawnImpl?: (cmd: string, args: string[], opts: SpawnOptions) => ChildProcess;
}

interface StdioTransportEvents {
  message: (msg: unknown) => void;
  error: (err: Error) => void;
  close: () => void;
}

export class StdioTransport extends EventEmitter<StdioTransportEvents> implements MCPTransport {
  private child: ChildProcess | null = null;
  private buffer = '';
  private closed = false;
  private readonly opts: Required<Pick<StdioTransportOptions, 'command' | 'args' | 'env'>>;

  constructor(options: StdioTransportOptions) {
    super();
    this.opts = {
      command: options.command,
      args: options.args ?? [],
      env: options.env ?? {},
    };
    this._spawn = options.spawnImpl ?? spawn;
  }

  private _spawn: NonNullable<StdioTransportOptions['spawnImpl']>;

  async start(): Promise<void> {
    if (this.child) return;
    const child = this._spawn(this.opts.command, this.opts.args, {
      env: { ...process.env, ...this.opts.env },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    this.child = child;
    this.child.stdout?.setEncoding('utf8');
    this.child.stderr?.setEncoding('utf8');
    this.child.stdout?.on('data', (chunk: string) => this.onStdout(chunk));
    this.child.stderr?.on('data', (chunk: string) => this.onStderr(chunk));
    this.child.on('error', (err) => this.emit('error', err));
    this.child.on('close', () => {
      this.closed = true;
      this.emit('close');
    });
  }

  private onStdout(chunk: string): void {
    this.buffer += chunk;
    let idx: number;
    while ((idx = this.buffer.indexOf('\n')) !== -1) {
      const line = this.buffer.substring(0, idx).trim();
      this.buffer = this.buffer.substring(idx + 1);
      if (!line) continue;
      try {
        const parsed = JSON.parse(line) as unknown;
        this.emit('message', parsed);
      } catch (err) {
        this.emit('error', new Error(`StdioTransport: bad JSON line: ${(err as Error).message}`));
      }
    }
  }

  private onStderr(chunk: string): void {
    // Surface stderr as error events but don't crash. Servers can log
    // freely to stderr without disturbing the protocol channel.
    this.emit('error', new Error(`mcp-server stderr: ${chunk.trim()}`));
  }

  async send(message: unknown): Promise<void> {
    const child = this.child;
    if (!child || !child.stdin || this.closed) {
      throw new Error('StdioTransport: not started or closed');
    }
    const data = JSON.stringify(message) + '\n';
    return new Promise<void>((resolve, reject) => {
      child.stdin!.write(data, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  async *messages(): AsyncIterable<unknown> {
    const queue: unknown[] = [];
    let resolveNext: (() => void) | null = null;
    const onMsg = (m: unknown) => {
      queue.push(m);
      if (resolveNext) {
        const r = resolveNext;
        resolveNext = null;
        r();
      }
    };
    this.on('message', onMsg);
    try {
      while (true) {
        if (queue.length === 0) {
          await new Promise<void>((resolve) => {
            resolveNext = resolve;
          });
        }
        if (this.closed && queue.length === 0) return;
        while (queue.length > 0) {
          yield queue.shift();
        }
      }
    } finally {
      this.off('message', onMsg);
    }
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    if (this.child && !this.child.killed) {
      this.child.kill('SIGTERM');
      // Give the process 1s to exit cleanly.
      await new Promise<void>((resolve) => {
        const t = setTimeout(() => {
          try {
            this.child?.kill('SIGKILL');
          } catch {
            /* ignore */
          }
          resolve();
        }, 1000);
        this.child?.once('close', () => {
          clearTimeout(t);
          resolve();
        });
      });
    }
    this.child = null;
  }
}
