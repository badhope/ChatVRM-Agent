/**
 * MCP tool integration.
 *
 * Connects an MCP (Model Context Protocol) server to the local
 * {@link IToolsPort}. Once registered, the agent can use the remote
 * MCP tools as if they were local — the bridge handles JSON-RPC
 * framing, transports (stdio / HTTP), and result normalisation.
 *
 * Two registration patterns:
 *
 *   1. **Outbound** (we are the MCP client):
 *      connectMcpServer → listTools → mcpToolsToToolDefinitions(...)
 *      → tools.register(...). Use this when a remote MCP server
 *      provides capabilities you want to expose to the agent.
 *
 *   2. **Inbound** (we are the MCP server):
 *      McpServerBridge wraps a local IToolsPort and exposes it as
 *      an MCP server over stdio / HTTP. Use this when another
 *      MCP-aware client should be able to call your tools.
 *
 * Both ship a graceful shutdown (`disconnect()`) that the agent
 * runtime can call on agent lifecycle events.
 */

import {
  MCPClient,
  type MCPClientOptions,
} from '../adapters/mcp/client.js';
import { StdioTransport } from '../adapters/mcp/stdio-transport.js';
import { HttpTransport } from '../adapters/mcp/http-transport.js';
import { MCPServer } from '../adapters/mcp/server.js';
import type { ToolDefinition, ToolResult } from '../ports/tools.port.js';
import type { IToolsPort } from '../ports/tools.port.js';
import type {
  MCPToolDescriptor,
  MCPToolResult,
} from '../ports/mcp.port.js';

type ContentBlock = MCPToolResult['content'][number];

export interface McpClientInfo {
  name: string;
  version: string;
}

const DEFAULT_CLIENT_INFO: McpClientInfo = { name: 'personal-assistant', version: '1.0.0' };

/**
 * Open a stdio MCP connection and return the live client. The caller
 * is responsible for calling `await client.close()` when done.
 */
export async function connectStdioMcp(
  command: string,
  args: string[] = [],
  env: NodeJS.ProcessEnv = {},
  clientInfo: McpClientInfo = DEFAULT_CLIENT_INFO,
): Promise<MCPClient> {
  const transport = new StdioTransport({ command, args, env });
  const client = new MCPClient({ transport, clientInfo } satisfies MCPClientOptions);
  await client.initialize();
  return client;
}

/**
 * Open a streamable-HTTP MCP connection.
 */
export async function connectHttpMcp(
  url: string,
  headers: Record<string, string> = {},
  clientInfo: McpClientInfo = DEFAULT_CLIENT_INFO,
): Promise<MCPClient> {
  const transport = new HttpTransport({ url, headers });
  const client = new MCPClient({ transport, clientInfo } satisfies MCPClientOptions);
  await client.initialize();
  return client;
}

/**
 * Convert a list of MCP tool descriptors to local tool definitions
 * ready to be registered. The handler marshals JSON args to the MCP
 * call, awaits the response, and normalises the result back into a
 * {@link ToolResult}.
 */
export function mcpToolsToToolDefinitions(
  client: MCPClient,
  descriptors: MCPToolDescriptor[],
): ToolDefinition[] {
  return descriptors.map((d) => mcpToolToToolDefinition(client, d));
}

function mcpToolToToolDefinition(client: MCPClient, d: MCPToolDescriptor): ToolDefinition {
  return {
    name: d.name,
    description: d.description ?? '',
    inputSchema: (d.inputSchema ?? { type: 'object', properties: {} }) as Record<string, unknown>,
    metadata: { kind: 'mcp', server: client.serverInfo?.name ?? 'mcp' },
    handler: async (args) => {
      try {
        const res = await client.callTool(d.name, args);
        return mcpResultToToolResult(res);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { success: false, error: msg };
      }
    },
  };
}

/**
 * Normalise an MCP `MCPToolResult` (which is content blocks) into
 * the flat string format our tool port uses.
 */
export function mcpResultToToolResult(r: MCPToolResult): ToolResult {
  if (r.isError) {
    return { success: false, error: r.content.map((c: ContentBlock) => c.type === 'text' ? c.text : `<${c.type}>`).join('\n') };
  }
  const parts: string[] = [];
  for (const block of r.content) {
    if (block.type === 'text') {
      parts.push((block as { type: 'text'; text: string }).text);
    } else if (block.type === 'image') {
      const b = block as { type: 'image'; data: string; mimeType?: string };
      parts.push(`<image:${b.mimeType ?? 'unknown'} data:${b.data.length}B>`);
    } else if (block.type === 'audio') {
      const b = block as { type: 'audio'; data: string; mimeType?: string };
      parts.push(`<audio:${b.mimeType ?? 'unknown'} data:${b.data.length}B>`);
    } else if (block.type === 'resource') {
      const b = block as { type: 'resource'; uri: string };
      parts.push(`<resource uri=${b.uri}>`);
    }
  }
  return { success: true, output: parts.join('\n') };
}

/**
 * One-shot helper: connect → listTools → register on a registry →
 * return the client (caller owns shutdown).
 */
export async function registerMcpTools(
  client: MCPClient,
  tools: IToolsPort,
): Promise<{ count: number; client: MCPClient }> {
  const descs = await client.listTools();
  const defs = mcpToolsToToolDefinitions(client, descs);
  for (const d of defs) tools.register(d);
  return { count: defs.length, client };
}

/**
 * Inbound bridge: expose a local `IToolsPort` as an MCP server.
 * Useful for letting MCP-aware front-ends (Cursor, Claude Desktop,
 * custom clients) call your tools over stdio or HTTP.
 */
export class McpServerBridge {
  readonly server: MCPServer;
  constructor(server?: MCPServer) {
    this.server = server ?? new MCPServer({ serverInfo: { name: 'personal-assistant', version: '1.0.0' } });
  }

  /**
   * Mirror every tool in `tools` onto the embedded MCP server. The
   * bridge re-uses the local handler; the MCP server just frames
   * the JSON-RPC.
   */
  mirror(tools: IToolsPort): void {
    for (const def of tools.listAll()) {
      this.server.registerTool(def.name, {
        description: def.description,
        inputSchema: (def.inputSchema ?? { type: 'object', properties: {} }) as Record<string, unknown>,
        invoke: async (args: Record<string, unknown>) => {
          const r = await def.handler(args);
          if (typeof r === 'string') {
            return { content: [{ type: 'text' as const, text: r }] };
          }
          if (!r.success) {
            return { isError: true, content: [{ type: 'text' as const, text: r.error ?? 'tool error' }] };
          }
          const text = typeof r.output === 'string' ? r.output : JSON.stringify(r.output);
          return { content: [{ type: 'text' as const, text }] };
        },
      });
    }
  }

  /** Start serving over stdio. */
  async serveStdio(command: string, args: string[] = []): Promise<void> {
    const transport = new StdioTransport({ command, args });
    await this.server.attach(transport);
  }

  /** Start serving over HTTP. */
  async serveHttp(url: string): Promise<void> {
    const transport = new HttpTransport({ url });
    await this.server.attach(transport);
  }
}
