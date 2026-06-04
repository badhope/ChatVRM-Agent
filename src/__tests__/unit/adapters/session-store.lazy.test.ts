import { describe, it, expect } from 'vitest';
import { SqliteSessionStore } from '../../../adapters/session-store.sqlite.js';
import { PostgresSessionStore } from '../../../adapters/session-store.postgres.js';

describe('SqliteSessionStore', () => {
  it('throws a clear install hint when better-sqlite3 is missing', async () => {
    await expect(SqliteSessionStore.open(':memory:')).rejects.toThrow(
      /better-sqlite3/,
    );
  });
});

describe('PostgresSessionStore', () => {
  it('throws a clear install hint when pg is missing', async () => {
    await expect(
      PostgresSessionStore.open({ connectionString: 'postgres://localhost/x' }),
    ).rejects.toThrow(/pg/);
  });
});
