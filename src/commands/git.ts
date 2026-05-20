import { Command } from 'commander';
import chalk from 'chalk';
import { GitManager, AutoCommitEngine, DirtyProtect, CheckpointManager } from '../git/index.js';
import type { GitCheckpoint } from '../git/types.js';
import { printHeader, printSection, printSuccess, printError, printInfo, printWarning } from '../ui/logo.js';
import { printTable, printBadge } from '../ui/display.js';
import { getErrorMessage } from '../utils/error-handling.js';

/**
 * Git 命令 - Git 深度集成
 */
export const gitCommand = new Command('git')
  .description('Git 深度集成管理');

// ─── git status ───────────────────────────────────────────
gitCommand
  .command('status')
  .description('查看 Git 状态')
  .action(async () => {
    printHeader();
    const git = new GitManager();

    if (!(await git.isRepo())) {
      printError('当前目录不是 Git 仓库');
      printInfo('请先运行 git init 初始化仓库');
      return;
    }

    const status = await git.getStatus();

    printSection('Git 状态');
    printSuccess(`分支: ${chalk.bold(status.branch)}`);

    if (status.ahead > 0 || status.behind > 0) {
      printInfo(`领先 ${status.ahead} 个提交 | 落后 ${status.behind} 个提交`);
    }

    if (status.staged.length > 0) {
      printWarning(`暂存区 (${status.staged.length} 个文件):`);
      status.staged.forEach(f => {
        const icon = f.status === 'added' ? chalk.green('A') : f.status === 'deleted' ? chalk.red('D') : chalk.yellow('M');
        printInfo(`  ${icon} ${f.file} (+${f.additions} -${f.deletions})`);
      });
    }

    if (status.unstaged.length > 0) {
      printWarning(`未暂存 (${status.unstaged.length} 个文件):`);
      status.unstaged.forEach(f => {
        const icon = f.status === 'added' ? chalk.green('A') : f.status === 'deleted' ? chalk.red('D') : chalk.yellow('M');
        printInfo(`  ${icon} ${f.file} (+${f.additions} -${f.deletions})`);
      });
    }

    if (status.untracked.length > 0) {
      printInfo(`未跟踪 (${status.untracked.length} 个文件):`);
      status.untracked.slice(0, 10).forEach(f => printInfo(`  ${chalk.gray('?')} ${f}`));
      if (status.untracked.length > 10) printInfo(`  ... 还有 ${status.untracked.length - 10} 个文件`);
    }

    if (status.isClean) {
      printSuccess('工作区干净 ✓');
    }
  });

// ─── git log ──────────────────────────────────────────────
gitCommand
  .command('log')
  .description('查看 Git 提交历史')
  .option('-n, --count <number>', '显示条数', '10')
  .option('--ai', '仅显示 AI 提交')
  .action(async (options) => {
    printHeader();
    const git = new GitManager();

    if (!(await git.isRepo())) {
      printError('当前目录不是 Git 仓库');
      return;
    }

    const commits = await git.getCommits({
      count: parseInt(options.count),
      author: options.ai ? '(devflow)' : undefined,
    });

    if (commits.length === 0) {
      printInfo('没有提交记录');
      return;
    }

    printSection(`提交历史 (${commits.length} 条)`);

    printTable({
      title: '',
      head: ['Hash', 'Author', 'Date', 'Message', 'Type'],
      rows: commits.map(c => [
        c.isAider ? chalk.cyan(c.shortHash) : c.shortHash,
        c.isAider ? chalk.dim(c.author) : c.author,
        chalk.dim(new Date(c.date).toLocaleString('zh-CN')),
        c.message,
        c.isAider ? printBadge('AI', 'cyan') : '',
      ]),
    });
  });

// ─── git diff ─────────────────────────────────────────────
gitCommand
  .command('diff')
  .description('查看代码变更')
  .option('--staged', '查看暂存区变更')
  .option('--file <path>', '查看指定文件变更')
  .action(async (options) => {
    printHeader();
    const git = new GitManager();

    if (!(await git.isRepo())) {
      printError('当前目录不是 Git 仓库');
      return;
    }

    const diff = await git.getDiff({
      staged: options.staged,
      file: options.file,
    });

    if (diff.files.length === 0) {
      printInfo('没有变更');
      return;
    }

    printSection(`变更概览: ${chalk.green(`+${diff.totalAdditions}`)} ${chalk.red(`-${diff.totalDeletions}`)} (${diff.files.length} 个文件)`);

    diff.files.forEach(f => {
      const icon = f.status === 'added' ? chalk.green('A') : f.status === 'deleted' ? chalk.red('D') : chalk.yellow('M');
      printInfo(`  ${icon} ${f.file} (+${f.additions} -${f.deletions})`);
    });

    // 显示 patch 详情（限制行数）
    if (diff.patch) {
      const lines = diff.patch.split('\n');
      const maxLines = 100;
      if (lines.length > maxLines) {
        printSection('Patch (前 100 行):');
        console.log(lines.slice(0, maxLines).join('\n'));
        printInfo(`... 还有 ${lines.length - maxLines} 行`);
      } else {
        printSection('Patch:');
        console.log(diff.patch);
      }
    }
  });

// ─── git undo ─────────────────────────────────────────────
gitCommand
  .command('undo')
  .description('撤销最后一次 AI 提交（保留更改在工作区）')
  .action(async () => {
    printHeader();
    const git = new GitManager();

    if (!(await git.isRepo())) {
      printError('当前目录不是 Git 仓库');
      return;
    }

    // 获取最后一次提交
    const commits = await git.getCommits({ count: 1 });
    if (commits.length === 0) {
      printError('没有提交记录');
      return;
    }

    const lastCommit = commits[0];
    if (!lastCommit.isAider) {
      printWarning('最后一次提交不是 AI 生成的');
      printInfo(`提交: ${lastCommit.shortHash} ${lastCommit.message}`);
      printInfo('如果确认要撤销，请使用 git reset --soft HEAD~1');
      return;
    }

    printInfo(`即将撤销: ${chalk.cyan(lastCommit.shortHash)} ${lastCommit.message}`);
    const result = await git.undoLastCommit();
    if (result.success) {
      printSuccess(result.message);
    } else {
      printError(result.message);
    }
  });

// ─── git checkpoint ───────────────────────────────────────
const checkpointCmd = new Command('checkpoint')
  .description('检查点管理');

checkpointCmd
  .command('create')
  .description('创建检查点')
  .option('-d, --description <desc>', '检查点描述')
  .action(async (options) => {
    printHeader();
    const cp = new CheckpointManager(process.cwd());
    const result = await cp.create(options.description);
    if (result.success) {
      printSuccess(result.message);
      const data = result.data as GitCheckpoint | undefined;
      if (data) {
        printInfo(`分支: ${data.branch}`);
        printInfo(`提交: ${data.commitHash.substring(0, 7)}`);
      }
    } else {
      printError(result.message);
    }
  });

checkpointCmd
  .command('list')
  .description('列出所有检查点')
  .action(async () => {
    printHeader();
    const cp = new CheckpointManager(process.cwd());
    const checkpoints = await cp.list();

    if (checkpoints.length === 0) {
      printInfo('没有检查点');
      return;
    }

    printSection(`检查点 (${checkpoints.length} 个)`);
    printTable({
      title: '',
      head: ['ID', 'Branch', 'Commit', 'Created', 'Description'],
      rows: checkpoints.map(c => [
        chalk.cyan(c.id),
        c.branch,
        c.commitHash.substring(0, 7),
        c.createdAt ? chalk.dim(new Date(c.createdAt).toLocaleString('zh-CN')) : '-',
        c.description || c.message,
      ]),
    });
  });

checkpointCmd
  .command('rollback <id>')
  .description('回滚到指定检查点')
  .action(async (id) => {
    printHeader();
    printWarning(`即将回滚到检查点: ${chalk.cyan(id)}`);
    printInfo('这将丢弃检查点之后的所有更改！');

    const cp = new CheckpointManager(process.cwd());
    const result = await cp.rollback(id);
    if (result.success) {
      printSuccess(result.message);
    } else {
      printError(result.message);
    }
  });

checkpointCmd
  .command('delete <id>')
  .description('删除检查点')
  .action(async (id) => {
    printHeader();
    const cp = new CheckpointManager(process.cwd());
    const result = await cp.delete(id);
    if (result.success) {
      printSuccess(result.message);
    } else {
      printError(result.message);
    }
  });

gitCommand.addCommand(checkpointCmd);

// ─── git branch ───────────────────────────────────────────
gitCommand
  .command('branch')
  .description('创建 AI 工作分支')
  .argument('[name]', '分支名称')
  .action(async (name) => {
    printHeader();
    const git = new GitManager();

    if (!(await git.isRepo())) {
      printError('当前目录不是 Git 仓库');
      return;
    }

    if (!name) {
      const branch = await git.getCurrentBranch();
      printSection('当前分支');
      printSuccess(branch);
      return;
    }

    const branchName = name.startsWith('devflow/') ? name : `devflow/${name}`;
    const result = await git.createBranch(branchName);
    if (result.success) {
      printSuccess(result.message);
      printInfo('建议在 AI 工作分支上进行操作，完成后合并到主分支');
    } else {
      printError(result.message);
    }
  });

// ─── git config ───────────────────────────────────────────
gitCommand
  .command('config')
  .description('配置 Git 集成')
  .option('--enable', '启用自动提交')
  .option('--disable', '禁用自动提交')
  .option('--prefix <prefix>', '设置提交前缀 (如 feat/fix/refactor)')
  .option('--show', '显示当前配置')
  .action(async (options) => {
    printHeader();
    printSection('Git 集成配置');

    const engine = new AutoCommitEngine(process.cwd());
    const config = engine.getConfig();

    if (options.enable) {
      engine.updateConfig({ enabled: true });
      printSuccess('自动提交已启用');
    } else if (options.disable) {
      engine.updateConfig({ enabled: false });
      printSuccess('自动提交已禁用');
    } else if (options.prefix) {
      engine.updateConfig({ commitPrefix: options.prefix });
      printSuccess(`提交前缀已设置为: ${options.prefix}`);
    }

    // 显示当前配置
    const currentConfig = engine.getConfig();
    printInfo(`自动提交: ${currentConfig.enabled ? chalk.green('启用') : chalk.red('禁用')}`);
    printInfo(`提交前缀: ${chalk.cyan(currentConfig.commitPrefix)}`);
    printInfo(`AI 作者: ${chalk.dim(`${currentConfig.authorName} <${currentConfig.authorEmail}>`)}`);
  });

// ─── git push ─────────────────────────────────────────────
gitCommand
  .command('push')
  .description('推送到远程仓库')
  .option('-r, --remote <remote>', '远程仓库名', 'origin')
  .option('-b, --branch <branch>', '分支名')
  .action(async (options) => {
    printHeader();
    const git = new GitManager();

    if (!(await git.isRepo())) {
      printError('当前目录不是 Git 仓库');
      return;
    }

    try {
      const result = await git.push(options.remote, options.branch);
      if (result.success) {
        printSuccess(result.message);
      } else {
        printError(result.message);
      }
    } catch (error: unknown) {
      printError(`推送失败: ${getErrorMessage(error)}`);
    }
  });

// ─── git pr ───────────────────────────────────────────────
gitCommand
  .command('pr')
  .description('创建 Pull Request')
  .argument('[title]', 'PR 标题')
  .option('--body <body>', 'PR 描述')
  .option('--base <base>', '目标分支')
  .action(async (title, options) => {
    printHeader();
    const git = new GitManager();

    if (!(await git.isRepo())) {
      printError('当前目录不是 Git 仓库');
      return;
    }

    try {
      const prTitle = title || await git.getCurrentBranch();
      printInfo(`正在创建 PR: ${chalk.cyan(prTitle)}`);
      const result = await git.createPR(prTitle, options.body, options.base);
      printSuccess(`PR 创建成功: ${result}`);
    } catch (error: unknown) {
      printError(`PR 创建失败: ${getErrorMessage(error)}`);
    }
  });
