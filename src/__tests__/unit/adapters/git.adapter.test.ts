import { describe, it, expect, beforeEach, vi } from 'vitest';

const mockGit = {
  checkIsRepo: vi.fn(),
  status: vi.fn(),
  add: vi.fn(),
  commit: vi.fn(),
  checkoutLocalBranch: vi.fn(),
  checkout: vi.fn(),
  diff: vi.fn(),
  log: vi.fn(),
};

vi.mock('simple-git', () => ({
  simpleGit: vi.fn(() => mockGit),
  default: vi.fn(() => mockGit),
}));

import { GitAdapter } from '../../../adapters/git.adapter.js';

describe('GitAdapter', () => {
  let adapter: GitAdapter;

  beforeEach(() => {
    vi.clearAllMocks();
    adapter = new GitAdapter('/fake/cwd');
  });

  describe('isRepo', () => {
    it('should return true when git repo exists', async () => {
      mockGit.checkIsRepo.mockResolvedValue(true);

      const result = await adapter.isRepo();

      expect(result).toBe(true);
    });

    it('should return false on error', async () => {
      mockGit.checkIsRepo.mockRejectedValue(new Error('not a git repo'));

      const result = await adapter.isRepo();

      expect(result).toBe(false);
    });
  });

  describe('getStatus', () => {
    it('should return branch name', async () => {
      mockGit.status.mockResolvedValue({
        current: 'main',
        modified: [],
        created: [],
        staged: [],
        deleted: [],
      });

      const status = await adapter.getStatus();

      expect(status.branch).toBe('main');
    });

    it('should return modified files', async () => {
      mockGit.status.mockResolvedValue({
        current: 'feature',
        modified: ['src/a.ts', 'src/b.ts'],
        created: [],
        staged: [],
        deleted: [],
      });

      const status = await adapter.getStatus();

      expect(status.modified).toEqual(['src/a.ts', 'src/b.ts']);
    });

    it('should return EMPTY_STATUS on error', async () => {
      mockGit.status.mockRejectedValue(new Error('failed'));

      const status = await adapter.getStatus();

      expect(status.branch).toBe('unknown');
      expect(status.modified).toEqual([]);
      expect(status.added).toEqual([]);
      expect(status.deleted).toEqual([]);
    });
  });

  describe('commit', () => {
    it('should stage and commit', async () => {
      mockGit.add.mockResolvedValue(undefined);
      mockGit.commit.mockResolvedValue({ commit: 'abc123' });

      await adapter.commit('test commit');

      expect(mockGit.add).toHaveBeenCalledWith('.');
      expect(mockGit.commit).toHaveBeenCalledWith('test commit');
    });

    it('should not throw on error', async () => {
      mockGit.add.mockRejectedValue(new Error('add failed'));

      await expect(adapter.commit('msg')).resolves.not.toThrow();
    });
  });

  describe('createBranch', () => {
    it('should checkout new branch', async () => {
      mockGit.checkoutLocalBranch.mockResolvedValue(undefined);

      await adapter.createBranch('feature-x');

      expect(mockGit.checkoutLocalBranch).toHaveBeenCalledWith('feature-x');
    });

    it('should not throw on error', async () => {
      mockGit.checkoutLocalBranch.mockRejectedValue(new Error('failed'));

      await expect(adapter.createBranch('bad')).resolves.not.toThrow();
    });
  });

  describe('checkout', () => {
    it('should switch branches', async () => {
      mockGit.checkout.mockResolvedValue(undefined);

      await adapter.checkout('develop');

      expect(mockGit.checkout).toHaveBeenCalledWith('develop');
    });

    it('should not throw on error', async () => {
      mockGit.checkout.mockRejectedValue(new Error('failed'));

      await expect(adapter.checkout('bad')).resolves.not.toThrow();
    });
  });

  describe('diff', () => {
    it('should return diff string', async () => {
      mockGit.diff.mockResolvedValue('@@ -1,3 +1,4 @@\n+new line');

      const result = await adapter.diff();

      expect(result).toBe('@@ -1,3 +1,4 @@\n+new line');
    });

    it('should return empty string on error', async () => {
      mockGit.diff.mockRejectedValue(new Error('diff failed'));

      const result = await adapter.diff();

      expect(result).toBe('');
    });
  });

  describe('log', () => {
    it('should return formatted commits', async () => {
      mockGit.log.mockResolvedValue({
        all: [
          { hash: 'abc123', message: 'first commit', author_name: 'Alice', date: '2025-01-01' },
          { hash: 'def456', message: 'second commit', author_name: 'Bob', date: '2025-01-02' },
        ],
      });

      const commits = await adapter.log();

      expect(commits.length).toBe(2);
      expect(commits[0].hash).toBe('abc123');
      expect(commits[0].message).toBe('first commit');
      expect(commits[0].author).toBe('Alice');
      expect(commits[0].date).toBe('2025-01-01');
    });

    it('should respect limit parameter', async () => {
      mockGit.log.mockResolvedValue({ all: [] });

      await adapter.log(5);

      expect(mockGit.log).toHaveBeenCalledWith({ maxCount: 5 });
    });

    it('should return empty array on error', async () => {
      mockGit.log.mockRejectedValue(new Error('log failed'));

      const commits = await adapter.log();

      expect(commits).toEqual([]);
    });
  });
});