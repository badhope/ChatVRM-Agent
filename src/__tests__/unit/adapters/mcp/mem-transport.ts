/**
 * In-memory transport for tests.
 *
 * Connects two transports back-to-back: messages sent on `a` arrive on
 * `b.messages()` and vice versa. Used by all client / server tests.
 */

import { EventEmitter } from 'eventemitter3';
import type { MCPTransport } from '../../../../ports/mcp.port.js';

interface MemTransportEvents {
  message: (msg: unknown) => void;
  error: (err: Error) => void;
  close: () => void;
}

class MemTransport extends EventEmitter<MemTransportEvents> implements MCPTransport {
  private peer: MemTransport | null = null;
  private closed = false;

  attach(peer: MemTransport): void {
    this.peer = peer;
    peer.peer = this;
  }

  async start(): Promise<void> {
    /* no-op */
  }
  async send(message: unknown): Promise<void> {
    if (this.closed) throw new Error('MemTransport: closed');
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        if (this.peer && !this.peer.closed) {
          this.peer.emit('message', message);
        }
        resolve();
      }, 0);
    });
  }
  async *messages(): AsyncIterable<unknown> {
    const queue: unknown[] = [];
    let resolveNext: (() => void) | null = null;
    let stop = false;
    const onMsg = (m: unknown) => {
      queue.push(m);
      if (resolveNext) {
        const r = resolveNext;
        resolveNext = null;
        r();
      }
    };
    const onClose = () => {
      stop = true;
      if (resolveNext) {
        const r = resolveNext;
        resolveNext = null;
        r();
      }
    };
    this.on('message', onMsg);
    this.on('close', onClose);
    try {
      while (!stop) {
        if (queue.length === 0) {
          await new Promise<void>((resolve) => {
            resolveNext = resolve;
          });
        }
        while (queue.length > 0) yield queue.shift();
      }
    } finally {
      this.off('message', onMsg);
      this.off('close', onClose);
    }
  }
  async close(): Promise<void> {
    this.closed = true;
    this.emit('close');
  }
}

export function makeMemoryTransportPair(): { a: MCPTransport; b: MCPTransport } {
  const a = new MemTransport();
  const b = new MemTransport();
  a.attach(b);
  return { a, b };
}
