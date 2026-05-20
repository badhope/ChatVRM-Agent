import { Command } from 'commander';
import chalk from 'chalk';
import { readFile, writeFile, listDirectory, searchInDirectory, getFileTree, getFileInfo, deleteFile, createDirectory, copyFile, moveFile } from '../files/manager.js';
import { printHeader, printSection, printSuccess, printError, printInfo } from '../ui/logo.js';

const filesCommand = new Command('files')
  .alias('f')
  .description('文件操作');

// 读取文件
filesCommand
  .command('read')
  .alias('r')
  .description('读取文件内容')
  .argument('<filePath>', '文件路径')
  .option('-l, --lines <value>', '显示行数限制')
  .action(async (filePath: string, options: { lines?: string }) => {
    const result = await readFile(filePath);
    if (result.success) {
      let content = result.content || '';
      if (options.lines) {
        const limit = parseInt(options.lines, 10);
        const lines = content.split('\n');
        content = lines.slice(0, limit).join('\n');
        if (lines.length > limit) {
          content += `\n\n... (共 ${lines.length} 行，已显示 ${limit} 行)`;
        }
      }
      console.log(content);
    } else {
      printError(result.error || '读取失败');
    }
  });

// 写入文件
filesCommand
  .command('write')
  .alias('w')
  .description('写入文件')
  .argument('<filePath>', '文件路径')
  .argument('[content]', '文件内容')
  .option('-c, --content <content>', '文件内容（替代参数方式）')
  .option('-a, --append', '追加模式', false)
  .action(async (filePath: string, content: string | undefined, options: { content?: string; append: boolean }) => {
    const writeContent = options.content || content;
    if (!writeContent) {
      printError('请提供文件内容');
      return;
    }

    const result = options.append
      ? await (await import('../files/manager.js')).appendFile(filePath, writeContent)
      : await writeFile(filePath, writeContent);

    if (result.success) {
      printSuccess(`文件已${options.append ? '追加' : '写入'}: ${filePath} (${result.size} bytes)`);
    } else {
      printError(result.error || '写入失败');
    }
  });

// 列出目录
filesCommand
  .command('list')
  .alias('ls')
  .description('列出目录内容')
  .argument('<dirPath>', '目录路径')
  .action(async (dirPath: string) => {
    const result = await listDirectory(dirPath);
    if (result.success) {
      console.log(result.content);
    } else {
      printError(result.error || '列出失败');
    }
  });

// 文件树
filesCommand
  .command('tree')
  .alias('t')
  .description('显示目录文件树')
  .argument('<dirPath>', '目录路径')
  .option('-d, --depth <number>', '最大深度', '3')
  .action(async (dirPath: string, options: { depth: string }) => {
    const depth = parseInt(options.depth, 10);
    const tree = await getFileTree(dirPath, depth);
    console.log(tree);
  });

// 搜索
filesCommand
  .command('search')
  .alias('s')
  .description('搜索文件内容')
  .argument('<pattern>', '搜索模式（正则表达式）')
  .argument('<dirPath>', '搜索目录')
  .option('-f, --file-pattern <pattern>', '文件匹配模式')
  .action(async (pattern: string, dirPath: string, options: { filePattern?: string }) => {
    printInfo(`搜索: ${pattern} 在 ${dirPath}`);
    const results = await searchInDirectory(dirPath, pattern, options.filePattern);

    if (results.length === 0) {
      printInfo('未找到匹配结果');
      return;
    }

    console.log(chalk.gray(`\n找到 ${results.length} 个匹配:\n`));
    for (const r of results.slice(0, 50)) {
      console.log(chalk.cyan(`${r.filePath}:${r.line}`));
      console.log(`  ${r.content.slice(0, 120)}`);
      console.log();
    }
  });

// 文件信息
filesCommand
  .command('info')
  .alias('i')
  .description('获取文件信息')
  .argument('<filePath>', '文件路径')
  .action(async (filePath: string) => {
    const result = await getFileInfo(filePath);
    if (result.success) {
      console.log(result.content);
    } else {
      printError(result.error || '获取信息失败');
    }
  });

// 删除文件
filesCommand
  .command('delete')
  .alias('rm')
  .description('删除文件')
  .argument('<filePath>', '文件路径')
  .action(async (filePath: string) => {
    const result = await deleteFile(filePath);
    if (result.success) {
      printSuccess(`文件已删除: ${filePath}`);
    } else {
      printError(result.error || '删除失败');
    }
  });

// 创建目录
filesCommand
  .command('mkdir')
  .description('创建目录')
  .argument('<dirPath>', '目录路径')
  .action(async (dirPath: string) => {
    const result = await createDirectory(dirPath);
    if (result.success) {
      printSuccess(`目录已创建: ${dirPath}`);
    } else {
      printError(result.error || '创建失败');
    }
  });

// 复制文件
filesCommand
  .command('copy')
  .alias('cp')
  .description('复制文件')
  .argument('<source>', '源文件路径')
  .argument('<dest>', '目标路径')
  .action(async (source: string, dest: string) => {
    const result = await copyFile(source, dest);
    if (result.success) {
      printSuccess(`已复制: ${source} → ${dest} (${result.size} bytes)`);
    } else {
      printError(result.error || '复制失败');
    }
  });

// 移动/重命名文件
filesCommand
  .command('move')
  .alias('mv')
  .description('移动或重命名文件')
  .argument('<source>', '源文件路径')
  .argument('<dest>', '目标路径')
  .action(async (source: string, dest: string) => {
    const result = await moveFile(source, dest);
    if (result.success) {
      printSuccess(`已移动: ${source} → ${dest} (${result.size} bytes)`);
    } else {
      printError(result.error || '移动失败');
    }
  });

export { filesCommand };
