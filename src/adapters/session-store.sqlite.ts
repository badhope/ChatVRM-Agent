/**
 * SQLite session store (better-sqlite3).
 *
 * Synchronous SQLite via better-sqlite3 wrapped in an async API. The
 * package is lazy-imported so the project does not require it to be
 * installed; if it isn't, the constructor throws an install hint.
 *
 * Schema:
 *   CREATE TABLE sessions (
 *     id TEXT PRIMARY KEY,
 *     user_id TEXT,
 *     title TEXT,
 *     metadata TEXT NOT NULL,           -- JSON
 *     messages TEXT NOT NULL,            -- JSON
 *     created_at INTEGER NOT NULL,
 *     updated_at INTEGER NOT NULL
 *   );
 *   CREATE INDEX sessions_user_idx ON sessions(user_id);
 *   CREATE INDEX sessions_updated_idx ON sessions(updated_at);
 */

import type {
  ISessionStore,
  Session,
  SessionMessage,
  SessionQuery,
} from '../ports/session-store.port.js';

interface BetterSqliteSync {
  prepare(sql: string): BetterSqliteStatement;
  exec(sql: string): void;
  close(): void;
}
interface BetterSqliteStatement {
  run(...params: unknown[]): BetterSqliteRunResult;
  get(...params: unknown[]): unknown;
  all(...params: unknown[]): unknown[];
}
interface BetterSqliteRunResult {
  changes: number;
  lastInsertRowid: number | bigint;
}

type DatabaseCtor = new (filename: string, opts?: Record<string, unknown>) => BetterSqliteSync;

async function importBetterSqlite3(): Promise<DatabaseCtor> {
  try {
    const mod = (await import('better-sqlite3')) as unknown as { default?: DatabaseCtor } & DatabaseCtor;
    return (mod as { default?: DatabaseCtor }).default ?? (mod as unknown as DatabaseCtor);
  } catch {
    throw new Error('SqliteSessionStore requires `better-sqlite3`. Install with: npm install better-sqlite3');
  }
}

export class SqliteSessionStore implements ISessionStore {
  readonly name = 'sqlite';
  private db: BetterSqliteSync | null = null;
  private filename: string;

  private constructor(filename: string) {
    this.filename = filename;
  }

  static async open(filename: string): Promise<SqliteSessionStore> {
    const s = new SqliteSessionStore(filename);
    await s.init();
    return s;
  }

  async init(): Promise<void> {
    const DbCtor = await importBetterSqlite3();
    this.db = new DbCtor(this.filename);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        title TEXT,
        metadata TEXT NOT NULL,
        messages TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id);
      CREATE INDEX IF NOT EXISTS sessions_updated_idx ON sessions(updated_at);
    `);
  }

  async get(id: string): Promise<Session | null> {
    const row = this.db!.prepare('SELECT * FROM sessions WHERE id = ?').get(id) as
      | Record<string, unknown>
      | undefined;
    if (!row) return null;
    return rowToSession(row);
  }

  async upsert(session: Session): Promise<void> {
    const updated = Date.now();
    const created = session.createdAt ?? updated;
    this.db!
      .prepare(
        `INSERT INTO sessions (id, user_id, title, metadata, messages, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           user_id=excluded.user_id,
           title=excluded.title,
           metadata=excluded.metadata,
           messages=excluded.messages,
           updated_at=excluded.updated_at`,
      )
      .run(
        session.id,
        session.userId ?? null,
        session.title ?? null,
        JSON.stringify(session.metadata ?? {}),
        JSON.stringify(session.messages ?? []),
        created,
        updated,
      );
  }

  async appendMessage(id: string, message: SessionMessage): Promise<void> {
    const existing = await this.get(id);
    if (!existing) {
      await this.upsert({
        id,
        metadata: {},
        messages: [message],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      return;
    }
    existing.messages.push(message);
    existing.updatedAt = Date.now();
    await this.upsert(existing);
  }

  async remove(id: string): Promise<boolean> {
    const res = this.db!.prepare('DELETE FROM sessions WHERE id = ?').run(id);
    return res.changes > 0;
  }

  async list(q: SessionQuery): Promise<Session[]> {
    const clauses: string[] = [];
    const params: unknown[] = [];
    if (q.userId !== undefined) {
      clauses.push('user_id = ?');
      params.push(q.userId);
    }
    if (q.titleContains) {
      clauses.push('LOWER(title) LIKE ?');
      params.push(`%${q.titleContains.toLowerCase()}%`);
    }
    const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
    const orderCol = q.orderBy ?? 'updatedAt';
    const colName = orderCol === 'updatedAt' ? 'updated_at' : 'created_at';
    const order = q.order === 'asc' ? 'ASC' : 'DESC';
    const sql = `SELECT * FROM sessions ${where} ORDER BY ${colName} ${order} LIMIT ?`;
    params.push(q.limit ?? 1000);
    const rows = this.db!.prepare(sql).all(...params) as Array<Record<string, unknown>>;
    return rows.map(rowToSession);
  }

  async count(): Promise<number> {
    const row = this.db!.prepare('SELECT COUNT(*) AS n FROM sessions').get() as { n: number };
    return row.n;
  }

  async close(): Promise<void> {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}

function rowToSession(row: Record<string, unknown>): Session {
  return {
    id: row.id as string,
    userId: (row.user_id as string) ?? undefined,
    title: (row.title as string) ?? undefined,
    metadata: JSON.parse((row.metadata as string) ?? '{}') as Record<string, unknown>,
    messages: JSON.parse((row.messages as string) ?? '[]') as SessionMessage[],
    createdAt: row.created_at as number,
    updatedAt: row.updated_at as number,
  };
}
