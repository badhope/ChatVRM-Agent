import { Command } from 'commander';
import inquirer from 'inquirer';
import chalk from 'chalk';
import { historyManager } from '../history/manager.js';
import { printHeader, printSection, printSuccess, printError, printInfo } from '../ui/logo.js';

const historyCommand = new Command('history')
  .alias('h')
  .description('会话历史管理');

// 列出所有历史会话
historyCommand
  .command('list')
  .alias('ls')
  .description('列出所有历史会话')
  .option('-l, --limit <number>', '显示数量限制', '20')
  .action(async (options: { limit: string }) => {
    await historyManager.init();
    const sessions = await historyManager.listSessions();
    const limit = parseInt(options.limit, 10);

    printHeader();
    printSection('会话历史');

    if (sessions.length === 0) {
      printInfo('暂无历史会话');
      return;
    }

    console.log(chalk.gray(`  共 ${sessions.length} 个会话\n`));

    const displaySessions = sessions.slice(0, limit);

    displaySessions.forEach((session, index) => {
      const date = new Date(session.updatedAt).toLocaleString('zh-CN');
      const number = (index + 1).toString().padStart(2, '0');

      console.log(`  ${chalk.cyan(number)}. ${chalk.bold(session.title)}`);
      console.log(`      ${chalk.gray('ID:')} ${session.id.slice(0, 8)}...`);
      console.log(`      ${chalk.gray('消息:')} ${session.messageCount} 条`);
      console.log(`      ${chalk.gray('更新:')} ${date}`);
      console.log(`      ${chalk.gray('预览:')} ${session.preview.slice(0, 50)}${session.preview.length > 50 ? '...' : ''}`);
      console.log();
    });

    if (sessions.length > limit) {
      printInfo(`还有 ${sessions.length - limit} 个会话未显示，使用 --limit 查看更多`);
    }
  });

// 查看会话详情
historyCommand
  .command('view')
  .alias('v')
  .description('查看会话详情')
  .argument('<sessionId>', '会话ID（前8位即可）')
  .action(async (sessionId: string) => {
    await historyManager.init();

    // 查找完整ID
    const sessions = await historyManager.listSessions();
    const matched = sessions.find(s => s.id.startsWith(sessionId));

    if (!matched) {
      printError('未找到该会话');
      return;
    }

    const session = await historyManager.loadSession(matched.id);
    if (!session) {
      printError('加载会话失败');
      return;
    }

    printHeader();
    printSection(`会话: ${session.title}`);

    console.log(`  ${chalk.gray('ID:')} ${session.id}`);
    console.log(`  ${chalk.gray('创建:')} ${new Date(session.createdAt).toLocaleString('zh-CN')}`);
    console.log(`  ${chalk.gray('更新:')} ${new Date(session.updatedAt).toLocaleString('zh-CN')}`);
    console.log(`  ${chalk.gray('平台:')} ${session.metadata.provider || '未知'}`);
    console.log(`  ${chalk.gray('模型:')} ${session.metadata.model || '未知'}`);
    console.log(`  ${chalk.gray('消息:')} ${session.metadata.messageCount} 条`);
    console.log(`  ${chalk.gray('Token:')} ${session.metadata.totalTokens.toLocaleString()}`);
    console.log(`  ${chalk.gray('成本:')} $${session.metadata.totalCost.toFixed(4)}`);
    console.log();

    console.log(chalk.bold('  对话内容:\n'));

    session.messages.forEach((msg, index) => {
      const roleColor = msg.role === 'user' ? chalk.cyan : msg.role === 'assistant' ? chalk.green : chalk.gray;
      const roleName = msg.role === 'user' ? '用户' : msg.role === 'assistant' ? 'AI' : '系统';

      console.log(`  ${roleColor(`[${roleName}]`)} ${chalk.gray(new Date(msg.timestamp).toLocaleTimeString('zh-CN'))}`);
      console.log(`  ${msg.content.split('\n').join('\n  ')}`);
      console.log();
    });
  });

// 删除会话
historyCommand
  .command('delete')
  .alias('rm')
  .description('删除会话')
  .argument('<sessionId>', '会话ID（前8位即可）')
  .option('-f, --force', '强制删除，不询问确认', false)
  .action(async (sessionId: string, options: { force: boolean }) => {
    await historyManager.init();

    const sessions = await historyManager.listSessions();
    const matched = sessions.find(s => s.id.startsWith(sessionId));

    if (!matched) {
      printError('未找到该会话');
      return;
    }

    let shouldDelete = options.force;
    if (!shouldDelete && process.stdin.isTTY) {
      const { confirm } = await inquirer.prompt([{
        type: 'confirm',
        name: 'confirm',
        message: `确定要删除会话 "${matched.title}" 吗？`,
        default: false
      }]);
      shouldDelete = confirm;
    }

    if (shouldDelete) {
      await historyManager.deleteSession(matched.id);
      printSuccess('会话已删除');
    }
  });

// 清空所有历史
historyCommand
  .command('clear')
  .description('清空所有历史会话')
  .option('-f, --force', '强制清空，不询问确认', false)
  .action(async (options: { force: boolean }) => {
    await historyManager.init();

    let shouldClear = options.force;
    if (!shouldClear && process.stdin.isTTY) {
      const { confirm } = await inquirer.prompt([{
        type: 'confirm',
        name: 'confirm',
        message: '确定要清空所有历史会话吗？此操作不可恢复！',
        default: false
      }]);
      shouldClear = confirm;
    }

    if (shouldClear) {
      await historyManager.clearAllHistory();
      printSuccess('所有历史会话已清空');
    }
  });

// 导出会话
historyCommand
  .command('export')
  .alias('ex')
  .description('导出会话到文件')
  .argument('<sessionId>', '会话ID（前8位即可）')
  .option('-F, --format <format>', '导出格式 (json|md|txt)', 'md')
  .action(async (sessionId: string, options: { format: string }) => {
    await historyManager.init();

    const sessions = await historyManager.listSessions();
    const matched = sessions.find(s => s.id.startsWith(sessionId));

    if (!matched) {
      printError('未找到该会话');
      return;
    }

    const session = await historyManager.loadSession(matched.id);
    if (!session) {
      printError('加载会话失败');
      return;
    }

    const fs = await import('fs/promises');
    const filename = `devflow-session-${session.id.slice(0, 8)}.${options.format}`;

    let content = '';
    if (options.format === 'json') {
      content = JSON.stringify(session, null, 2);
    } else if (options.format === 'md') {
      content = `# ${session.title}\n\n`;
      content += `- 创建时间: ${new Date(session.createdAt).toLocaleString('zh-CN')}\n`;
      content += `- 平台: ${session.metadata.provider || '未知'}\n`;
      content += `- 模型: ${session.metadata.model || '未知'}\n\n`;
      content += '## 对话\n\n';
      session.messages.forEach(msg => {
        const role = msg.role === 'user' ? '**用户**' : msg.role === 'assistant' ? '**AI**' : '**系统**';
        content += `${role}:\n${msg.content}\n\n---\n\n`;
      });
    } else {
      content = `会话: ${session.title}\n`;
      content += `创建: ${new Date(session.createdAt).toLocaleString('zh-CN')}\n\n`;
      session.messages.forEach(msg => {
        const role = msg.role === 'user' ? '用户' : msg.role === 'assistant' ? 'AI' : '系统';
        content += `[${role}]\n${msg.content}\n\n`;
      });
    }

    await fs.writeFile(filename, content);
    printSuccess(`会话已导出到: ${filename}`);
  });

// 搜索历史会话
historyCommand
  .command('search')
  .alias('find')
  .description('按关键词搜索历史会话')
  .argument('<keyword>', '搜索关键词')
  .option('-l, --limit <n>', '显示数量', '10')
  .action(async (keyword: string, options: { limit: string }) => {
    await historyManager.init();

    const sessions = await historyManager.listSessions();
    const lower = keyword.toLowerCase();
    const limit = parseInt(options.limit, 10) || 10;

    // 搜索标题和预览
    const matched = sessions.filter(s =>
      s.title.toLowerCase().includes(lower) ||
      s.preview.toLowerCase().includes(lower)
    );

    if (matched.length === 0) {
      printError(`未找到包含 "${keyword}" 的会话`);
      return;
    }

    printHeader();
    printSection(`搜索 "${keyword}" (${matched.length} 个结果)`);

    matched.slice(0, limit).forEach(s => {
      const date = new Date(s.updatedAt).toLocaleString('zh-CN');
      console.log(`  ${chalk.cyan(s.id.slice(0, 8))}  ${chalk.bold(s.title)}`);
      console.log(`    ${chalk.gray(`${date} | ${s.messageCount} 条消息`)}`);
      console.log(`    ${chalk.gray(s.preview.slice(0, 80))}`);
      console.log();
    });

    if (matched.length > limit) {
      printInfo(`还有 ${matched.length - limit} 个结果未显示，使用 -l 增加数量`);
    }
  });

export { historyCommand };
