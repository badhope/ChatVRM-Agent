/**
 * Postgres session store (pg).
 *
 * Uses the `pg` package via a connection pool. Lazy-imported so the
 * project doesn't force-install it.
 *
 * Schema:
 *   CREATE TABLE IF NOT EXISTS sessions (
 *     id          TEXT PRIMARY KEY,
 *     user_id     TEXT,
 *     title       TEXT,
 *     metadata    JSONB NOT NULL DEFAULT '{}'::jsonb,
 *     messages    JSONB NOT NULL DEFAULT '[]'::jsonb,
 *     created_at  BIGINT NOT NULL,
 *     updated_at  BIGINT NOT NULL
 *   );
 *   CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id);
 *   CREATE INDEX IF NOT EXISTS sessions_updated_idx ON sessions(updated_at);
 */

import type {
  ISessionStore,
  Session,
  SessionMessage,
  SessionQuery,
} from '../ports/session-store.port.js';

interface PgClient {
  query(sql: string, params?: unknown[]): Promise<{ rows: Array<Record<string, unknown>>; rowCount: number }>;
  release(): void;
}
interface PgPool {
  connect(): Promise<PgClient>;
  end(): Promise<void>;
  on(event: string, listener: (...args: unknown[]) => void): unknown;
}

async function importPg(): Promise<{ Pool: new (opts: Record<string, unknown>) => PgPool }> {
  try {
    return (await import('pg')) as { Pool: new (opts: Record<string, unknown>) => PgPool };
  } catch {
    throw new Error('PostgresSessionStore requires `pg`. Install with: npm install pg @types/pg');
  }
}

export interface PostgresSessionStoreOptions {
  connectionString?: string;
  host?: string;
  port?: number;
  database?: string;
  user?: string;
  password?: string;
  tableName?: string;
  pool?: PgPool;
}

export class PostgresSessionStore implements ISessionStore {
  readonly name = 'postgres';
  private pool: PgPool | null = null;
  private table: string;

  private constructor(table: string) {
    this.table = sanitizeTable(table);
  }

  static async open(opts: PostgresSessionStoreOptions): Promise<PostgresSessionStore> {
    const s = new PostgresSessionStore(opts.tableName ?? 'sessions');
    if (opts.pool) {
      s.pool = opts.pool;
    } else {
      const { Pool } = await importPg();
      s.pool = new Pool({
        connectionString: opts.connectionString,
        host: opts.host,
        port: opts.port,
        database: opts.database,
        user: opts.user,
        password: opts.password,
      });
    }
    await s.init();
    return s;
  }

  async init(): Promise<void> {
    const c = await this.pool!.connect();
    try {
      await c.query(
        `CREATE TABLE IF NOT EXISTS ${this.table} (
           id          TEXT PRIMARY KEY,
           user_id     TEXT,
           title       TEXT,
           metadata    JSONB NOT NULL DEFAULT '{}'::jsonb,
           messages    JSONB NOT NULL DEFAULT '[]'::jsonb,
           created_at  BIGINT NOT NULL,
           updated_at  BIGINT NOT NULL
         )`,
      );
      await c.query(
        `CREATE INDEX IF NOT EXISTS ${this.table}_user_idx ON ${this.table}(user_id)`,
      );
      await c.query(
        `CREATE INDEX IF NOT EXISTS ${this.table}_updated_idx ON ${this.table}(updated_at)`,
      );
    } finally {
      c.release();
    }
  }

  async get(id: string): Promise<Session | null> {
    const c = await this.pool!.connect();
    try {
      const r = await c.query(`SELECT * FROM ${this.table} WHERE id = $1`, [id]);
      if (r.rows.length === 0) return null;
      return rowToSession(r.rows[0]);
    } finally {
      c.release();
    }
  }

  async upsert(session: Session): Promise<void> {
    const updated = Date.now();
    const created = session.createdAt ?? updated;
    const c = await this.pool!.connect();
    try {
      await c.query(
        `INSERT INTO ${this.table} (id, user_id, title, metadata, messages, created_at, updated_at)
         VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6, $7)
         ON CONFLICT (id) DO UPDATE SET
           user_id = EXCLUDED.user_id,
           title = EXCLUDED.title,
           metadata = EXCLUDED.metadata,
           messages = EXCLUDED.messages,
           updated_at = EXCLUDED.updated_at`,
        [
          session.id,
          session.userId ?? null,
          session.title ?? null,
          JSON.stringify(session.metadata ?? {}),
          JSON.stringify(session.messages ?? []),
          created,
          updated,
        ],
      );
    } finally {
      c.release();
    }
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
    const c = await this.pool!.connect();
    try {
      const r = await c.query(`DELETE FROM ${this.table} WHERE id = $1`, [id]);
      return r.rowCount > 0;
    } finally {
      c.release();
    }
  }

  async list(q: SessionQuery): Promise<Session[]> {
    const clauses: string[] = [];
    const params: unknown[] = [];
    if (q.userId !== undefined) {
      params.push(q.userId);
      clauses.push(`user_id = $${params.length}`);
    }
    if (q.titleContains) {
      params.push(`%${q.titleContains.toLowerCase()}%`);
      clauses.push(`LOWER(title) LIKE $${params.length}`);
    }
    const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
    const orderCol = q.orderBy ?? 'updatedAt';
    const colName = orderCol === 'updatedAt' ? 'updated_at' : 'created_at';
    const order = q.order === 'asc' ? 'ASC' : 'DESC';
    params.push(q.limit ?? 1000);
    const c = await this.pool!.connect();
    try {
      const r = await c.query(
        `SELECT * FROM ${this.table} ${where} ORDER BY ${colName} ${order} LIMIT $${params.length}`,
        params,
      );
      return r.rows.map(rowToSession);
    } finally {
      c.release();
    }
  }

  async count(): Promise<number> {
    const c = await this.pool!.connect();
    try {
      const r = await c.query(`SELECT COUNT(*)::int AS n FROM ${this.table}`);
      return Number(r.rows[0].n ?? 0);
    } finally {
      c.release();
    }
  }

  async close(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
    }
  }
}

function rowToSession(row: Record<string, unknown>): Session {
  return {
    id: row.id as string,
    userId: (row.user_id as string) ?? undefined,
    title: (row.title as string) ?? undefined,
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    messages: (row.messages as SessionMessage[]) ?? [],
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  };
}

function sanitizeTable(name: string): string {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
    throw new Error(`Invalid table name: ${name}`);
  }
  return name;
}
