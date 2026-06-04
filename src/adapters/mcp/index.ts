/**
 * MCP (Model Context Protocol) — Anthropic's open standard for
 * connecting LLM applications to data sources and tools.
 *
 * Public surface:
 *   - {@link MCPClient}            : connect to a server, list / call tools
 *   - {@link MCPServer}            : expose tools / resources / prompts
 *   - {@link StdioTransport}       : child-process NDJSON transport
 *   - {@link HttpTransport}        : Streamable HTTP transport (POST + SSE)
 *   - {@link makeMcpToolsPort}     : wrap an MCP client as a local tools port
 *   - {@link registerToolOnServer} : wrap a local tool def as a server tool
 *   - {@link connectStdio} / {@link connectHttp}
 */

export { MCPClient } from './client.js';
export type { MCPClientOptions } from './client.js';
export { MCPServer } from './server.js';
export type {
  MCPToolHandler,
  MCPResourceHandler,
  MCPPromptHandler,
  MCPServerOptions,
} from './server.js';
export { StdioTransport } from './stdio-transport.js';
export type { StdioTransportOptions } from './stdio-transport.js';
export { HttpTransport } from './http-transport.js';
export type { HttpTransportOptions } from './http-transport.js';
export {
  makeMcpToolsPort,
  connectStdio,
  connectHttp,
  makeMcpServer,
  registerToolOnServer,
} from './bridge.js';
export type { McpToolsPortOptions } from './bridge.js';
export {
  JsonRpcErrorException,
  JSONRPC_ERROR_CODES,
  isRequest,
  isResponse,
  isNotification,
} from './jsonrpc.js';
export type {
  JsonRpcRequest,
  JsonRpcNotification,
  JsonRpcSuccess,
  JsonRpcError,
  JsonRpcResponse,
  JsonRpcMessage,
} from './jsonrpc.js';
