/**
 * File-backed JSON session store.
 *
 * The default {@link ISessionStore} used in tests and small deployments.
 * The whole database is held in memory and persisted to a JSON file on
 * every `upsert`/`appendMessage`/`remove`. Suitable for <~10k sessions
 * with short message lists; for larger workloads use the SQLite or
 * Postgres adapters that share this port.
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type {
  ISessionStore,
  Session,
  SessionMessage,
  SessionQuery,
} from '../../ports/session-store.port.js';

interface Persisted {
  sessions: Record<string, Session>;
}

export class JsonFileSessionStore implements ISessionStore {
  readonly name = 'json-file';
  private file: string;
  private sessions = new Map<string, Session>();
  private dirty = false;
  private flushTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(file: string) {
    this.file = file;
  }

  static async open(file: string): Promise<JsonFileSessionStore> {
    const s = new JsonFileSessionStore(file);
    await s.init();
    return s;
  }

  async init(): Promise<void> {
    try {
      const raw = await fs.readFile(this.file, 'utf8');
      const parsed = JSON.parse(raw) as Persisted;
      for (const [id, session] of Object.entries(parsed.sessions)) {
        this.sessions.set(id, session);
      }
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw err;
      }
    }
  }

  async get(id: string): Promise<Session | null> {
    return this.sessions.get(id) ?? null;
  }

  async upsert(session: Session): Promise<void> {
    this.sessions.set(session.id, { ...session, updatedAt: Date.now() });
    this.scheduleFlush();
  }

  async appendMessage(id: string, message: SessionMessage): Promise<void> {
    const s = this.sessions.get(id);
    if (!s) {
      const fresh: Session = {
        id,
        metadata: {},
        messages: [message],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      this.sessions.set(id, fresh);
    } else {
      s.messages.push(message);
      s.updatedAt = Date.now();
    }
    this.scheduleFlush();
  }

  async remove(id: string): Promise<boolean> {
    const had = this.sessions.delete(id);
    if (had) this.scheduleFlush();
    return had;
  }

  async list(q: SessionQuery): Promise<Session[]> {
    let arr = Array.from(this.sessions.values());
    if (q.userId !== undefined) arr = arr.filter((s) => s.userId === q.userId);
    if (q.titleContains) {
      const lc = q.titleContains.toLowerCase();
      arr = arr.filter((s) => (s.title ?? '').toLowerCase().includes(lc));
    }
    const dir = q.order === 'asc' ? 1 : -1;
    const key = q.orderBy ?? 'updatedAt';
    arr.sort((a, b) => (a[key] - b[key]) * dir);
    if (q.limit !== undefined) arr = arr.slice(0, q.limit);
    return arr;
  }

  async count(): Promise<number> {
    return this.sessions.size;
  }

  async close(): Promise<void> {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    await this.flushNow();
  }

  private scheduleFlush(): void {
    this.dirty = true;
    if (this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      void this.flushNow();
    }, 50);
  }

  private async flushNow(): Promise<void> {
    if (!this.dirty) return;
    const out: Persisted = { sessions: Object.fromEntries(this.sessions) };
    await fs.mkdir(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(out), 'utf8');
    await fs.rename(tmp, this.file);
    this.dirty = false;
  }
}
