import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { zodToJsonSchema, toProviderTools } from '../../../agents/zod-schema.js';

describe('zod-schema', () => {
  describe('zodToJsonSchema', () => {
    it('converts a simple string schema', () => {
      const schema = z.object({ name: z.string() });
      const json = zodToJsonSchema(schema);
      expect(json).toMatchObject({
        type: 'object',
        properties: { name: { type: 'string' } },
        required: ['name'],
      });
    });

    it('converts optional fields to non-required', () => {
      const schema = z.object({ name: z.string(), age: z.number().optional() });
      const json = zodToJsonSchema(schema);
      expect(json).toMatchObject({
        type: 'object',
        properties: { name: { type: 'string' }, age: { type: 'number' } },
        required: ['name'],
      });
    });

    it('treats .default() as non-required', () => {
      const schema = z.object({ count: z.number().default(0) });
      const json = zodToJsonSchema(schema);
      expect(json).toMatchObject({ type: 'object' });
      expect((json as { required?: string[] }).required ?? []).toEqual([]);
    });

    it('converts z.number() with int check to integer', () => {
      const schema = z.object({ count: z.number().int() });
      const json = zodToJsonSchema(schema);
      expect((json as { properties: Record<string, unknown> }).properties.count).toMatchObject({ type: 'integer' });
    });

    it('converts enums', () => {
      const schema = z.object({ color: z.enum(['red', 'green', 'blue']) });
      const json = zodToJsonSchema(schema);
      expect((json as { properties: Record<string, unknown> }).properties.color).toMatchObject({
        type: 'string',
        enum: ['red', 'green', 'blue'],
      });
    });

    it('converts arrays', () => {
      const schema = z.object({ tags: z.array(z.string()) });
      const json = zodToJsonSchema(schema);
      expect((json as { properties: Record<string, unknown> }).properties.tags).toMatchObject({
        type: 'array',
        items: { type: 'string' },
      });
    });

    it('preserves descriptions', () => {
      const schema = z.object({ name: z.string().describe('The user name') });
      const json = zodToJsonSchema(schema);
      expect((json as { properties: Record<string, unknown> }).properties.name).toMatchObject({
        type: 'string',
        description: 'The user name',
      });
    });

    it('handles nested objects', () => {
      const schema = z.object({
        user: z.object({ id: z.string(), email: z.string() }),
      });
      const json = zodToJsonSchema(schema);
      const user = ((json as { properties: Record<string, { type: string; properties: Record<string, unknown> }> }).properties.user);
      expect(user.type).toBe('object');
      expect(user.properties).toMatchObject({ id: { type: 'string' }, email: { type: 'string' } });
    });
  });

  describe('toProviderTools', () => {
    const specs = [
      { name: 'search', description: 'search the web', parameters: { type: 'object', properties: { q: { type: 'string' } }, required: ['q'] } },
    ];

    it('emits OpenAI function-calling shape', () => {
      const out = toProviderTools(specs, 'openai');
      expect(out.tools).toEqual([
        { type: 'function', function: { name: 'search', description: 'search the web', parameters: specs[0]!.parameters } },
      ]);
      expect(out.toolChoice).toBe('auto');
    });

    it('emits Anthropic tool_use shape with input_schema', () => {
      const out = toProviderTools(specs, 'anthropic');
      expect(out.tools).toEqual([
        { name: 'search', description: 'search the web', input_schema: specs[0]!.parameters },
      ]);
      expect(out.toolChoice).toEqual({ type: 'auto' });
    });

    it('emits Google functionDeclarations wrapper', () => {
      const out = toProviderTools(specs, 'google');
      expect(out.tools).toEqual([
        { functionDeclarations: [{ name: 'search', description: 'search the web', parameters: specs[0]!.parameters }] },
      ]);
      expect(out.toolChoice).toEqual({ mode: 'AUTO' });
    });

    it('emits Baidu function-calling shape', () => {
      const out = toProviderTools(specs, 'baidu');
      expect(out.tools).toEqual([
        { type: 'function', function: { name: 'search', description: 'search the web', parameters: specs[0]!.parameters } },
      ]);
    });

    it('maps toolChoice=required to provider-specific required flag', () => {
      expect(toProviderTools(specs, 'openai', 'required').toolChoice).toBe('required');
      expect(toProviderTools(specs, 'anthropic', 'required').toolChoice).toEqual({ type: 'any' });
      expect(toProviderTools(specs, 'google', 'required').toolChoice).toEqual({ mode: 'ANY' });
    });

    it('maps toolChoice=function(name) to force a specific tool', () => {
      expect(toProviderTools(specs, 'openai', { name: 'search' }).toolChoice).toEqual({
        type: 'function',
        function: { name: 'search' },
      });
      expect(toProviderTools(specs, 'anthropic', { name: 'search' }).toolChoice).toEqual({
        type: 'tool',
        name: 'search',
      });
      expect(toProviderTools(specs, 'google', { name: 'search' }).toolChoice).toEqual({
        mode: 'ANY',
        allowedFunctionNames: ['search'],
      });
    });
  });
});
