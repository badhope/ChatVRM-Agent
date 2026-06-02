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
  consolidated: number;
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
}