/**
 * Session storage port.
 *
 * Sessions are a unit of conversation state. The agent has many of them
 * in flight (one per user/thread); the storage layer is responsible for
 * persisting messages, summaries, and arbitrary session metadata.
 *
 * Two backends ship alongside this port:
 *   - {@link JsonFileSessionStore}: default, file-backed JSON, no deps
 *   - {@link SqliteSessionStore}:    better-sqlite3, embedded SQL
 *   - {@link PostgresSessionStore}:  pg, server-side SQL
 *
 * The SQL backends use lazy imports so the project does not require
 * those packages to be installed.
 */

export interface SessionMessage {
  id: string;
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  /** Tool calls attached to an assistant message. */
  toolCalls?: Array<{ id: string; name: string; arguments: Record<string, unknown> }>;
  toolCallId?: string;
  name?: string;
  createdAt: number;
}

export interface Session {
  id: string;
  userId?: string;
  title?: string;
  /** Arbitrary metadata (e.g. agent name, model). */
  metadata: Record<string, unknown>;
  messages: SessionMessage[];
  createdAt: number;
  updatedAt: number;
}

export interface SessionQuery {
  userId?: string;
  /** `contains` substring match against title. */
  titleContains?: string;
  limit?: number;
  orderBy?: 'updatedAt' | 'createdAt';
  order?: 'asc' | 'desc';
}

export interface ISessionStore {
  readonly name: string;
  init(): Promise<void>;
  get(id: string): Promise<Session | null>;
  upsert(session: Session): Promise<void>;
  appendMessage(id: string, message: SessionMessage): Promise<void>;
  remove(id: string): Promise<boolean>;
  list(q: SessionQuery): Promise<Session[]>;
  count(): Promise<number>;
  close(): Promise<void>;
}
