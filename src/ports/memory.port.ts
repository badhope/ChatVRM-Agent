export interface MemoryRecord {
  id: string;
  input: string;
  output: string;
  provider: string;
  model: string;
  timestamp: number;
  tags: string[];
}

export interface ConsolidationResult {
  /**
   * Number of records that were *kept* — i.e. survived this pass
   * because they are within the retention window and the store is
   * under the cap. The historical name "consolidated" is kept for
   * back-compat with callers and dashboards.
   */
  consolidated: number;
  /** Number of records deleted by this pass. */
  removed: number;
}

export interface MemoryStats {
  totalRecords: number;
  totalTokens: number;
  lastConsolidation: number;
}

export interface IMemoryPort {
  remember(record: Omit<MemoryRecord, 'id' | 'timestamp'>): Promise<void>;
  recall(query: string, limit?: number): Promise<MemoryRecord[]>;
  loadAll(): Promise<MemoryRecord[]>;
  forget(id: string): Promise<boolean>;
  consolidate(): Promise<ConsolidationResult>;
  stats(): Promise<MemoryStats>;
  /**
   * Update an existing record by id. Returns the updated record, or
   * `null` if not found. Only the listed fields are mutable.
   * Optional — adapters that don't support in-place updates should
   * implement it as a forget() + remember() round-trip.
   */
  update?(
    id: string,
    patch: Partial<Pick<MemoryRecord, 'input' | 'output' | 'tags' | 'provider' | 'model'>>,
  ): Promise<MemoryRecord | null>;
}