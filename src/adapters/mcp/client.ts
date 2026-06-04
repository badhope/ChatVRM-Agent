/**
 * MCP client.
 *
 * Speaks JSON-RPC 2.0 over any {@link MCPTransport}. After
 * {@link initialize}, the client caches the server's identity and
 * capabilities and exposes the higher-level helpers (listTools,
 * callTool, listResources, readResource, listPrompts, getPrompt).
 *
 * Concurrent requests are supported via an internal id counter and a
 * pending-response map. Server-initiated notifications (e.g.
 * `notifications/tools/list_changed`) are dispatched to subscribers of
 * the client's `onNotification` handler.
 */

import { EventEmitter } from 'eventemitter3';
import {
  isResponse,
  JsonRpcErrorException,
  type JsonRpcMessage,
  type JsonRpcRequest,
  type JsonRpcResponse,
} from './jsonrpc.js';
import type {
  MCPClient as IMCPClient,
  MCPClientInfo,
  MCPPromptDescriptor,
  MCPPromptMessage,
  MCPResourceContent,
  MCPResourceDescriptor,
  MCPServerCapabilities,
  MCPToolDescriptor,
  MCPToolResult,
  MCPTransport,
} from '../../ports/mcp.port.js';

export interface MCPClientOptions {
  transport: MCPTransport;
  clientInfo: MCPClientInfo;
  /** Negotiated protocol version. */
  protocolVersion?: string;
  /** Custom request timeout in ms (default 30000). */
  requestTimeoutMs?: number;
  /** Optional logger for diagnostics. */
  logger?: (line: string) => void;
}

interface MCPClientEvents {
  notification: (method: string, params: unknown) => void;
  error: (err: Error) => void;
  close: () => void;
}

interface Pending {
  resolve: (value: unknown) => void;
  reject: (err: Error) => void;
  method: string;
  timer: ReturnType<typeof setTimeout> | null;
}

export class MCPClient extends EventEmitter<MCPClientEvents> implements IMCPClient {
  readonly id: string;
  private _serverInfo: { name: string; version: string } = { name: 'unknown', version: '0' };
  private _capabilities: MCPServerCapabilities = {};

  get serverInfo(): { name: string; version: string } {
    return this._serverInfo;
  }
  get capabilities(): MCPServerCapabilities {
    return this._capabilities;
  }

  private readonly transport: MCPTransport;
  private readonly clientInfo: MCPClientInfo;
  private readonly protocolVersion: string;
  private readonly requestTimeoutMs: number;
  private readonly logger?: (line: string) => void;

  private nextId = 1;
  private pending = new Map<number | string, Pending>();
  private initialized = false;
  private readerDone: Promise<void> | null = null;

  constructor(options: MCPClientOptions) {
    super();
    this.id = `mcp:${options.clientInfo.name}@${options.clientInfo.version}`;
    this.transport = options.transport;
    this.clientInfo = options.clientInfo;
    this.protocolVersion = options.protocolVersion ?? '2024-11-05';
    this.requestTimeoutMs = options.requestTimeoutMs ?? 30_000;
    this.logger = options.logger;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    await this.transport.start();
    // Start the reader BEFORE we send initialize so we can route the response.
    this.readerDone = this.consume();
    const params = {
      protocolVersion: this.protocolVersion,
      capabilities: {},
      clientInfo: this.clientInfo,
    };
    const result = (await this.request('initialize', params)) as {
      protocolVersion: string;
      capabilities: MCPServerCapabilities;
      serverInfo: { name: string; version: string };
    };
    this._capabilities = result.capabilities ?? {};
    this._serverInfo = result.serverInfo ?? { name: 'unknown', version: '0' };
    await this.transport.send({ jsonrpc: '2.0', method: 'notifications/initialized' });
    this.initialized = true;
  }

  private async consume(): Promise<void> {
    try {
      for await (const msg of this.transport.messages()) {
        const m = msg as JsonRpcMessage;
        if (isResponse(m)) {
          this.handleResponse(m);
        } else if ('method' in m) {
          this.emit('notification', (m as { method: string }).method, (m as { params?: unknown }).params);
        }
      }
    } catch (err) {
      this.emit('error', err instanceof Error ? err : new Error(String(err)));
    } finally {
      this.emit('close');
    }
  }

  private handleResponse(r: JsonRpcResponse): void {
    const id = r.id;
    const p = this.pending.get(id);
    if (!p) {
      this.logger?.(`MCPClient: response for unknown id ${String(id)}`);
      return;
    }
    this.pending.delete(id);
    if (p.timer) clearTimeout(p.timer);
    if ('error' in r) {
      p.reject(new JsonRpcErrorException(r.error.code, r.error.message, r.error.data));
    } else {
      p.resolve(r.result);
    }
  }

  private async request(method: string, params?: unknown): Promise<unknown> {
    const id = this.nextId++;
    const req: JsonRpcRequest = { jsonrpc: '2.0', id, method, params };
    const p: Pending = {
      resolve: () => {},
      reject: () => {},
      method,
      timer: null,
    };
    const promise = new Promise<unknown>((resolve, reject) => {
      p.resolve = resolve;
      p.reject = reject;
    });
    p.timer = setTimeout(() => {
      this.pending.delete(id);
      reject(new Error(`MCPClient: request ${method} timed out after ${this.requestTimeoutMs}ms`));
    }, this.requestTimeoutMs);
    this.pending.set(id, p);
    try {
      await this.transport.send(req);
    } catch (err) {
      this.pending.delete(id);
      if (p.timer) clearTimeout(p.timer);
      throw err instanceof Error ? err : new Error(String(err));
    }
    return promise;
  }

  async listTools(): Promise<MCPToolDescriptor[]> {
    await this.initialize();
    if (!this._capabilities.tools) return [];
    const res = (await this.request('tools/list')) as { tools: MCPToolDescriptor[] };
    return res.tools ?? [];
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<MCPToolResult> {
    await this.initialize();
    if (!this._capabilities.tools) {
      throw new Error(`MCPClient: server does not advertise tools capability`);
    }
    return (await this.request('tools/call', { name, arguments: args })) as MCPToolResult;
  }

  async listResources(): Promise<MCPResourceDescriptor[]> {
    await this.initialize();
    if (!this._capabilities.resources) return [];
    const res = (await this.request('resources/list')) as { resources: MCPResourceDescriptor[] };
    return res.resources ?? [];
  }

  async readResource(uri: string): Promise<MCPResourceContent[]> {
    await this.initialize();
    if (!this._capabilities.resources) {
      throw new Error('MCPClient: server does not advertise resources capability');
    }
    const res = (await this.request('resources/read', { uri })) as { contents: MCPResourceContent[] };
    return res.contents ?? [];
  }

  async listPrompts(): Promise<MCPPromptDescriptor[]> {
    await this.initialize();
    if (!this._capabilities.prompts) return [];
    const res = (await this.request('prompts/list')) as { prompts: MCPPromptDescriptor[] };
    return res.prompts ?? [];
  }

  async getPrompt(
    name: string,
    args?: Record<string, string>,
  ): Promise<{ description?: string; messages: MCPPromptMessage[] }> {
    await this.initialize();
    if (!this._capabilities.prompts) {
      throw new Error('MCPClient: server does not advertise prompts capability');
    }
    return (await this.request('prompts/get', { name, arguments: args ?? {} })) as {
      description?: string;
      messages: MCPPromptMessage[];
    };
  }

  async close(): Promise<void> {
    this.initialized = false;
    for (const [, p] of this.pending) {
      if (p.timer) clearTimeout(p.timer);
      p.reject(new Error('MCPClient: connection closed'));
    }
    this.pending.clear();
    await this.transport.close();
    if (this.readerDone) {
      await this.readerDone.catch(() => undefined);
    }
  }
}
