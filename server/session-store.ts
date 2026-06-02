import { randomUUID } from 'node:crypto';
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type { ChatSession, ChatMessage } from './types.js';

const STORE_DIR = path.join(os.homedir(), '.personal-assistant');
const STORE_FILE = path.join(STORE_DIR, 'web-sessions.json');

async function ensureDir(): Promise<void> {
  await mkdir(STORE_DIR, { recursive: true });
}

export class SessionStore {
  private cache: ChatSession[] = [];
  private loaded = false;

  private async load(): Promise<ChatSession[]> {
    if (this.loaded) return this.cache;
    await ensureDir();
    try {
      await access(STORE_FILE, constants.F_OK);
      const raw = await readFile(STORE_FILE, 'utf-8');
      this.cache = JSON.parse(raw) as ChatSession[];
    } catch {
      this.cache = [];
    }
    this.loaded = true;
    return this.cache;
  }

  private async persist(): Promise<void> {
    await ensureDir();
    await writeFile(STORE_FILE, JSON.stringify(this.cache, null, 2), 'utf-8');
  }

  async list(): Promise<ChatSession[]> {
    const data = await this.load();
    return [...data].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  }

  async get(id: string): Promise<ChatSession | undefined> {
    const data = await this.load();
    return data.find((s) => s.id === id);
  }

  async create(opts: { title?: string; provider?: string; model?: string } = {}): Promise<ChatSession> {
    const data = await this.load();
    const now = new Date().toISOString();
    const session: ChatSession = {
      id: randomUUID(),
      title: opts.title ?? '新对话',
      createdAt: now,
      updatedAt: now,
      messages: [],
      provider: opts.provider as any,
      model: opts.model,
    };
    data.push(session);
    await this.persist();
    return session;
  }

  async appendMessage(id: string, msg: ChatMessage): Promise<ChatSession | undefined> {
    const data = await this.load();
    const s = data.find((x) => x.id === id);
    if (!s) return undefined;
    s.messages.push(msg);
    s.updatedAt = new Date().toISOString();
    if (msg.role === 'user' && s.messages.filter((m) => m.role === 'user').length === 1) {
      s.title = msg.content.slice(0, 40) + (msg.content.length > 40 ? '…' : '');
    }
    await this.persist();
    return s;
  }

  async updateMessage(id: string, messageId: string, content: string, usage?: ChatMessage['usage']): Promise<void> {
    const data = await this.load();
    const s = data.find((x) => x.id === id);
    if (!s) return;
    const m = s.messages.find((x) => x.id === messageId);
    if (!m) return;
    m.content = content;
    if (usage) m.usage = usage;
    s.updatedAt = new Date().toISOString();
    await this.persist();
  }

  async rename(id: string, title: string): Promise<ChatSession | undefined> {
    const data = await this.load();
    const s = data.find((x) => x.id === id);
    if (!s) return undefined;
    s.title = title;
    s.updatedAt = new Date().toISOString();
    await this.persist();
    return s;
  }

  async remove(id: string): Promise<boolean> {
    const data = await this.load();
    const idx = data.findIndex((x) => x.id === id);
    if (idx < 0) return false;
    data.splice(idx, 1);
    await this.persist();
    return true;
  }

  async clear(): Promise<void> {
    this.cache = [];
    await this.persist();
  }
}
