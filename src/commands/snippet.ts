import { Command } from 'commander';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import inquirer from 'inquirer';
import { printSuccess, printError, printInfo, printWarning } from '../ui/logo.js';
import { getErrorMessage } from '../utils/error-handling.js';

const SNIPPETS_DIR = path.join(os.homedir(), '.devflow', 'snippets');

export const snippetCommand = new Command('snippet')
  .description('代码片段管理（保存/搜索/插入）');

snippetCommand
  .command('save <name>')
  .description('保存代码片段')
  .option('-c, --code <code>', '代码内容（交互式输入如果未提供）')
  .option('-d, --description <desc>', '描述')
  .option('-t, --tags <tags>', '标签（逗号分隔）')
  .option('-f, --file <path>', '从文件读取代码')
  .action(async (name, options) => {
    await fs.mkdir(SNIPPETS_DIR, { recursive: true });

    let code = options.code || '';
    if (options.file) {
      try {
        code = await fs.readFile(options.file, 'utf-8');
      } catch (err: unknown) {
        printError(`文件读取失败: ${getErrorMessage(err)}`);
        return;
      }
    }

    if (!code) {
      const answer = await inquirer.prompt([{
        type: 'editor',
        name: 'code',
        message: '输入代码片段（保存后按 Esc 退出）',
      }]);
      code = answer.code;
    }

    const snippet = {
      name,
      code,
      description: options.description || '',
      tags: options.tags ? options.tags.split(',').map((t: string) => t.trim()) : [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const filePath = path.join(SNIPPETS_DIR, `${name}.json`);
    await fs.writeFile(filePath, JSON.stringify(snippet, null, 2));
    printSuccess(`片段 "${name}" 已保存`);
  });

snippetCommand
  .command('list')
  .description('列出所有代码片段')
  .option('-t, --tag <tag>', '按标签过滤')
  .action(async (options) => {
    await fs.mkdir(SNIPPETS_DIR, { recursive: true });
    const files = await fs.readdir(SNIPPETS_DIR);
    const snippets = [];

    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      try {
        const content = await fs.readFile(path.join(SNIPPETS_DIR, file), 'utf-8');
        const snippet = JSON.parse(content);
        if (options.tag && !(snippet.tags || []).includes(options.tag)) continue;
        snippets.push(snippet);
      } catch (error) {
        // Skip invalid snippet files
      }
    }

    if (snippets.length === 0) {
      printInfo('没有找到代码片段');
      return;
    }

    console.log();
    for (const s of snippets) {
      const tags = (s.tags || []).map((t: string) => `#${t}`).join(' ');
      const desc = s.description ? ` - ${s.description}` : '';
      const preview = s.code.split('\n')[0].slice(0, 60);
      console.log(`  📦 ${s.name}${desc}`);
      console.log(`     ${tags ? tags + ' ' : ''}${preview}`);
      console.log();
    }
  });

snippetCommand
  .command('show <name>')
  .description('显示代码片段')
  .action(async (name) => {
    const filePath = path.join(SNIPPETS_DIR, `${name}.json`);
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const snippet = JSON.parse(content);
      console.log();
      if (snippet.description) console.log(`  ${snippet.description}`);
      console.log();
      console.log(snippet.code);
    } catch {
      printError(`片段 "${name}" 不存在`);
    }
  });

snippetCommand
  .command('delete <name>')
  .description('删除代码片段')
  .action(async (name) => {
    const filePath = path.join(SNIPPETS_DIR, `${name}.json`);
    try {
      await fs.unlink(filePath);
      printSuccess(`片段 "${name}" 已删除`);
    } catch {
      printError(`片段 "${name}" 不存在`);
    }
  });
