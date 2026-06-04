/**
 * Model Context Protocol (MCP) port.
 *
 * MCP is an open standard (modelcontextprotocol.io, originally
 * Anthropic) for connecting LLM applications to data sources and
 * tools. It is JSON-RPC 2.0 over a transport (stdio, HTTP+SSE, or
 * Streamable HTTP). This port exposes the subset our agent needs:
 *
 *   - connect / disconnect
 *   - listTools()                     — discover what the server offers
 *   - callTool(name, args)            — invoke a tool, get the result
 *   - listResources() / readResource  — for RAG / file-backed servers
 *   - listPrompts() / getPrompt       — for prompt-template servers
 *
 * Two implementations live alongside this port:
 *   - {@link MCPClient}:    client side, connects to a server
 *   - {@link MCPServer}:    server side, exposes our tools / resources
 *
 * Transports (stdio, HTTP) are pluggable via {@link MCPTransport}.
 */

export interface MCPToolDescriptor {
  name: string;
  description?: string;
  /** JSON Schema for the tool's input. */
  inputSchema: Record<string, unknown>;
}

export interface MCPToolResult {
  /** Content blocks: text, image, audio, resource links. */
  content: Array<
    | { type: 'text'; text: string }
    | { type: 'image'; data: string; mimeType: string }
    | { type: 'audio'; data: string; mimeType: string }
    | { type: 'resource'; uri: string; text?: string; mimeType?: string }
  >;
  isError?: boolean;
}

export interface MCPResourceDescriptor {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

export interface MCPResourceContent {
  uri: string;
  mimeType?: string;
  text?: string;
  blob?: string;
}

export interface MCPPromptDescriptor {
  name: string;
  description?: string;
  arguments?: Array<{ name: string; description?: string; required?: boolean }>;
}

export interface MCPPromptMessage {
  role: 'user' | 'assistant' | 'system';
  content:
    | { type: 'text'; text: string }
    | { type: 'image'; data: string; mimeType: string }
    | { type: 'resource'; uri: string; text?: string; mimeType?: string };
}

export interface MCPClientInfo {
  name: string;
  version: string;
}

export interface MCPServerCapabilities {
  tools?: Record<string, never>;
  resources?: { subscribe?: boolean };
  prompts?: Record<string, never>;
  logging?: Record<string, never>;
}

export interface MCPClient {
  readonly id: string;
  readonly serverInfo: { name: string; version: string };
  readonly capabilities: MCPServerCapabilities;
  listTools(): Promise<MCPToolDescriptor[]>;
  callTool(name: string, args: Record<string, unknown>): Promise<MCPToolResult>;
  listResources(): Promise<MCPResourceDescriptor[]>;
  readResource(uri: string): Promise<MCPResourceContent[]>;
  listPrompts(): Promise<MCPPromptDescriptor[]>;
  getPrompt(name: string, args?: Record<string, string>): Promise<{ description?: string; messages: MCPPromptMessage[] }>;
  close(): Promise<void>;
}

export interface MCPTransport {
  /** Open the transport (spawn child process, open HTTP, ...). */
  start(): Promise<void>;
  /** Send a JSON-RPC message (request/notification). */
  send(message: unknown): Promise<void>;
  /** Receive JSON-RPC messages as an async iterable. */
  messages(): AsyncIterable<unknown>;
  /** Tear down. */
  close(): Promise<void>;
}
