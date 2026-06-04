import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { JsonFileSessionStore } from '../../../adapters/session-store.json.js';
import type { Session } from '../../../ports/session-store.port.js';

describe('JsonFileSessionStore', () => {
  let tmpDir: string;
  let file: string;
  let store: JsonFileSessionStore;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pa-sess-'));
    file = path.join(tmpDir, 'sessions.json');
    store = await JsonFileSessionStore.open(file);
  });
  afterEach(async () => {
    await store.close();
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('starts empty', async () => {
    expect(await store.count()).toBe(0);
  });

  it('upserts and retrieves a session', async () => {
    const session: Session = {
      id: 's1',
      metadata: { foo: 'bar' },
      messages: [
        { id: 'm1', role: 'user', content: 'hi', createdAt: Date.now() },
      ],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await store.upsert(session);
    const got = await store.get('s1');
    expect(got).not.toBeNull();
    expect(got?.messages[0].content).toBe('hi');
    expect(got?.metadata.foo).toBe('bar');
  });

  it('appends messages to existing session', async () => {
    await store.appendMessage('s1', { id: 'm1', role: 'user', content: 'hi', createdAt: 1 });
    await store.appendMessage('s1', { id: 'm2', role: 'assistant', content: 'hello', createdAt: 2 });
    const got = await store.get('s1');
    expect(got?.messages).toHaveLength(2);
    expect(got?.messages[1].content).toBe('hello');
  });

  it('creates a session when appendMessage is called on missing id', async () => {
    await store.appendMessage('new', { id: 'm1', role: 'user', content: 'x', createdAt: 1 });
    const got = await store.get('new');
    expect(got).not.toBeNull();
    expect(got?.messages[0].content).toBe('x');
  });

  it('removes a session', async () => {
    await store.upsert({
      id: 'r',
      metadata: {},
      messages: [],
      createdAt: 0,
      updatedAt: 0,
    });
    expect(await store.remove('r')).toBe(true);
    expect(await store.get('r')).toBeNull();
  });

  it('lists with user / title filter and limit', async () => {
    const base: Session = {
      id: '',
      metadata: {},
      messages: [],
      createdAt: 0,
      updatedAt: 0,
    };
    for (const [id, userId, title] of [
      ['a', 'u1', 'alpha'],
      ['b', 'u1', 'beta'],
      ['c', 'u2', 'gamma'],
    ] as const) {
      await store.upsert({ ...base, id, userId, title });
    }
    const list = await store.list({ userId: 'u1' });
    expect(list.map((s) => s.id).sort()).toEqual(['a', 'b']);
    const byTitle = await store.list({ titleContains: 'alpha' });
    expect(byTitle.map((s) => s.id)).toEqual(['a']);
    const limited = await store.list({ limit: 1 });
    expect(limited).toHaveLength(1);
  });

  it('persists across open/close', async () => {
    await store.upsert({
      id: 'persist',
      metadata: { v: 1 },
      messages: [{ id: 'm', role: 'user', content: 'persist me', createdAt: 1 }],
      createdAt: 1,
      updatedAt: 1,
    });
    await store.close();
    const store2 = await JsonFileSessionStore.open(file);
    const got = await store2.get('persist');
    expect(got?.metadata.v).toBe(1);
    expect(got?.messages[0].content).toBe('persist me');
    await store2.close();
  });
});
