import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MCPClient } from '../../../../adapters/mcp/client.js';
import { MCPServer } from '../../../../adapters/mcp/server.js';
import { makeMcpToolsPort, registerToolOnServer } from '../../../../adapters/mcp/bridge.js';
import { makeMemoryTransportPair } from './mem-transport.js';
import { JsonRpcErrorException } from '../../../../adapters/mcp/jsonrpc.js';
import { z } from 'zod';
import { zodToJsonSchema } from '../../../../agents/zod-schema.js';

describe('MCPClient + MCPServer over memory transport', () => {
  let client: MCPClient;
  let server: MCPServer;
  let teardown: () => Promise<void>;

  beforeEach(async () => {
    const { a, b } = makeMemoryTransportPair();
    server = new MCPServer({ serverInfo: { name: 'test-srv', version: '1.0.0' } });
    server.registerTool('echo', {
      description: 'echo back the input',
      inputSchema: {
        type: 'object',
        properties: { text: { type: 'string' } },
        required: ['text'],
      },
      invoke: (args) => ({
        content: [{ type: 'text', text: `echo:${(args.text as string) ?? ''}` }],
      }),
    });
    server.registerTool('fail', {
      description: 'always fails',
      inputSchema: { type: 'object' },
      invoke: () => {
        throw new Error('intentional failure');
      },
    });
    server.registerResource('test://hello', {
      description: 'a hello resource',
      mimeType: 'text/plain',
      read: () => ({ uri: 'test://hello', mimeType: 'text/plain', text: 'hello world' }),
    });
    server.registerPrompt('greet', {
      description: 'greet the user',
      arguments: [{ name: 'name', required: true }],
      get: (args) => ({
        messages: [
          { role: 'user', content: { type: 'text', text: `Greet ${args.name}` } },
        ],
      }),
    });
    await server.attach(b);
    client = new MCPClient({
      transport: a,
      clientInfo: { name: 'test-cli', version: '0.1.0' },
    });
    teardown = async () => {
      await client.close();
      await server.close();
    };
  });

  afterEach(async () => {
    await teardown();
  });

  it('completes the initialize handshake', async () => {
    await client.initialize();
    expect(client.serverInfo).toEqual({ name: 'test-srv', version: '1.0.0' });
    expect(client.capabilities.tools).toBeDefined();
    expect(client.capabilities.resources).toBeDefined();
    expect(client.capabilities.prompts).toBeDefined();
  });

  it('lists tools', async () => {
    const tools = await client.listTools();
    const names = tools.map((t) => t.name).sort();
    expect(names).toEqual(['echo', 'fail']);
    const echo = tools.find((t) => t.name === 'echo');
    expect(echo?.description).toBe('echo back the input');
    expect(echo?.inputSchema.type).toBe('object');
  });

  it('calls a tool and gets the result', async () => {
    const r = await client.callTool('echo', { text: 'hi' });
    expect(r.isError).toBeFalsy();
    expect(r.content[0]).toEqual({ type: 'text', text: 'echo:hi' });
  });

  it('marks failing tool result with isError', async () => {
    const r = await client.callTool('fail', {});
    expect(r.isError).toBe(true);
  });

  it('returns method-not-found for unknown tool', async () => {
    await expect(client.callTool('nope', {})).rejects.toBeInstanceOf(JsonRpcErrorException);
  });

  it('lists and reads resources', async () => {
    const list = await client.listResources();
    expect(list).toHaveLength(1);
    expect(list[0].uri).toBe('test://hello');
    const contents = await client.readResource('test://hello');
    expect(contents[0].text).toBe('hello world');
  });

  it('lists and gets prompts', async () => {
    const list = await client.listPrompts();
    expect(list[0].name).toBe('greet');
    const got = await client.getPrompt('greet', { name: 'Alice' });
    expect(got.messages[0].content).toEqual({ type: 'text', text: 'Greet Alice' });
  });

  it('handles concurrent requests', async () => {
    const results = await Promise.all(
      [1, 2, 3, 4, 5].map((i) => client.callTool('echo', { text: String(i) })),
    );
    expect(results.map((r) => r.content[0])).toEqual(
      [1, 2, 3, 4, 5].map((i) => ({ type: 'text', text: `echo:${i}` })),
    );
  });
});

describe('makeMcpToolsPort', () => {
  it('wraps remote tools into a local IToolsPort and executes them', async () => {
    const { a, b } = makeMemoryTransportPair();
    const server = new MCPServer({ serverInfo: { name: 's', version: '1' } });
    server.registerTool('add', {
      description: 'add two numbers',
      inputSchema: { type: 'object' },
      invoke: (args) => ({
        content: [
          {
            type: 'text',
            text: String(((args.a as number) ?? 0) + ((args.b as number) ?? 0)),
          },
        ],
      }),
    });
    await server.attach(b);
    const client = new MCPClient({
      transport: a,
      clientInfo: { name: 'c', version: '1' },
    });
    const port = makeMcpToolsPort({ client, prefix: 'mcp:test' });
    // Manually refresh and register to simulate discovery.
    const tools = await client.listTools();
    for (const t of tools) {
      const localName = `mcp:test:${t.name}`;
      port.register({
        name: localName,
        description: t.description ?? t.name,
        handler: async (args) => {
          const r = await client.callTool(t.name, args);
          return r.content.map((c) => (c.type === 'text' ? c.text : '')).join('\n');
        },
        metadata: { mcpToolName: t.name },
      });
    }
    expect(port.has('mcp:test:add')).toBe(true);
    const result = await port.execute('mcp:test:add', { a: 2, b: 3 });
    expect(result.success).toBe(true);
    expect(result.output).toBe('5');
    await client.close();
    await server.close();
  });
});

describe('registerToolOnServer', () => {
  it('exposes a local tool def through an MCPServer', async () => {
    const { a, b } = makeMemoryTransportPair();
    const server = new MCPServer({ serverInfo: { name: 's', version: '1' } });
    const schema = zodToJsonSchema(
      z.object({ name: z.string().describe('who to greet') }),
    );
    registerToolOnServer(server, {
      name: 'greet',
      description: 'greet someone',
      parameters: schema,
      handler: async (args) => `Hello, ${args.name as string}!`,
    });
    await server.attach(b);
    const client = new MCPClient({
      transport: a,
      clientInfo: { name: 'c', version: '1' },
    });
    const r = await client.callTool('greet', { name: 'World' });
    expect(r.content[0]).toEqual({ type: 'text', text: 'Hello, World!' });
    await client.close();
    await server.close();
  });
});
