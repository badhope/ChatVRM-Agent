import { describe, it, expect } from 'vitest';
import { StdioTransport } from '../../../../adapters/mcp/stdio-transport.js';
import { Readable, Writable } from 'node:stream';
import { EventEmitter } from 'node:events';

class MockChild extends EventEmitter {
  stdin: Writable;
  stdout: Readable;
  stderr: Readable;
  killed = false;
  killedWith: string | null = null;
  constructor() {
    super();
    this.stdin = new Writable({
      write(chunk, _enc, cb) {
        MockChild.lastStdin = chunk.toString();
        cb();
      },
    });
    this.stdout = new Readable({ read() {} });
    this.stderr = new Readable({ read() {} });
  }
  static lastStdin: string | null = null;
  kill(signal: string): boolean {
    this.killed = true;
    this.killedWith = signal;
    setImmediate(() => this.emit('close'));
    return true;
  }
}

describe('StdioTransport', () => {
  it('parses newline-delimited JSON on stdout', async () => {
    const child = new MockChild();
    const transport = new StdioTransport({ command: 'node', args: ['fake'] });
    // Inject mock child via spawnImpl.
    (transport as unknown as { _spawn: (cmd: string, args: string[], opts: unknown) => MockChild })._spawn = () => child;
    await transport.start();

    const received: unknown[] = [];
    const stop = (async () => {
      for await (const m of transport.messages()) {
        received.push(m);
        if (received.length >= 2) break;
      }
    })();
    // Push two JSON lines.
    child.stdout.push('{"jsonrpc":"2.0","id":1,"result":{}}\n');
    child.stdout.push('{"jsonrpc":"2.0","method":"x"}\n');
    child.stdout.push(null);
    await Promise.race([stop, new Promise((r) => setTimeout(r, 200))]);
    expect(received.length).toBeGreaterThanOrEqual(2);
    expect((received[0] as { id: number }).id).toBe(1);
    expect((received[1] as { method: string }).method).toBe('x');
    await transport.close();
  });

  it('sends JSON + newline to stdin', async () => {
    const child = new MockChild();
    const transport = new StdioTransport({ command: 'node', args: ['fake'] });
    (transport as unknown as { _spawn: (cmd: string, args: string[], opts: unknown) => MockChild })._spawn = () => child;
    await transport.start();
    MockChild.lastStdin = null;
    await transport.send({ jsonrpc: '2.0', id: 1, method: 'ping' });
    expect(MockChild.lastStdin).toBe('{"jsonrpc":"2.0","id":1,"method":"ping"}\n');
    await transport.close();
  });

  it('emits error on bad JSON line', async () => {
    const child = new MockChild();
    const transport = new StdioTransport({ command: 'node', args: ['fake'] });
    (transport as unknown as { _spawn: (cmd: string, args: string[], opts: unknown) => MockChild })._spawn = () => child;
    const errors: Error[] = [];
    transport.on('error', (e) => errors.push(e));
    await transport.start();
    child.stdout.push('not json\n');
    await new Promise((r) => setTimeout(r, 50));
    expect(errors.length).toBeGreaterThan(0);
    await transport.close();
  });

  it('throws when sending after close', async () => {
    const child = new MockChild();
    const transport = new StdioTransport({ command: 'node', args: ['fake'] });
    (transport as unknown as { _spawn: (cmd: string, args: string[], opts: unknown) => MockChild })._spawn = () => child;
    await transport.start();
    await transport.close();
    await expect(transport.send({})).rejects.toThrow(/closed/);
  });
});
