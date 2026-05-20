import type { GitResult } from './types.js';
import { GitManager } from './manager.js';

/**
 * 脏文件保护器
 * 在 AI 编辑文件前，自动保护用户未提交的更改
 */
export class DirtyProtect {
  private git: GitManager;
  private stashed: boolean = false;

  constructor(cwd: string) {
    this.git = new GitManager(cwd);
  }

  /**
   * 保护指定文件
   * 如果文件有未提交更改，先自动暂存
   * @param files 即将被 AI 编辑的文件列表
   * @returns 保护结果
   */
  async protect(files: string[]): Promise<GitResult> {
    if (!(await this.git.isRepo())) {
      return { success: true, message: '非 Git 仓库，跳过脏文件保护' };
    }

    const dirtyFiles: string[] = [];
    for (const file of files) {
      if (await this.git.isDirty([file])) {
        dirtyFiles.push(file);
      }
    }

    if (dirtyFiles.length === 0) {
      return { success: true, message: '无需保护，所有文件干净' };
    }

    // 暂存用户更改
    const result = await this.git.stash(`devflow-auto-save: ${dirtyFiles.join(', ')}`);
    if (result.success) {
      this.stashed = true;
      return {
        success: true,
        message: `已保护 ${dirtyFiles.length} 个有未提交更改的文件: ${dirtyFiles.join(', ')}`,
        data: { dirtyFiles },
      };
    }

    return { success: false, message: `脏文件保护失败: ${result.message}` };
  }

  /**
   * 恢复之前暂存的用户更改
   */
  async restore(): Promise<GitResult> {
    if (!this.stashed) {
      return { success: true, message: '无需恢复' };
    }

    const result = await this.git.stashPop();
    this.stashed = false;
    return result;
  }

  /**
   * 检查是否有暂存的更改需要恢复
   */
  needsRestore(): boolean {
    return this.stashed;
  }
}
