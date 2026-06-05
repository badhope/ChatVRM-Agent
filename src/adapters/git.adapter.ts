import { simpleGit, SimpleGit } from 'simple-git';
import type { IGitPort, GitStatus, GitCommit } from '../ports/git.port.js';

const EMPTY_STATUS: GitStatus = {
  branch: 'unknown',
  modified: [],
  added: [],
  deleted: [],
};

export class GitAdapter implements IGitPort {
  private git: SimpleGit;

  constructor(cwd?: string) {
    this.git = simpleGit(cwd ?? process.cwd());
  }

  async isRepo(): Promise<boolean> {
    try {
      return await this.git.checkIsRepo();
    } catch {
      return false;
    }
  }

  async getStatus(): Promise<GitStatus> {
    try {
      const status = await this.git.status();
      return {
        branch: status.current ?? 'unknown',
        modified: status.modified ?? [],
        added: [...(status.created ?? []), ...(status.staged ?? [])],
        deleted: status.deleted ?? [],
      };
    } catch {
      return EMPTY_STATUS;
    }
  }

  async commit(message: string): Promise<void> {
    await this.git.add('.');
    await this.git.commit(message);
  }

  async createBranch(name: string): Promise<void> {
    await this.git.checkoutLocalBranch(name);
  }

  async checkout(branch: string): Promise<void> {
    await this.git.checkout(branch);
  }

  async diff(): Promise<string> {
    try {
      return await this.git.diff();
    } catch {
      return '';
    }
  }

  async log(limit?: number): Promise<GitCommit[]> {
    try {
      const logResult = await this.git.log({ maxCount: limit ?? 20 });
      return logResult.all.map((entry) => ({
        hash: entry.hash,
        message: entry.message,
        author: entry.author_name,
        date: entry.date,
      }));
    } catch {
      return [];
    }
  }
}