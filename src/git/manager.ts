import 'reflect-metadata';
import { injectable } from 'tsyringe';
import simpleGit, { SimpleGit, StatusResult, LogResult, DefaultLogFields } from 'simple-git';
import path from 'path';
import { gitLogger } from '../services/logger.js';
import type { GitCommit, GitDiff, GitStatus, GitResult } from './types.js';
import { getErrorMessage } from '../utils/error-handling.js';

/**
 * Git 管理器 - 基于 simple-git 封装所有 Git 操作
 */
@injectable()
export class GitManager {
  private git: SimpleGit;
  private cwd: string;

  constructor(cwd: string = process.cwd()) {
    this.cwd = cwd;
    this.git = simpleGit(cwd);
  }

  // ============================================================================
  // SECTION: Repository Status Operations
  // ============================================================================

  /**
   * 检查是否在 Git 仓库中
   */
  async isRepo(): Promise<boolean> {
    try {
      return await this.git.checkIsRepo();
    } catch (error) {
      gitLogger.debug({ error }, 'Failed to check if directory is a git repo');
      return false;
    }
  }

  /**
   * 获取当前分支名
   */
  async getCurrentBranch(): Promise<string> {
    try {
      const branch = await this.git.branch();
      return branch.current || 'HEAD';
    } catch (error) {
      gitLogger.error({ error }, 'Failed to get current branch');
      return 'HEAD';
    }
  }

  /**
   * 获取仓库根目录
   */
  async getRepoRoot(): Promise<string> {
    try {
      const root = await this.git.revparse(['--show-toplevel']);
      return root.trim();
    } catch (error) {
      gitLogger.error({ error }, 'Failed to get repo root');
      return this.cwd;
    }
  }

  /**
   * 获取 Git 状态
   */
  async getStatus(): Promise<GitStatus> {
    if (!(await this.isRepo())) {
      return {
        branch: '',
        ahead: 0,
        behind: 0,
        staged: [],
        unstaged: [],
        untracked: [],
        isClean: true,
        isRepo: false,
      };
    }

    try {
      const status: StatusResult = await this.git.status();
      const branch = status.current || '';

      // 获取 ahead/behind
      let ahead = 0;
      let behind = 0;
      try {
        const tracking = status.tracking;
        if (tracking) {
          const revList = await this.git.raw([
            'rev-list', '--left-right', '--count',
            `${branch}...${tracking}`
          ]);
          const [a, b] = revList.trim().split(/\s+/).map(Number);
          ahead = a || 0;
          behind = b || 0;
        }
      } catch {
        // 忽略上游分支不存在的情况
      }

      // 解析暂存区文件
      const staged = status.staged.map(file => ({
        file: file,
        status: this.mapStatus(file),
        additions: 0,
        deletions: 0,
      }));

      // 解析未暂存文件
      const unstaged = status.modified.map(file => ({
        file: file,
        status: 'modified' as const,
        additions: 0,
        deletions: 0,
      }));

      // 未跟踪文件
      const untracked = status.not_added;

      const isClean = status.isClean();

      return {
        branch,
        ahead,
        behind,
        staged,
        unstaged,
        untracked,
        isClean,
        isRepo: true,
      };
    } catch (error) {
      gitLogger.error({ error }, 'Failed to get git status');
      return {
        branch: '',
        ahead: 0,
        behind: 0,
        staged: [],
        unstaged: [],
        untracked: [],
        isClean: true,
        isRepo: false,
      };
    }
  }

  /**
   * 获取 diff
   */
  async getDiff(options?: { staged?: boolean; file?: string; commit?: string }): Promise<GitDiff> {
    try {
      let diffSummary;
      let patch = '';

      if (options?.commit) {
        diffSummary = await this.git.diffSummary([options.commit]);
        patch = await this.git.show([options.commit, '--patch']);
      } else if (options?.staged) {
        diffSummary = await this.git.diffSummary(['--cached']);
        patch = await this.git.diff(['--cached']);
      } else {
        diffSummary = await this.git.diffSummary();
        patch = await this.git.diff();
      }

      if (options?.file) {
        patch = await this.git.diff([options.staged ? '--cached' : '', '--', options.file].filter(Boolean));
      }

      const files = diffSummary.files.map(f => {
        // Handle binary files which don't have insertions/deletions
        const isBinary = 'binary' in f && f.binary;
        return {
          file: f.file,
          status: isBinary ? 'modified' as const : this.mapDiffStatus(f as { file: string; changes: number; insertions: number; deletions: number }),
          additions: isBinary ? 0 : (f as { insertions: number }).insertions,
          deletions: isBinary ? 0 : (f as { deletions: number }).deletions,
        };
      });

      return {
        files,
        totalAdditions: diffSummary.insertions,
        totalDeletions: diffSummary.deletions,
        patch,
      };
    } catch (error) {
      gitLogger.error({ error, options }, 'Failed to get diff');
      return {
        files: [],
        totalAdditions: 0,
        totalDeletions: 0,
        patch: '',
      };
    }
  }

  // ============================================================================
  // SECTION: Branch Operations
  // ============================================================================

  /**
   * 获取分支列表
   */
  async getBranches(): Promise<{ local: string[]; remote: string[]; current: string }> {
    try {
      const branches = await this.git.branch(['-a']);
      return {
        local: branches.all.filter(b => !b.startsWith('remotes/')),
        remote: branches.all.filter(b => b.startsWith('remotes/')).map(b => b.replace('remotes/', '')),
        current: branches.current || '',
      };
    } catch (error) {
      gitLogger.error({ error }, 'Failed to get branches');
      return { local: [], remote: [], current: '' };
    }
  }

  /**
   * 获取提交日志
   */
  async getCommits(options?: { count?: number; author?: string; since?: string; file?: string }): Promise<GitCommit[]> {
    try {
      const logOptions: string[] = [];

      if (options?.count) {
        logOptions.push(`-${options.count}`);
      }

      if (options?.author) {
        logOptions.push(`--author=${options.author}`);
      }

      if (options?.since) {
        logOptions.push(`--since=${options.since}`);
      }

      if (options?.file) {
        logOptions.push('--', options.file);
      }

      const log: LogResult<DefaultLogFields> = await this.git.log(logOptions);

      return log.all.map(commit => ({
        hash: commit.hash,
        shortHash: commit.hash.substring(0, 7),
        author: `${commit.author_name} <${commit.author_email}>`,
        date: commit.date,
        message: commit.message,
        isAider: commit.author_name.includes('(devflow)') ||
                 commit.author_name.includes('(aider)') ||
                 commit.message.startsWith('[devflow]'),
      }));
    } catch (error) {
      gitLogger.error({ error }, 'Failed to get commits');
      return [];
    }
  }

  // ============================================================================
  // SECTION: Staging & Commit Operations
  // ============================================================================

  /**
   * 暂存文件
   */
  async stage(pattern: string): Promise<GitResult> {
    gitLogger.debug({ pattern }, 'Staging files');
    try {
      await this.git.add(pattern);
      gitLogger.info({ pattern }, 'Files staged successfully');
      return { success: true, message: `已暂存: ${pattern}` };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      gitLogger.error({ pattern, error: message }, 'Failed to stage files');
      return { success: false, message };
    }
  }

  /**
   * 提交变更
   */
  async commit(message: string, options?: { allowEmpty?: boolean; amend?: boolean }): Promise<GitResult> {
    gitLogger.debug({ message, options }, 'Creating commit');
    try {
      const commitOptions: string[] = [];

      if (options?.allowEmpty) {
        commitOptions.push('--allow-empty');
      }

      if (options?.amend) {
        commitOptions.push('--amend', '--no-edit');
      }

      const result = await this.git.commit(message, commitOptions);

      if (result.commit) {
        gitLogger.info({ message, commit: result.commit }, 'Commit created successfully');
        return { success: true, message: `提交成功: ${result.commit}` };
      }

      return { success: false, message: '没有可提交的变更' };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      if (errorMessage.includes('nothing to commit')) {
        gitLogger.info('No changes to commit');
        return { success: false, message: '没有可提交的变更' };
      }

      gitLogger.error({ message, error: errorMessage }, 'Commit failed');
      return { success: false, message: errorMessage };
    }
  }

  /**
   * 撤销最后一次提交（保留更改在工作区）
   */
  async undoLastCommit(): Promise<GitResult> {
    try {
      await this.git.reset(['--soft', 'HEAD~1']);
      return { success: true, message: '已撤销最后一次提交，更改保留在工作区' };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, message };
    }
  }

  /**
   * 创建分支
   */
  async createBranch(name: string, options?: { checkout?: boolean; from?: string }): Promise<GitResult> {
    try {
      const createOptions: string[] = [name];

      if (options?.from) {
        createOptions.push(options.from);
      }

      await this.git.checkoutLocalBranch(name);

      if (options?.checkout !== false) {
        await this.git.checkout(name);
      }

      return { success: true, message: `分支 ${name} 已创建` };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, message };
    }
  }

  /**
   * 切换分支
   */
  async checkout(ref: string): Promise<GitResult> {
    try {
      await this.git.checkout(ref);
      return { success: true, message: `已切换到 ${ref}` };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, message };
    }
  }

  /**
   * 获取最后一次提交的 hash
   */
  async getLastCommitHash(): Promise<string | null> {
    try {
      const log = await this.git.log(['-1']);
      return log.latest?.hash || null;
    } catch (error) {
      gitLogger.error({ error }, 'Failed to get last commit hash');
      return null;
    }
  }

  /**
   * 检查文件是否有未提交的更改
   */
  async isDirty(files?: string[]): Promise<boolean> {
    try {
      const status = await this.getStatus();

      if (files) {
        const dirtyFiles = [...status.staged, ...status.unstaged].map(f => f.file);
        return files.some(f => dirtyFiles.includes(f));
      }

      return !status.isClean;
    } catch (error) {
      gitLogger.error({ error }, 'Failed to check if dirty');
      return false;
    }
  }

  /**
   * Stash 当前更改
   */
  async stash(message?: string): Promise<GitResult> {
    gitLogger.debug({ message }, 'Stashing changes');
    try {
      if (message) {
        await this.git.stash(['push', '-m', message]);
      } else {
        await this.git.stash(['push']);
      }
      gitLogger.info({ message }, 'Changes stashed successfully');
      return { success: true, message: message ? `已暂存: ${message}` : '已暂存当前更改' };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      gitLogger.error({ message, error: errorMessage }, 'Stash failed');
      return { success: false, message: errorMessage };
    }
  }

  /**
   * 恢复 stash
   */
  async stashPop(): Promise<GitResult> {
    try {
      await this.git.stash(['pop']);
      return { success: true, message: '已恢复暂存的更改' };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, message };
    }
  }

  // ============================================================================
  // SECTION: Remote Operations (Push/Pull/Merge)
  // ============================================================================

  /**
   * 推送到远程仓库
   */
  async push(remote = 'origin', branch?: string): Promise<GitResult> {
    const branchName = branch || await this.getCurrentBranch();
    gitLogger.debug({ remote, branch: branchName }, 'Pushing to remote');

    try {
      const result = await this.git.push(remote, branchName);

      if (result.pushed?.length || result.update?.hash?.to) {
        gitLogger.info({ remote, branch: branchName }, 'Push successful');
        return { success: true, message: `已推送到 ${remote}/${branchName}` };
      }

      return { success: true, message: '已是最新，无需推送' };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      gitLogger.error({ remote, branch: branchName, error: message }, 'Push failed');
      return { success: false, message };
    }
  }

  /**
   * 从远程拉取
   */
  async pull(remote = 'origin', branch?: string): Promise<GitResult> {
    const branchName = branch || await this.getCurrentBranch();
    gitLogger.debug({ remote, branch: branchName }, 'Pulling from remote');

    try {
      await this.git.pull(remote, branchName);
      gitLogger.info({ remote, branch: branchName }, 'Pull successful');
      return { success: true, message: `已从 ${remote}/${branchName} 拉取更新` };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      gitLogger.error({ remote, branch: branchName, error: message }, 'Pull failed');
      return { success: false, message };
    }
  }

  /**
   * 合并分支
   */
  async merge(sourceBranch: string): Promise<GitResult> {
    gitLogger.debug({ sourceBranch }, 'Merging branch');

    try {
      await this.git.merge([sourceBranch]);
      gitLogger.info({ sourceBranch }, 'Merge successful');
      return { success: true, message: `已合并分支 ${sourceBranch}` };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      gitLogger.error({ sourceBranch, error: message }, 'Merge failed');
      return { success: false, message };
    }
  }

  /**
   * 获取远程仓库 URL
   */
  async getRemoteUrl(remote = 'origin'): Promise<string> {
    try {
      const remotes = await this.git.getRemotes(true);
      const found = remotes.find(r => r.name === remote);
      return found?.refs?.fetch || found?.refs?.push || '';
    } catch (error) {
      gitLogger.error({ remote, error }, 'Failed to get remote URL');
      return '';
    }
  }

  /**
   * 创建 Pull Request（通过 gh CLI）
   */
  async createPR(title: string, body?: string, base?: string): Promise<string> {
    const { execFile } = await import('child_process');
    const { promisify } = await import('util');
    const execFileAsync = promisify(execFile);

    const args = ['pr', 'create', '--title', title];
    if (body) args.push('--body', body);
    if (base) args.push('--base', base);
    args.push('--fill');

    try {
      const { stdout } = await execFileAsync('gh', args, {
        cwd: this.cwd,
        maxBuffer: 1024 * 1024,
      });
      gitLogger.info({ title }, 'PR created successfully');
      return stdout.trim();
    } catch (error: unknown) {
      const errorMsg = getErrorMessage(error);
      if (errorMsg.includes('gh: command not found')) {
        throw new Error('需要安装 GitHub CLI (gh): https://cli.github.com/');
      }
      gitLogger.error({ title, error: errorMsg }, 'PR creation failed');
      throw error;
    }
  }

  // ============================================================================
  // SECTION: Private Helpers
  // ============================================================================

  /**
   * 映射 simple-git 状态到内部状态
   */
  private mapStatus(file: string): 'added' | 'modified' | 'deleted' {
    // simple-git 的 status 返回的是文件路径，我们需要通过其他方式判断状态
    // 这里简化处理，默认为 modified
    return 'modified';
  }

  /**
   * 映射 diff 状态
   */
  private mapDiffStatus(file: { file: string; changes: number; insertions: number; deletions: number; binary?: boolean }): 'added' | 'modified' | 'deleted' {
    if (file.binary) return 'modified';
    if (file.insertions > 0 && file.deletions === 0) return 'added';
    if (file.insertions === 0 && file.deletions > 0) return 'deleted';
    return 'modified';
  }

  /**
   * 执行原始 Git 命令
   */
  async exec(args: string[]): Promise<string> {
    gitLogger.debug({ args }, 'Executing raw git command');
    try {
      const result = await this.git.raw(args);
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      gitLogger.error({ args, error: message }, 'Git command failed');
      throw new Error(`Git command failed: ${message}`);
    }
  }
}
