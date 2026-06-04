/**
 * HTTP / SSE transport for MCP (Streamable HTTP).
 *
 * The current MCP transport spec is "Streamable HTTP":
 *  - Client → server: regular HTTP POST with a JSON-RPC body
 *  - Server → client: either a single JSON response OR an SSE stream
 *    (Content-Type: text/event-stream) carrying one or more JSON-RPC
 *    messages as `data:` events
 *
 * For outgoing requests this implementation POSTs the body, reads the
 * response, and either yields the JSON body or parses the SSE stream
 * into a sequence of JSON-RPC messages. Server-to-client notifications
 * arrive on a long-lived GET endpoint per the spec; we expose that as
 * a separate {@link openEventStream} method to keep this file small
 * and testable.
 *
 * Networking is abstracted via {@link fetchImpl} so tests can swap in
 * a fake.
 */

import { EventEmitter } from 'eventemitter3';
import type { MCPTransport } from '../../ports/mcp.port.js';
import { isResponse, type JsonRpcMessage } from './jsonrpc.js';

export interface HttpTransportOptions {
  url: string;
  headers?: Record<string, string>;
  fetchImpl?: typeof fetch;
  /** SSE GET endpoint for receiving server notifications. */
  eventsUrl?: string;
}

interface HttpTransportEvents {
  message: (msg: unknown) => void;
  error: (err: Error) => void;
  close: () => void;
}

export class HttpTransport extends EventEmitter<HttpTransportEvents> implements MCPTransport {
  private readonly url: string;
  private readonly headers: Record<string, string>;
  private readonly fetchImpl: typeof fetch;
  private readonly eventsUrl?: string;
  private aborted = false;
  private eventController: AbortController | null = null;

  constructor(opts: HttpTransportOptions) {
    super();
    this.url = opts.url.replace(/\/$/, '');
    this.headers = opts.headers ?? {};
    this.fetchImpl = opts.fetchImpl ?? globalThis.fetch.bind(globalThis);
    this.eventsUrl = opts.eventsUrl;
  }

  async start(): Promise<void> {
    if (this.eventsUrl) {
      this.openEventStream();
    }
  }

  private openEventStream(): void {
    if (!this.eventsUrl) return;
    this.eventController = new AbortController();
    void this.streamEvents(this.eventsUrl, this.eventController.signal).catch((err) => {
      this.emit('error', err instanceof Error ? err : new Error(String(err)));
    });
  }

  private async streamEvents(url: string, signal: AbortSignal): Promise<void> {
    const resp = await this.fetchImpl(url, {
      method: 'GET',
      headers: { ...this.headers, accept: 'text/event-stream' },
      signal,
    });
    if (!resp.ok) {
      throw new Error(`HttpTransport: SSE GET ${url} -> ${resp.status}`);
    }
    if (!resp.body) {
      throw new Error('HttpTransport: SSE response missing body');
    }
    const reader = (resp.body as ReadableStream<Uint8Array>).getReader();
    const decoder = new TextDecoder();
    let buf = '';
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let idx: number;
        while ((idx = buf.indexOf('\n\n')) !== -1) {
          const block = buf.substring(0, idx);
          buf = buf.substring(idx + 2);
          const dataLines = block
            .split('\n')
            .filter((l) => l.startsWith('data:'))
            .map((l) => l.substring(5).trim());
          for (const data of dataLines) {
            if (!data) continue;
            try {
              this.emit('message', JSON.parse(data) as unknown);
            } catch (err) {
              this.emit('error', new Error(`HttpTransport: bad SSE JSON: ${(err as Error).message}`));
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  async send(message: unknown): Promise<void> {
    const resp = await this.fetchImpl(this.url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        ...this.headers,
      },
      body: JSON.stringify(message),
    });
    if (!resp.ok) {
      const body = await resp.text().catch(() => '');
      throw new Error(`HttpTransport: POST ${this.url} -> ${resp.status}: ${body}`);
    }
    const ct = resp.headers.get('content-type') ?? '';
    if (ct.includes('text/event-stream')) {
      // Server will respond on this same POST connection. Drain and
      // emit each `data:` line as a JSON-RPC message.
      if (!resp.body) return;
      const reader = (resp.body as ReadableStream<Uint8Array>).getReader();
      const decoder = new TextDecoder();
      let buf = '';
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          let idx: number;
          while ((idx = buf.indexOf('\n\n')) !== -1) {
            const block = buf.substring(0, idx);
            buf = buf.substring(idx + 2);
            const dataLines = block
              .split('\n')
              .filter((l) => l.startsWith('data:'))
              .map((l) => l.substring(5).trim());
            for (const data of dataLines) {
              if (!data) continue;
              try {
                this.emit('message', JSON.parse(data) as unknown);
              } catch (err) {
                this.emit('error', new Error(`HttpTransport: bad SSE JSON: ${(err as Error).message}`));
              }
            }
          }
        }
      } finally {
        reader.releaseLock();
      }
    } else {
      // Single JSON response: not part of the streaming channel.
      // Don't emit; the client awaits the request's response directly.
    }
  }

  async *messages(): AsyncIterable<unknown> {
    const queue: unknown[] = [];
    let resolveNext: (() => void) | null = null;
    const onMsg = (m: unknown) => {
      // Filter out request/response shaped messages that the HTTP
      // transport has already routed to its caller.
      if (isResponse(m as JsonRpcMessage) && !this.isPendingResponse(m)) {
        return;
      }
      queue.push(m);
      if (resolveNext) {
        const r = resolveNext;
        resolveNext = null;
        r();
      }
    };
    this.on('message', onMsg);
    try {
      while (!this.aborted) {
        if (queue.length === 0) {
          await new Promise<void>((resolve) => {
            resolveNext = resolve;
          });
        }
        while (queue.length > 0) yield queue.shift();
      }
    } finally {
      this.off('message', onMsg);
    }
  }

  private pendingResponses = new Set<number | string>();
  registerPending(id: number | string): void {
    this.pendingResponses.add(id);
  }
  unregisterPending(id: number | string): void {
    this.pendingResponses.delete(id);
  }
  private isPendingResponse(m: unknown): boolean {
    if (!m || typeof m !== 'object') return false;
    const id = (m as { id?: unknown }).id;
    if (typeof id !== 'number' && typeof id !== 'string') return false;
    return this.pendingResponses.has(id);
  }

  async close(): Promise<void> {
    this.aborted = true;
    if (this.eventController) {
      try {
        this.eventController.abort();
      } catch {
        /* ignore */
      }
      this.eventController = null;
    }
    this.emit('close');
  }
}
