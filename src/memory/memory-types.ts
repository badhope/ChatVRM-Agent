// ============================================================
// 记忆管理器类型定义
// ============================================================

/** 记忆交互记录 */
export interface MemoryInteraction {
  id: string;
  taskId: string;
  input: string;
  output: string;
  skillUsed: string;
  context?: Record<string, unknown>;
  tags: string[];
  timestamp: Date;
  /** 重要性分数 (0-1) */
  importance?: number;
  /** 稳定性因子 */
  stability?: number;
  /** 访问次数 */
  accessCount?: number;
}

/** 
 * 记忆记录扩展接口（包含可选的元数据属性）
 * 用于遗忘曲线计算和记忆强化
 */
export interface MemoryInteractionWithMeta extends MemoryInteraction {
  importance: number;
  stability?: number;
  accessCount?: number;
}

/** 带相关性的记忆记录 */
export interface MemoryRecord {
  interaction: MemoryInteraction;
  relevance: number;
}

/** 记忆统计信息 */
export interface MemoryStats {
  totalInteractions: number;
  uniqueTasks: number;
  interactionsToday: number;
  interactionsYesterday: number;
  indexSize: number;
  skillUsage: Record<string, number>;
  skillsUsed: string[];
}
