/**
 * In-process MCP server.
 *
 * Exposes a set of tools / resources / prompts to MCP clients that
 * connect over any {@link MCPTransport}. Designed primarily for testing
 * and for embedding MCP servers in a child process; the wire protocol
 * is identical to a "real" server.
 *
 * Tools / resources / prompts can be registered with
 * {@link registerTool}, {@link registerResource}, {@link registerPrompt}.
 * Each tool is a `({ name, args }) => result` async function.
 */

import { EventEmitter } from 'eventemitter3';
import {
  JSONRPC_ERROR_CODES,
  isRequest,
  type JsonRpcMessage,
  type JsonRpcRequest,
  type JsonRpcResponse,
} from './jsonrpc.js';
import type {
  MCPPromptDescriptor,
  MCPPromptMessage,
  MCPResourceContent,
  MCPResourceDescriptor,
  MCPServerCapabilities,
  MCPToolDescriptor,
  MCPToolResult,
  MCPTransport,
} from '../../ports/mcp.port.js';

export interface MCPToolHandler {
  description?: string;
  inputSchema: Record<string, unknown>;
  invoke: (args: Record<string, unknown>) => Promise<MCPToolResult> | MCPToolResult;
}

export interface MCPResourceHandler {
  description?: string;
  mimeType?: string;
  read: (uri: string) => Promise<MCPResourceContent> | MCPResourceContent;
}

export interface MCPPromptHandler {
  description?: string;
  arguments?: Array<{ name: string; description?: string; required?: boolean }>;
  get: (args: Record<string, string>) => Promise<{ messages: MCPPromptMessage[] }> | { messages: MCPPromptMessage[] };
}

export interface MCPServerOptions {
  serverInfo: { name: string; version: string };
  capabilities?: MCPServerCapabilities;
  protocolVersion?: string;
}

interface MCPServerEvents {
  request: (method: string, params: unknown) => void;
  notification: (method: string, params: unknown) => void;
  error: (err: Error) => void;
}

export class MCPServer extends EventEmitter<MCPServerEvents> {
  readonly serverInfo: { name: string; version: string };
  readonly capabilities: MCPServerCapabilities;
  readonly protocolVersion: string;
  private tools = new Map<string, MCPToolHandler>();
  private resources = new Map<string, MCPResourceHandler>();
  private prompts = new Map<string, MCPPromptHandler>();
  private transport: MCPTransport | null = null;
  private readerDone: Promise<void> | null = null;

  constructor(opts: MCPServerOptions) {
    super();
    this.serverInfo = opts.serverInfo;
    this.capabilities = opts.capabilities ?? { tools: {}, resources: {}, prompts: {} };
    this.protocolVersion = opts.protocolVersion ?? '2024-11-05';
  }

  /** Attach a transport. The server starts consuming from it immediately. */
  async attach(transport: MCPTransport): Promise<void> {
    if (this.transport) {
      throw new Error('MCPServer: transport already attached');
    }
    this.transport = transport;
    await transport.start();
    this.readerDone = this.consume();
  }

  registerTool(name: string, handler: MCPToolHandler): void {
    this.tools.set(name, handler);
  }

  registerResource(uri: string, handler: MCPResourceHandler): void {
    this.resources.set(uri, handler);
  }

  registerPrompt(name: string, handler: MCPPromptHandler): void {
    this.prompts.set(name, handler);
  }

  listTools(): MCPToolDescriptor[] {
    return Array.from(this.tools.entries()).map(([name, h]) => ({
      name,
      description: h.description,
      inputSchema: h.inputSchema,
    }));
  }

  listResources(): MCPResourceDescriptor[] {
    return Array.from(this.resources.entries()).map(([uri, h]) => ({
      uri,
      name: uri,
      description: h.description,
      mimeType: h.mimeType,
    }));
  }

  listPrompts(): MCPPromptDescriptor[] {
    return Array.from(this.prompts.entries()).map(([name, h]) => ({
      name,
      description: h.description,
      arguments: h.arguments,
    }));
  }

  private async consume(): Promise<void> {
    if (!this.transport) return;
    try {
      for await (const msg of this.transport.messages()) {
        const m = msg as JsonRpcMessage;
        if (isRequest(m)) {
          this.handleRequest(m).catch((err) => {
            this.emit('error', err instanceof Error ? err : new Error(String(err)));
          });
        } else if ('method' in m) {
          this.emit('notification', (m as { method: string }).method, (m as { params?: unknown }).params);
        }
      }
    } catch (err) {
      this.emit('error', err instanceof Error ? err : new Error(String(err)));
    }
  }

  private async handleRequest(req: JsonRpcRequest): Promise<void> {
    if (!this.transport) return;
    this.emit('request', req.method, req.params);
    let result: unknown;
    try {
      switch (req.method) {
        case 'initialize':
          result = {
            protocolVersion: this.protocolVersion,
            capabilities: this.capabilities,
            serverInfo: this.serverInfo,
          };
          break;
        case 'tools/list':
          result = { tools: this.listTools() };
          break;
        case 'tools/call': {
          const { name, arguments: args } = (req.params ?? {}) as {
            name: string;
            arguments?: Record<string, unknown>;
          };
          const handler = this.tools.get(name);
          if (!handler) {
            throw this.error(JSONRPC_ERROR_CODES.METHOD_NOT_FOUND, `tool not found: ${name}`);
          }
          // Per the MCP spec, tool-level errors come back as a normal
          // result with `isError: true` — JSON-RPC errors are reserved
          // for protocol-level issues.
          try {
            result = await handler.invoke(args ?? {});
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            result = {
              isError: true,
              content: [{ type: 'text', text: message }],
            };
          }
          break;
        }
        case 'resources/list':
          result = { resources: this.listResources() };
          break;
        case 'resources/read': {
          const { uri } = (req.params ?? {}) as { uri: string };
          const handler = this.resources.get(uri);
          if (!handler) {
            throw this.error(JSONRPC_ERROR_CODES.METHOD_NOT_FOUND, `resource not found: ${uri}`);
          }
          const content = await handler.read(uri);
          result = { contents: [content] };
          break;
        }
        case 'prompts/list':
          result = { prompts: this.listPrompts() };
          break;
        case 'prompts/get': {
          const { name, arguments: args } = (req.params ?? {}) as {
            name: string;
            arguments?: Record<string, string>;
          };
          const handler = this.prompts.get(name);
          if (!handler) {
            throw this.error(JSONRPC_ERROR_CODES.METHOD_NOT_FOUND, `prompt not found: ${name}`);
          }
          const got = await handler.get(args ?? {});
          result = { description: handler.description, ...got };
          break;
        }
        case 'ping':
          result = {};
          break;
        default:
          throw this.error(
            JSONRPC_ERROR_CODES.METHOD_NOT_FOUND,
            `method not found: ${req.method}`,
          );
      }
      const resp: JsonRpcResponse = { jsonrpc: '2.0', id: req.id, result };
      await this.transport.send(resp);
    } catch (err) {
      const { code, message, data } = this.parseError(err);
      const resp: JsonRpcResponse = {
        jsonrpc: '2.0',
        id: req.id,
        error: { code, message, ...(data !== undefined ? { data } : {}) },
      };
      await this.transport.send(resp);
    }
  }

  private error(code: number, message: string): { code: number; message: string } {
    return { code, message };
  }

  private parseError(err: unknown): { code: number; message: string; data?: unknown } {
    if (err && typeof err === 'object' && 'code' in err && 'message' in err) {
      const e = err as { code: unknown; message: unknown; data?: unknown };
      if (typeof e.code === 'number' && typeof e.message === 'string') {
        return { code: e.code, message: e.message, data: e.data };
      }
    }
    return {
      code: JSONRPC_ERROR_CODES.INTERNAL_ERROR,
      message: err instanceof Error ? err.message : String(err),
    };
  }

  async close(): Promise<void> {
    if (this.transport) {
      await this.transport.close();
      this.transport = null;
    }
    if (this.readerDone) {
      await this.readerDone.catch(() => undefined);
    }
  }
}
