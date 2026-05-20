// ============================================================
// Unified JSON Storage Layer - backed by lowdb
// ============================================================

import { Low } from 'lowdb';
import { JSONFile } from 'lowdb/node';

/**
 * Generic JSON store backed by lowdb.
 *
 * Provides a thin async wrapper around lowdb for reading, writing,
 * and partially updating a JSON file on disk.
 *
 * @typeParam T - Shape of the persisted data (must be a record type)
 */
export class JsonStore<T extends Record<string, unknown>> {
  private db: Low<T>;

  /**
   * Create a new JsonStore instance.
   *
   * @param dbPath      - Absolute path to the JSON file on disk
   * @param defaultData - Default data used when the file does not exist yet
   */
  constructor(dbPath: string, defaultData: T) {
    const adapter = new JSONFile<T>(dbPath);
    this.db = new Low<T>(adapter, defaultData);
  }

  // ------------------------------------------------------------------
  // Public API
  // ------------------------------------------------------------------

  /**
   * Read the full data object from the store.
   * If the file does not exist the default data is returned.
   */
  async getData(): Promise<T> {
    await this.db.read();
    return this.db.data;
  }

  /**
   * Replace the entire persisted data with the provided value.
   */
  async setData(data: T): Promise<void> {
    this.db.data = data;
    await this.db.write();
  }

  /**
   * Shallow-merge the provided partial update into the existing data.
   */
  async update(partial: Partial<T>): Promise<void> {
    await this.db.read();
    Object.assign(this.db.data, partial);
    await this.db.write();
  }

  /**
   * Raw read – returns `null` when the underlying file cannot be read.
   */
  async read(): Promise<T | null> {
    try {
      await this.db.read();
      return this.db.data;
    } catch {
      return null;
    }
  }
}
