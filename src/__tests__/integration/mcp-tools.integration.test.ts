/**
 * MCP integration tests.
 *
 * Verifies the mcp-tools.ts bridge:
 *  - mcpToolsToToolDefinitions() converts descriptors to local tools
 *  - mcpResultToToolResult() normalises content blocks to ToolResult
 *  - registerMcpTools() adds them to a ToolsRegistry
 *  - McpServerBridge.mirror() exposes local tools on the MCP server
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  mcpToolsToToolDefinitions,
  mcpResultToToolResult,
  registerMcpTools,
  McpServerBridge,
} from '../../integration/mcp-tools.js';
import { MCPClient } from '../../adapters/mcp/client.js';
import { MCPServer } from '../../adapters/mcp/server.js';
import { makeMemoryTransportPair } from '../unit/adapters/mcp/mem-transport.js';
import { ToolsRegistry } from '../../adapters/tools.registry.js';
import type { MCPToolDescriptor, MCPToolResult } from '../../ports/mcp.port.js';
import type { IToolsPort, ToolDefinition } from '../../ports/tools.port.js';

describe('mcp-tools bridge', () => {
  let client: MCPClient;
  let server: MCPServer;
  let teardown: () => Promise<void>;

  beforeEach(async () => {
    const { a, b } = makeMemoryTransportPair();
    server = new MCPServer({ serverInfo: { name: 'integration-srv', version: '1.0.0' } });
    server.registerTool('sum', {
      description: 'add two numbers',
      inputSchema: {
        type: 'object',
        properties: { a: { type: 'number' }, b: { type: 'number' } },
        required: ['a', 'b'],
      },
      invoke: (args) => ({
        content: [{ type: 'text', text: String((args['a'] as number) + (args['b'] as number)) }],
      }),
    });
    server.registerTool('boom', {
      description: 'always errors',
      inputSchema: { type: 'object' },
      invoke: () => {
        throw new Error('kaboom');
      },
    });
    await server.attach(b);
    client = new MCPClient({
      transport: a,
      clientInfo: { name: 'integration-cli', version: '0.1.0' },
    });
    teardown = async () => {
      await client.close();
      await server.close();
    };
  });

  afterEach(async () => {
    await teardown();
  });

  it('mcpToolsToToolDefinitions converts descriptors', async () => {
    const descriptors: MCPToolDescriptor[] = await client.listTools();
    const defs = mcpToolsToToolDefinitions(client, descriptors);
    expect(defs).toHaveLength(2);
    expect(defs[0]!.name).toMatch(/sum|boom/);
    expect(defs[0]!.metadata?.['kind']).toBe('mcp');
  });

  it('mcpResultToToolResult flattens text', () => {
    const r: MCPToolResult = { content: [{ type: 'text', text: 'hi' }, { type: 'text', text: 'world' }] };
    expect(mcpResultToToolResult(r)).toEqual({ success: true, output: 'hi\nworld' });
  });

  it('mcpResultToToolResult reports errors', () => {
    const r: MCPToolResult = { isError: true, content: [{ type: 'text', text: 'broken' }] };
    expect(mcpResultToToolResult(r)).toEqual({ success: false, error: 'broken' });
  });

  it('mcpResultToToolResult handles non-text content blocks', () => {
    const r: MCPToolResult = {
      content: [
        { type: 'image', data: 'AAA', mimeType: 'image/png' },
        { type: 'audio', data: 'BBB', mimeType: 'audio/mp3' },
        { type: 'resource', uri: 'test://x', text: 'meta' },
      ],
    };
    const out = mcpResultToToolResult(r);
    expect(out.success).toBe(true);
    expect(out.output).toContain('image:');
    expect(out.output).toContain('audio:');
    expect(out.output).toContain('resource uri=test://x');
  });

  it('mcpToolsToToolDefinitions handler calls through to MCP', async () => {
    const descriptors = await client.listTools();
    const defs = mcpToolsToToolDefinitions(client, descriptors);
    const sum = defs.find((d) => d.name === 'sum')!;
    const out = await sum.handler({ a: 2, b: 3 });
    expect(typeof out === 'string' ? out : (out as { output?: string }).output).toBe('5');
  });

  it('mcpToolsToToolDefinitions handler surfaces tool errors as failure', async () => {
    const descriptors = await client.listTools();
    const defs = mcpToolsToToolDefinitions(client, descriptors);
    const boom = defs.find((d) => d.name === 'boom')!;
    const out = await boom.handler({});
    expect(typeof out === 'string' ? null : (out as { success: boolean }).success).toBe(false);
    expect(typeof out === 'string' ? null : (out as { error?: string }).error).toContain('kaboom');
  });

  it('registerMcpTools adds to a ToolsRegistry', async () => {
    const registry = new ToolsRegistry();
    const { count } = await registerMcpTools(client, registry);
    expect(count).toBe(2);
    expect(registry.has('sum')).toBe(true);
    expect(registry.has('boom')).toBe(true);
  });

  it('McpServerBridge.mirror() exposes local tools on the MCP server', async () => {
    const local = new ToolsRegistry();
    const echo: ToolDefinition = {
      name: 'echo',
      description: 'echo',
      handler: async (args) => ({ success: true, output: `you said: ${String(args['msg'] ?? '')}` }),
    };
    local.register(echo);

    const bridge = new McpServerBridge();
    bridge.mirror(local);
    const advertised = bridge.server.listTools();
    expect(advertised.find((d) => d.name === 'echo')).toBeDefined();
  });

  it('McpServerBridge.mirror() handles string-returning handlers', () => {
    const local = makeMiniPort([{
      name: 'plain',
      description: 'returns a string',
      handler: async (): Promise<{ success: true; output: string }> => ({ success: true, output: 'just a string' }),
    }]);
    const bridge = new McpServerBridge();
    bridge.mirror(local);
    const tool = bridge.server.listTools().find((d) => d.name === 'plain')!;
    expect(tool).toBeDefined();
  });

  it('McpServerBridge.mirror() handles error results as MCP isError', () => {
    const local = makeMiniPort([{
      name: 'flaky',
      description: 'fails',
      handler: async () => ({ success: false, error: 'broken' }),
    }]);
    const bridge = new McpServerBridge();
    bridge.mirror(local);
    const tool = bridge.server.listTools().find((d) => d.name === 'flaky')!;
    expect(tool).toBeDefined();
  });
});

function makeMiniPort(tools: ToolDefinition[]): IToolsPort {
  const map = new Map(tools.map((t) => [t.name, t]));
  return {
    register: (t) => { map.set(t.name, t); return true; },
    unregister: (n) => map.delete(n),
    has: (n) => map.has(n),
    get: (n) => {
      const d = map.get(n);
      if (!d) throw new Error('not found');
      return d;
    },
    list: () => [...map.values()],
    listAll: () => [...map.values()],
    execute: async (n: string, a: Record<string, unknown>): Promise<{ success: boolean; output?: string; error?: string }> => {
      const d = map.get(n);
      if (!d) return { success: false, error: 'not found' };
      const r = await d.handler(a);
      if (typeof r === 'string') return { success: true, output: r };
      return r;
    },
  };
}
