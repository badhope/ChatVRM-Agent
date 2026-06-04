/**
 * Bridge: MCP tools <-> local {@link IToolsPort} tools.
 *
 * The agent sees MCP-server tools as regular tools (just like the
 * in-process ones), with names prefixed `mcp:<server>:` to avoid
 * collisions. {@link makeMcpToolsPort} registers an MCPClient as a
 * ToolsPort adapter; {@link registerToolOnServer} wraps a ToolDefinition
 * as a server-side tool handler.
 */

import type { ToolDefinition, IToolsPort } from '../../ports/tools.port.js';
import type {
  MCPClient,
  MCPToolDescriptor,
  MCPClientInfo,
  MCPServerCapabilities,
} from '../../ports/mcp.port.js';
import { MCPClient as MCPClientImpl } from './client.js';
import { MCPServer, type MCPToolHandler } from './server.js';

export interface McpToolsPortOptions {
  client: MCPClient;
  /** Prefix added to tool names, e.g. "mcp:fs". */
  prefix?: string;
}

export function makeMcpToolsPort(opts: McpToolsPortOptions): IToolsPort {
  const { client, prefix } = opts;
  const tools = new Map<string, ToolDefinition>();

  return {
    register(tool: ToolDefinition): void {
      tools.set(tool.name, tool);
    },
    has(name: string): boolean {
      return tools.has(name);
    },
    get(name: string): ToolDefinition {
      const def = tools.get(name);
      if (!def) throw new Error(`McpToolsPort: tool not found: ${name}`);
      return def;
    },
    listAll(): ToolDefinition[] {
      return Array.from(tools.values());
    },
    async execute(name: string, args: Record<string, unknown>) {
      if (!tools.has(name)) {
        return { success: false, error: `McpToolsPort: tool not found: ${name}` };
      }
      const local = tools.get(name)!;
      try {
        const r = await client.callTool(
          (local.metadata as { mcpToolName: string }).mcpToolName,
          args,
        );
        if (r.isError) {
          return {
            success: false,
            error: r.content
              .map((c) => (c.type === 'text' ? c.text : ''))
              .join('\n'),
          };
        }
        return {
          success: true,
          output: r.content
            .map((c) => {
              if (c.type === 'text') return c.text;
              if (c.type === 'image' || c.type === 'audio') return `[${c.type}:${c.mimeType}]`;
              return `[resource:${c.uri}]`;
            })
            .join('\n'),
        };
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : String(err) };
      }
    },
  };
}

function mcpToDefinition(
  remote: MCPToolDescriptor,
  localName: string,
  client: MCPClient,
): ToolDefinition {
  return {
    name: localName,
    description: remote.description ?? remote.name,
    handler: async (args: Record<string, unknown>) => {
      const r = await client.callTool(remote.name, args);
      return r.content
        .map((c) => (c.type === 'text' ? c.text : `[${c.type}]`))
        .join('\n');
    },
    metadata: { mcpToolName: remote.name, source: 'mcp' },
  };
}

/** Connect to an MCP server over stdio and return a ready client. */
export async function connectStdio(opts: {
  command: string;
  args?: string[];
  env?: NodeJS.ProcessEnv;
  clientInfo: MCPClientInfo;
  protocolVersion?: string;
}): Promise<MCPClient> {
  const { StdioTransport } = await import('./stdio-transport.js');
  const transport = new StdioTransport({
    command: opts.command,
    args: opts.args,
    env: opts.env,
  });
  const client = new MCPClientImpl({
    transport,
    clientInfo: opts.clientInfo,
    protocolVersion: opts.protocolVersion,
  });
  await client.initialize();
  return client;
}

/** Connect to an MCP server over HTTP. */
export async function connectHttp(opts: {
  url: string;
  headers?: Record<string, string>;
  clientInfo: MCPClientInfo;
  protocolVersion?: string;
  eventsUrl?: string;
}): Promise<MCPClient> {
  const { HttpTransport } = await import('./http-transport.js');
  const transport = new HttpTransport({
    url: opts.url,
    headers: opts.headers,
    eventsUrl: opts.eventsUrl,
  });
  const client = new MCPClientImpl({
    transport,
    clientInfo: opts.clientInfo,
    protocolVersion: opts.protocolVersion,
  });
  await client.initialize();
  return client;
}

/** Build a configured MCPServer with the given server info. */
export function makeMcpServer(opts: {
  serverInfo: { name: string; version: string };
  capabilities?: MCPServerCapabilities;
}): MCPServer {
  return new MCPServer(opts);
}

/** Register a local ToolDefinition on an MCPServer. */
export function registerToolOnServer(server: MCPServer, def: ToolDefinition): void {
  const handler: MCPToolHandler = {
    description: def.description,
    inputSchema: (def.parameters as Record<string, unknown> | undefined) ?? {
      type: 'object',
      properties: {},
    },
    invoke: async (args) => {
      const out = await def.handler(args);
      return {
        content: [
          { type: 'text', text: typeof out === 'string' ? out : JSON.stringify(out) },
        ],
      };
    },
  };
  server.registerTool(def.name, handler);
}
