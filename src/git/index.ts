/**
 * Git 模块 - 统一导出
 *
 * 提供 Git 深度集成能力：
 * - GitManager: Git 操作核心封装
 * - AutoCommitEngine: 自动提交引擎
 * - DirtyProtect: 脏文件保护
 * - CheckpointManager: 检查点系统
 */

export { GitManager } from './manager.js';
export { AutoCommitEngine, DEFAULT_AUTO_COMMIT_CONFIG } from './auto-commit.js';
export { DirtyProtect } from './dirty-protect.js';
export { CheckpointManager } from './checkpoint.js';

export type {
  GitCommit,
  GitFileChange,
  GitDiff,
  GitStatus,
  GitCheckpoint,
  AutoCommitConfig,
  GitResult,
} from './types.js';
