import { Command } from 'commander';
import chalk from 'chalk';
import fs from 'fs/promises';
import path from 'path';
import { toolLibrary, type ToolMetadata } from '../../tools/library.js';
import { configManager } from '../../config/manager.js';
import { printHeader, printSection, printSuccess, printError, printWarning } from '../../ui/logo.js';
import { TOOLS_DIR } from '../../utils/index.js';

export const toolsLibraryCommand = new Command('library')
  .description('工具库管理（安装/卸载/搜索）');

// 查看可用工具库
toolsLibraryCommand
  .command('available')
  .alias('avail')
  .description('查看工具库中所有可用的工具包')
  .option('-c, --category <category>', '按分类筛选')
  .option('-j, --json', 'JSON 格式输出', false)
  .action(async (options: { category?: string; json: boolean }) => {
    await configManager.init();
    const index = await toolLibrary.getIndex();

    if (options.json) {
      if (options.category) {
        const tools = await toolLibrary.getToolsByCategory(options.category);
        console.log(JSON.stringify({ category: options.category, tools }, null, 2));
      } else {
        console.log(JSON.stringify(index, null, 2));
      }
      return;
    }

    printHeader();
    printSection('工具库');

    console.log(chalk.gray(`  共 ${index.totalTools} 个工具包\n`));

    const categories = await toolLibrary.getCategories();

    for (const category of categories) {
      if (options.category && options.category !== category) {
        continue;
      }

      const tools = await toolLibrary.getToolsByCategory(category);

      console.log(chalk.bold.cyan(`  📁 ${category} (${tools.length})`));

      for (const tool of tools) {
        const icons: Record<string, string> = {
          'development': '🔧',
          'devops': '🚀',
          'security': '🔒',
          'data': '💾',
          'ai': '🤖',
          'web': '🌐',
          'productivity': '⚡',
          'analysis': '📊',
          'utilities': '🛠️',
          'design': '🎨',
          'other': '📦'
        };
        const icon = icons[tool.category] || '📦';

        console.log(`    ${icon} ${chalk.white(tool.name)}`);
        console.log(`       ${chalk.gray(tool.description)}`);
        console.log(`       ${chalk.gray(`版本: ${tool.version} | 工具数: ${tool.tools.length}`)}`);
        console.log();
      }
    }

    console.log(chalk.gray('  使用 devflow tools install <name> 安装工具包\n'));
  });

// 搜索工具
toolsLibraryCommand
  .command('search')
  .alias('s')
  .description('搜索工具库中的工具')
  .argument('<keyword>', '搜索关键词')
  .option('-j, --json', 'JSON 格式输出', false)
  .action(async (keyword: string, options: { json: boolean }) => {
    const results = await toolLibrary.searchTools(keyword);

    if (options.json) {
      console.log(JSON.stringify({ keyword, count: results.length, results }, null, 2));
      return;
    }

    printHeader();
    printSection(`搜索结果: ${keyword}`);

    if (results.length === 0) {
      printWarning('  没有找到匹配的工具');
      console.log(chalk.gray('  使用 devflow tools available 查看所有工具\n'));
      return;
    }

    console.log(chalk.gray(`  找到 ${results.length} 个匹配的工具\n`));

    for (const tool of results) {
      console.log(`  ${chalk.bold.cyan(tool.name)} ${chalk.gray(`[${tool.category}]`)}`);
      console.log(`    ${chalk.white(tool.description)}`);
      console.log(`    ${chalk.gray(`工具: ${tool.tools.join(', ')}`)}`);
      console.log();
    }

    console.log(chalk.gray('  使用 devflow tools install <name> 安装工具包\n'));
  });

// 安装工具包
toolsLibraryCommand
  .command('install')
  .description('安装工具包')
  .argument('[names...]', '要安装的工具包名称（不指定则安装全部）')
  .option('-a, --all', '安装所有可用工具', false)
  .option('-c, --category <category>', '按分类安装')
  .option('-y, --yes', '跳过确认', false)
  .action(async (names: string[], options: { all: boolean; category?: string; yes: boolean }) => {
    await configManager.init();

    let toolsToInstall: ToolMetadata[] = [];

    if (options.all) {
      toolsToInstall = await toolLibrary.getAllTools();
    } else if (options.category) {
      toolsToInstall = await toolLibrary.getToolsByCategory(options.category);
    } else if (names.length > 0) {
      for (const name of names) {
        const tool = await toolLibrary.getTool(name);
        if (tool) {
          toolsToInstall.push(tool);
        } else {
          printWarning(`  工具 ${name} 不存在于工具库中`);
        }
      }
    } else {
      printError('  请指定要安装的工具包名称');
      console.log(chalk.gray('  使用 devflow tools available 查看可用工具\n'));
      return;
    }

    if (toolsToInstall.length === 0) {
      printWarning('  没有要安装的工具');
      return;
    }

    printHeader();
    printSection('安装工具包');

    console.log(chalk.gray(`  将安装 ${toolsToInstall.length} 个工具包:\n`));

    for (const tool of toolsToInstall) {
      console.log(`  ${chalk.bold.cyan(tool.name)}`);
      console.log(`    ${chalk.gray(tool.description)}`);
      console.log(`    ${chalk.gray(`分类: ${tool.category} | 版本: ${tool.version}`)}`);

      if (tool.dependencies.length > 0) {
        console.log(`    ${chalk.yellow(`依赖: ${tool.dependencies.join(', ')}`)}`);
      }
      console.log();
    }

    if (!options.yes) {
      const readline = await import('readline');
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      const answer = await new Promise<string>((resolve) => {
        rl.question(chalk.yellow('  确认安装? (y/N) '), resolve);
      });
      rl.close();

      if (answer.toLowerCase() !== 'y') {
        console.log(chalk.gray('  已取消安装\n'));
        return;
      }
    }

    console.log(chalk.cyan('\n  开始安装...\n'));

    const installedDir = TOOLS_DIR;
    await fs.mkdir(installedDir, { recursive: true });

    let successCount = 0;
    let failCount = 0;

    for (const tool of toolsToInstall) {
      try {
        const destPath = path.join(installedDir, tool.name);

        console.log(chalk.gray(`  安装 ${tool.name}...`));

        await fs.cp(tool.path, destPath, { recursive: true });

        console.log(chalk.green(`    ✓ ${tool.name} 安装成功`));
        successCount++;
      } catch (error) {
        console.log(chalk.red(`    ✗ ${tool.name} 安装失败: ${error}`));
        failCount++;
      }
    }

    console.log();
    if (successCount > 0) {
      printSuccess(`成功安装 ${successCount} 个工具包`);
    }
    if (failCount > 0) {
      printError(`安装失败 ${failCount} 个工具包`);
    }
    console.log(chalk.gray('  使用 devflow tools list 查看已安装的工具\n'));
  });

// 卸载工具包
toolsLibraryCommand
  .command('uninstall')
  .description('卸载工具包')
  .argument('<names...>', '要卸载的工具包名称')
  .option('-y, --yes', '跳过确认', false)
  .action(async (names: string[], options: { yes: boolean }) => {
    await configManager.init();
    const installedDir = TOOLS_DIR;

    if (!options.yes) {
      printHeader();
      printSection('卸载工具包');
      console.log(chalk.gray(`  将卸载 ${names.length} 个工具包:\n`));

      for (const name of names) {
        console.log(`  ${chalk.bold.red(name)}`);
      }
      console.log();

      const readline = await import('readline');
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      const answer = await new Promise<string>((resolve) => {
        rl.question(chalk.yellow('  确认卸载? (y/N) '), resolve);
      });
      rl.close();

      if (answer.toLowerCase() !== 'y') {
        console.log(chalk.gray('  已取消卸载\n'));
        return;
      }
    }

    console.log(chalk.cyan('\n  开始卸载...\n'));

    let successCount = 0;
    let failCount = 0;

    for (const name of names) {
      try {
        const toolPath = path.join(installedDir, name);
        await fs.rm(toolPath, { recursive: true });
        console.log(chalk.green(`  ✓ ${name} 卸载成功`));
        successCount++;
      } catch (error) {
        console.log(chalk.red(`  ✗ ${name} 卸载失败: ${error}`));
        failCount++;
      }
    }

    console.log();
    if (successCount > 0) {
      printSuccess(`成功卸载 ${successCount} 个工具包`);
    }
    if (failCount > 0) {
      printWarning(`卸载失败 ${failCount} 个工具包（可能未安装）`);
    }
    console.log();
  });

// 查看已安装的工具
toolsLibraryCommand
  .command('installed')
  .alias('list-installed')
  .description('查看已安装的工具包')
  .option('-j, --json', 'JSON 格式输出', false)
  .action(async (options: { json: boolean }) => {
    const installedDir = TOOLS_DIR;

    let installedTools: string[] = [];

    try {
      const entries = await fs.readdir(installedDir);
      installedTools = entries.filter(async (entry) => {
        const stat = await fs.stat(path.join(installedDir, entry));
        return stat.isDirectory();
      });
    } catch {
      installedTools = [];
    }

    if (options.json) {
      console.log(JSON.stringify({ installed: installedTools, count: installedTools.length }, null, 2));
      return;
    }

    printHeader();
    printSection('已安装的工具包');

    if (installedTools.length === 0) {
      printWarning('  暂无已安装的工具包');
      console.log(chalk.gray('  使用 devflow tools install <name> 安装工具包\n'));
      return;
    }

    console.log(chalk.gray(`  共 ${installedTools.length} 个已安装的工具包\n`));

    for (const toolName of installedTools) {
      console.log(`  ${chalk.bold.green(toolName)}`);
    }

    console.log();
    console.log(chalk.gray('  使用 devflow tools uninstall <name> 卸载工具包\n'));
  });

// 工具包信息
toolsLibraryCommand
  .command('info')
  .description('查看工具包详细信息')
  .argument('<name>', '工具包名称')
  .option('-j, --json', 'JSON 格式输出', false)
  .action(async (name: string, options: { json: boolean }) => {
    const tool = await toolLibrary.getTool(name);

    if (!tool) {
      printError(`  工具包 ${name} 不存在于工具库中`);
      console.log(chalk.gray('  使用 devflow tools available 查看可用工具\n'));
      return;
    }

    if (options.json) {
      console.log(JSON.stringify(tool, null, 2));
      return;
    }

    printHeader();
    printSection(`工具包: ${name}`);

    console.log(`  ${chalk.bold.cyan('名称')}: ${tool.name}`);
    console.log(`  ${chalk.bold.cyan('版本')}: ${tool.version}`);
    console.log(`  ${chalk.bold.cyan('分类')}: ${tool.category}`);
    console.log(`  ${chalk.bold.cyan('描述')}: ${tool.description}`);

    if (tool.author) {
      console.log(`  ${chalk.bold.cyan('作者')}: ${tool.author}`);
    }

    console.log();
    console.log(`  ${chalk.bold.cyan('包含工具')}: ${tool.tools.join(', ')}`);

    if (tool.dependencies.length > 0) {
      console.log();
      console.log(`  ${chalk.bold.yellow('依赖项')}: ${tool.dependencies.join(', ')}`);
    }

    console.log();
    console.log(chalk.gray(`  路径: ${tool.path}`));
    console.log();
  });
