import type { AutoCommitConfig, GitResult } from './types.js';
import { GitManager } from './manager.js';
import { configManager } from '../config/manager.js';

/** 默认自动提交配置 */
export const DEFAULT_AUTO_COMMIT_CONFIG: AutoCommitConfig & { aiCommitMessage?: boolean } = {
  enabled: true,
  authorName: 'DevFlow Agent',
  authorEmail: 'devflow@agent.local',
  commitPrefix: 'feat',
  aiCommitMessage: true,
};

/**
 * 自动提交引擎
 * 在 AI 编辑文件后自动创建 Git 提交
 */
export class AutoCommitEngine {
  private git: GitManager;
  private config: AutoCommitConfig;

  constructor(cwd: string, config?: Partial<AutoCommitConfig>) {
    this.git = new GitManager(cwd);
    this.config = { ...DEFAULT_AUTO_COMMIT_CONFIG, ...config };
  }

  /** 更新配置 */
  updateConfig(config: Partial<AutoCommitConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /** 获取当前配置 */
  getConfig(): AutoCommitConfig {
    return { ...this.config };
  }

  /**
   * 自动提交变更文件
   * @param changedFiles 被修改的文件列表
   * @param taskDescription 任务描述（用于生成提交信息）
   * @returns 提交结果
   */
  async autoCommit(changedFiles: string[], taskDescription: string): Promise<GitResult> {
    if (!this.config.enabled) {
      return { success: false, message: '自动提交已禁用' };
    }

    if (!(await this.git.isRepo())) {
      return { success: false, message: '当前目录不是 Git 仓库' };
    }

    if (changedFiles.length === 0) {
      return { success: false, message: '没有变更文件需要提交' };
    }

    // 过滤文件
    const filesToCommit = this.filterFiles(changedFiles);
    if (filesToCommit.length === 0) {
      return { success: false, message: '没有匹配的文件需要提交' };
    }

    // 暂存文件
    for (const file of filesToCommit) {
      await this.git.stage(file);
    }

    // 先尝试获取 diff，用于 AI 生成提交消息
    const diffResult = await this.git.getDiff({ staged: true });
    const configWithAI = this.config as AutoCommitConfig & { aiCommitMessage?: boolean };
    const useAI = configWithAI.aiCommitMessage !== false;  // 默认启用

    let commitMessage: string;
    if (useAI && diffResult.patch.trim()) {
      commitMessage = await this.generateAICommitMessage(diffResult.patch, filesToCommit);
    } else {
      commitMessage = this.generateCommitMessage(filesToCommit, taskDescription);
    }

    // 设置 AI 作者信息
    await this.git.exec(['config', '--local', 'user.name', this.config.authorName]);
    await this.git.exec(['config', '--local', 'user.email', this.config.authorEmail]);

    // 提交
    const result = await this.git.commit(commitMessage);
    return result;
  }

  /**
   * 使用 AI 生成 Conventional Commits 格式的提交消息
   */
  private async generateAICommitMessage(diff: string, files: string[]): Promise<string> {
    try {
      const { callLLM } = await import('../agent/llm-caller.js');

      const prompt = `根据以下 git diff 生成一个简洁的 Conventional Commits 格式的提交消息。

规则：
1. 使用中文
2. 格式: <type>(<scope>): <subject>
3. type: feat/fix/refactor/docs/style/test/chore/perf
4. subject 不超过 50 个字符
5. 如果有多个不相关的改动，使用多个 type，用 | 分隔
6. 只输出提交消息，不要解释

文件变更: ${files.join(', ')}

Diff (截取前 3000 字符):
${diff.slice(0, 3000)}`;

      const defaultProvider = configManager.getDefaultProvider();
      const providerConfig = defaultProvider ? configManager.getProviderConfig(defaultProvider) : undefined;

      const response = await callLLM([{ role: 'user', content: prompt }], {
        provider: defaultProvider,
        model: providerConfig?.defaultModel,
        maxTokens: 200,
        temperature: 0.3,
      });

      // 清理响应
      const message = (response || '').trim().replace(/^["']|["']$/g, '').replace(/\n+/g, '\n');
      return message || this.generateCommitMessage(files, 'AI生成失败');
    } catch {
      // AI 生成失败，回退到模板
      return this.generateCommitMessage(files, '自动提交');
    }
  }

  /**
   * 生成 Conventional Commits 格式的提交信息
   */
  private generateCommitMessage(files: string[], description: string): string {
    const prefix = this.config.commitPrefix;

    // 从描述中提取简短摘要（最多50字符）
    const summary = description.length > 50
      ? description.substring(0, 47) + '...'
      : description;

    // 文件列表摘要
    const fileSummary = files.length <= 3
      ? files.join(', ')
      : `${files.slice(0, 3).join(', ')} 等 ${files.length} 个文件`;

    return `[devflow] ${prefix}: ${summary}\n\n${fileSummary}\n\nCo-authored-by: ${this.config.authorName} <${this.config.authorEmail}>`;
  }

  /**
   * 根据配置过滤文件
   */
  private filterFiles(files: string[]): string[] {
    let filtered = files;

    if (this.config.includePattern) {
      filtered = filtered.filter(f => this.config.includePattern?.test(f) ?? false);
    }

    if (this.config.excludePattern) {
      filtered = filtered.filter(f => !(this.config.excludePattern?.test(f) ?? false));
    }

    return filtered;
  }

  /**
   * 检查是否有未提交的 AI 更改
   */
  async hasUncommittedChanges(): Promise<boolean> {
    return this.git.isDirty();
  }

  /**
   * 获取自指定提交以来的变更
   */
  async getChangesSince(sinceCommit?: string): Promise<{ files: string[]; diff: string }> {
    const diff = await this.git.getDiff({ commit: sinceCommit ? `${sinceCommit}..HEAD` : undefined });
    return {
      files: diff.files.map(f => f.file),
      diff: diff.patch,
    };
  }
}
