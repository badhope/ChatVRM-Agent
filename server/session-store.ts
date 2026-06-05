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
  // W17 M12: serialise mutations so two concurrent requests can never
  // interleave read-modify-write on the same in-memory array. Without
  // this, an `appendMessage` running in parallel with a `remove` can
  // clobber the in-memory state and the last writer to persist() wins
  // the race. The chain is replaced atomically (a new promise) so any
  // operation queued behind the current one awaits the full flush.
  private writeChain: Promise<void> = Promise.resolve();

  // M17 (W18): cap the number of sessions loaded into memory on
  // boot. The store file is a single JSON document and is fully
  // read into `this.cache` on the first `load()`. A user who has
  // been using the app for a year will have thousands of sessions
  // in that file; loading them all into memory is wasteful and
  // blows the heap under low-memory conditions. We sort by
  // `updatedAt` desc, keep the top N, and drop the rest. The cap
  // is intentionally generous (default 1000) — most users won't
  // notice the difference, and the 99th-percentile case is well
  // under that. Operators who want a different cap can set the
  // env var `PA_SESSION_STORE_MAX` or pass `maxSessions` to the
  // constructor.
  private readonly maxSessions: number;

  constructor(opts: { maxSessions?: number } = {}) {
    const env = Number.parseInt(process.env['PA_SESSION_STORE_MAX'] ?? '', 10);
    const fromEnv = Number.isFinite(env) && env > 0 ? env : NaN;
    this.maxSessions = opts.maxSessions ?? (Number.isFinite(fromEnv) ? fromEnv : 1000);
  }

  private async runExclusive<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.writeChain.then(fn, fn);
    this.writeChain = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }

  private async load(): Promise<ChatSession[]> {
    if (this.loaded) return this.cache;
    await ensureDir();
    try {
      await access(STORE_FILE, constants.F_OK);
      const raw = await readFile(STORE_FILE, 'utf-8');
      const parsed = JSON.parse(raw) as ChatSession[];
      // M17 (W18): cap the in-memory store on boot. Sort by
      // `updatedAt` desc so the cap keeps the *most recently
      // used* sessions, not a random slice. We don't touch the
      // on-disk file here — the cap is a read-time filter; a
      // later PR can add a "compact" command that rewrites the
      // file with only the kept entries.
      parsed.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
      this.cache = parsed.slice(0, this.maxSessions);
    } catch (err) {
      // W17 M12: distinguish "file doesn't exist" (silent — first run)
      // from "file is corrupt" (log so the operator can fix it).
      if (err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code === 'ENOENT') {
        this.cache = [];
      } else {
        const message = err instanceof Error ? err.message : String(err);
        process.stderr.write(`[session-store] failed to load ${STORE_FILE}: ${message}\n`);
        this.cache = [];
      }
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
    return this.runExclusive(async () => {
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
    });
  }

  async appendMessage(id: string, msg: ChatMessage): Promise<ChatSession | undefined> {
    return this.runExclusive(async () => {
      const data = await this.load();
      const s = data.find((x) => x.id === id);
      if (!s) return undefined;
      s.messages.push(msg);
      s.updatedAt = new Date().toISOString();
      // W17 L3: don't auto-title the session on the first user message
      // if the message is a slash command (e.g. `/help`). The user
      // would see `/help` as the conversation title until they send
      // a real message. Skip those.
      if (msg.role === 'user' && s.messages.filter((m) => m.role === 'user').length === 1) {
        const content = msg.content.trim();
        if (content.length > 0 && !content.startsWith('/')) {
          s.title = content.slice(0, 40) + (content.length > 40 ? '…' : '');
        }
      }
      await this.persist();
      return s;
    });
  }

  async updateMessage(id: string, messageId: string, content: string, usage?: ChatMessage['usage']): Promise<void> {
    await this.runExclusive(async () => {
      const data = await this.load();
      const s = data.find((x) => x.id === id);
      if (!s) return;
      const m = s.messages.find((x) => x.id === messageId);
      if (!m) return;
      m.content = content;
      if (usage) m.usage = usage;
      s.updatedAt = new Date().toISOString();
      await this.persist();
    });
  }

  async rename(id: string, title: string): Promise<ChatSession | undefined> {
    return this.runExclusive(async () => {
      const data = await this.load();
      const s = data.find((x) => x.id === id);
      if (!s) return undefined;
      s.title = title;
      s.updatedAt = new Date().toISOString();
      await this.persist();
      return s;
    });
  }

  async remove(id: string): Promise<boolean> {
    return this.runExclusive(async () => {
      const data = await this.load();
      const idx = data.findIndex((x) => x.id === id);
      if (idx < 0) return false;
      data.splice(idx, 1);
      await this.persist();
      return true;
    });
  }

  async removeMany(ids: string[]): Promise<{ removed: number; total: number; errors: string[] }> {
    return this.runExclusive(async () => {
      const data = await this.load();
      let removed = 0;
      const errors: string[] = [];
      for (const id of ids) {
        const idx = data.findIndex((x) => x.id === id);
        if (idx < 0) {
          errors.push(id);
          continue;
        }
        data.splice(idx, 1);
        removed++;
      }
      if (removed > 0) await this.persist();
      return { removed, total: ids.length, errors };
    });
  }

  async clear(): Promise<void> {
    return this.runExclusive(async () => {
      this.cache = [];
      await this.persist();
    });
  }
}
