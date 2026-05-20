/**
 * Git 模块类型定义
 */

/** Git 提交信息 */
export interface GitCommit {
  hash: string;
  shortHash: string;
  author: string;
  date: string;
  message: string;
  isAider: boolean;  // 是否为 AI 生成
}

/** Git 文件变更 */
export interface GitFileChange {
  file: string;
  status: 'added' | 'modified' | 'deleted' | 'renamed';
  additions: number;
  deletions: number;
}

/** Git Diff 结果 */
export interface GitDiff {
  files: GitFileChange[];
  totalAdditions: number;
  totalDeletions: number;
  patch: string;
}

/** Git 状态 */
export interface GitStatus {
  branch: string;
  ahead: number;
  behind: number;
  staged: GitFileChange[];
  unstaged: GitFileChange[];
  untracked: string[];
  isClean: boolean;
  isRepo: boolean;
}

/** 检查点信息 */
export interface GitCheckpoint {
  id: string;
  branch: string;
  commitHash: string;
  message: string;
  createdAt: number;
  description?: string;
}

/** 自动提交配置 */
export interface AutoCommitConfig {
  enabled: boolean;
  authorName: string;
  authorEmail: string;
  commitPrefix: string;       // 如 "feat:", "fix:"
  includePattern?: RegExp;    // 只提交匹配的文件
  excludePattern?: RegExp;    // 排除匹配的文件
}

/**
 * Git 操作结果
 * @template T 数据类型
 */
export interface GitResult<T = unknown> {
  success: boolean;
  message: string;
  data?: T;
}
