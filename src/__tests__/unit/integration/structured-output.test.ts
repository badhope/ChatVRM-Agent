/**
 * Structured output tests.
 */

import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { buildStructuredMessages, parseStructured, StructuredError } from '../../../integration/structured-output.js';

describe('buildStructuredMessages', () => {
  it('produces a system + user message pair', () => {
    const schema = z.object({ name: z.string(), age: z.number() });
    const msgs = buildStructuredMessages({ schema, prompt: 'who is the user' });
    expect(msgs).toHaveLength(2);
    expect(msgs[0]!.role).toBe('system');
    expect(msgs[1]!.role).toBe('user');
    expect((msgs[1] as { content: string }).content).toBe('who is the user');
  });

  it('describes required fields in the system prompt', () => {
    const schema = z.object({ name: z.string(), nickname: z.string().optional() });
    const msgs = buildStructuredMessages({ schema, prompt: 'p' });
    const sys = (msgs[0] as { content: string }).content;
    expect(sys).toContain('"name"');
    expect(sys).toContain('"type":"string"');
    expect(sys).toContain('"required":["name"]');
  });

  it('honours the fence flag', () => {
    const msgs = buildStructuredMessages({ schema: z.object({}), prompt: 'p', fence: true });
    const sys = (msgs[0] as { content: string }).content;
    expect(sys).toContain('```json');
  });

  it('prepends prior messages', () => {
    const msgs = buildStructuredMessages({
      schema: z.object({}),
      prompt: 'p',
      priorMessages: [{ role: 'system', content: 'context' }],
    });
    expect(msgs[0]!.role).toBe('system');
    expect((msgs[0] as { content: string }).content).toBe('context');
    expect((msgs[1] as { content: string }).content).toContain('STRICT JSON');
    expect((msgs[2] as { content: string }).content).toBe('p');
  });
});

describe('parseStructured', () => {
  const schema = z.object({ answer: z.string(), confidence: z.number() });

  it('parses a clean JSON object', () => {
    const r = parseStructured('{"answer":"42","confidence":0.9}', schema);
    expect(r.value).toEqual({ answer: '42', confidence: 0.9 });
    expect(r.raw).toContain('answer');
  });

  it('extracts JSON from a markdown fence', () => {
    const r = parseStructured('```json\n{"answer":"42","confidence":0.9}\n```', schema);
    expect(r.value.answer).toBe('42');
  });

  it('extracts JSON embedded in prose', () => {
    const r = parseStructured('Here you go: {"answer":"42","confidence":0.9} — let me know', schema);
    expect(r.value.answer).toBe('42');
  });

  it('extracts the first balanced JSON when multiple objects appear', () => {
    const r = parseStructured('a: {"answer":"first","confidence":0.1} b: {"answer":"second","confidence":0.9}', schema);
    expect(r.value.answer).toBe('first');
  });

  it('repairs trailing commas', () => {
    const r = parseStructured('{"answer":"42","confidence":0.9,}', schema);
    expect(r.value.confidence).toBe(0.9);
  });

  it('repairs Python None/True/False', () => {
    // Use a string schema since `True` repairs to boolean `true`.
    const s = z.object({ answer: z.string(), ok: z.boolean() });
    const r = parseStructured('{"answer":"42","ok":True}', s);
    expect(r.value.ok).toBe(true);
  });

  it('strips line comments', () => {
    const r = parseStructured('{\n  "answer":"42", // the answer\n  "confidence":0.9\n}', schema);
    expect(r.value.answer).toBe('42');
  });

  it('throws on no JSON found', () => {
    expect(() => parseStructured('nothing parseable here', schema)).toThrow(StructuredError);
  });

  it('throws on schema validation failure', () => {
    expect(() => parseStructured('{"answer":42,"confidence":"oops"}', schema)).toThrow(/Schema validation failed/);
  });

  it('handles arrays', () => {
    const arrSchema = z.array(z.object({ x: z.number() }));
    const r = parseStructured('[{"x":1},{"x":2}]', arrSchema);
    expect(r.value).toHaveLength(2);
    expect(r.value[0]!.x).toBe(1);
  });

  it('handles nested objects', () => {
    const nested = z.object({
      user: z.object({ name: z.string(), age: z.number() }),
    });
    const r = parseStructured('{"user":{"name":"alice","age":30}}', nested);
    expect(r.value.user.name).toBe('alice');
  });
});
