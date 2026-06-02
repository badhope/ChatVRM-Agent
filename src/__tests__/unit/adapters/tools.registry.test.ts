import { describe, it, expect } from 'vitest';
import { ToolsRegistry } from '../../../adapters/tools.registry.js';

describe('ToolsRegistry', () => {
  it('should register and retrieve a tool', () => {
    const reg = new ToolsRegistry();
    reg.register({ name: 'foo', description: 'foo tool', handler: async () => 'bar' });
    expect(reg.has('foo')).toBe(true);
    expect(reg.count()).toBe(1);
    const tool = reg.get('foo');
    expect(tool.name).toBe('foo');
  });

  it('should throw on missing tool', () => {
    const reg = new ToolsRegistry();
    expect(() => reg.get('missing')).toThrow(/not registered/);
  });

  it('should execute a tool handler', async () => {
    const reg = new ToolsRegistry();
    reg.register({
      name: 'adder',
      description: 'add numbers',
      handler: async (args) => String((args.a as number) + (args.b as number)),
    });
    const result = await reg.execute('adder', { a: 2, b: 3 });
    expect(result.success).toBe(true);
    expect(result.output).toBe('5');
  });

  it('should return structured result from handler', async () => {
    const reg = new ToolsRegistry();
    reg.register({
      name: 'struct',
      description: 'structured',
      handler: async () => ({ success: true, output: 'structured' }),
    });
    const result = await reg.execute('struct', {});
    expect(result.output).toBe('structured');
  });

  it('should catch handler errors and return failure', async () => {
    const reg = new ToolsRegistry();
    reg.register({
      name: 'bad',
      description: 'throws',
      handler: async () => { throw new Error('boom'); },
    });
    const result = await reg.execute('bad', {});
    expect(result.success).toBe(false);
    expect(result.error).toBe('boom');
  });

  it('should unregister a tool', () => {
    const reg = new ToolsRegistry();
    reg.register({ name: 'temp', description: 'tmp', handler: async () => 'x' });
    reg.unregister('temp');
    expect(reg.has('temp')).toBe(false);
  });

  it('should list all tools', () => {
    const reg = new ToolsRegistry();
    reg.register({ name: 'a', description: 'a', handler: async () => 'a' });
    reg.register({ name: 'b', description: 'b', handler: async () => 'b' });
    const list = reg.listAll();
    expect(list.length).toBe(2);
    expect(list.map((t) => t.name).sort()).toEqual(['a', 'b']);
  });

  it('should reject tool without name', () => {
    const reg = new ToolsRegistry();
    expect(() => reg.register({ name: '', description: 'd', handler: async () => 'x' })).toThrow();
  });

  it('should reject tool without handler', () => {
    const reg = new ToolsRegistry();
    const badHandler = undefined as unknown as (args: Record<string, unknown>) => Promise<string | { success: boolean; output?: string; error?: string }>;
    expect(() => reg.register({ name: 'x', description: 'd', handler: badHandler })).toThrow();
  });

  it('should return failure result for unregistered tool', async () => {
    const reg = new ToolsRegistry();
    const result = await reg.execute('missing', {});
    expect(result.success).toBe(false);
    expect(result.error).toContain('not registered');
  });
});
