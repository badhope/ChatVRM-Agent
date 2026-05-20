import { Command } from 'commander';
import chalk from 'chalk';
import { toolRegistry } from '../../tools/registry.js';
import { printHeader, printSection, printSuccess, printError, printInfo } from '../../ui/logo.js';
import { MAX_OUTPUT_DISPLAY_CHARS } from '../../constants/index.js';

export const toolsExecCommand = new Command('exec')
  .description('工具执行（列表/运行/管道）');

// 列出所有可用工具
toolsExecCommand
  .command('list')
  .alias('ls')
  .description('列出所有可用工具')
  .action(() => {
    printHeader();
    printSection('可用工具');

    for (const [name, tool] of toolRegistry.toolsMap) {
      console.log(`  ${chalk.bold.cyan(name)}`);
      console.log(`    ${chalk.gray(tool.description)}`);
      const params = tool.parameters.map(p =>
        `${chalk.yellow(p.name)}${p.required ? '*' : ''}: ${p.type}`
      ).join(', ');
      console.log(`    参数: ${params}`);
      console.log();
    }

    printInfo('独立使用示例:');
    console.log(chalk.gray('  devflow tools shell "ls -la"'));
    console.log(chalk.gray('  devflow tools run read_file path=./src/index.ts'));
    console.log(chalk.gray('  devflow tools run search_files pattern="TODO" path=./src'));
    console.log(chalk.gray('  echo "hello" | devflow tools run write_file path=output.txt'));
    console.log();
  });

// 快捷执行 shell 命令
toolsExecCommand
  .command('shell')
  .alias('sh')
  .alias('!')
  .description('快捷执行 Shell 命令')
  .argument('<command>', '要执行的命令')
  .option('-w, --cwd <path>', '工作目录')
  .option('--timeout <ms>', '超时时间(ms)', '30000')
  .option('-s, --silent', '静默模式，只输出结果', false)
  .option('-j, --json', 'JSON 格式输出', false)
  .action(async (command: string, options: { cwd?: string; timeout: string; silent: boolean; json: boolean }) => {
    if (!options.silent) {
      printHeader();
      printSection(`Shell: ${command}`);
    }

    const shellArgs: Record<string, string> = { command };
    if (options.cwd) shellArgs.cwd = options.cwd;
    shellArgs.timeout = options.timeout;

    const result = await toolRegistry.execute('shell', shellArgs);

    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    if (result.success) {
      if (!options.silent) printSuccess('执行成功');
      if (result.output.trim()) {
        console.log(options.silent ? result.output : chalk.white('\n' + result.output));
      }
    } else {
      if (!options.silent) printError('执行失败');
      if (result.output) console.log(chalk.white(result.output));
      if (result.error) console.log(chalk.red(result.error));
      process.exitCode = 1;
    }
  });

// 执行工具（增强版）
toolsExecCommand
  .command('run')
  .alias('r')
  .description('执行工具')
  .argument('<toolName>', '工具名称')
  .argument('[args...]', '工具参数 (key=value 格式，支持短参数名)')
  .option('-j, --json', 'JSON 格式输出', false)
  .option('--stdin', '从 stdin 读取 content 参数', false)
  .action(async (toolName: string, args: string[], options: { json: boolean; stdin: boolean }) => {
    // 参数别名映射
    const paramAliases: Record<string, Record<string, string>> = {
      read_file: { p: 'path', f: 'path' },
      write_file: { p: 'path', f: 'path', c: 'content' },
      search_files: { p: 'path', d: 'path', pat: 'pattern', fp: 'file_pattern' },
      list_dir: { p: 'path', d: 'path' },
      file_tree: { p: 'path', d: 'path', dep: 'depth' },
      file_info: { p: 'path', f: 'path' },
      shell: { c: 'command', cmd: 'command', d: 'cwd', t: 'timeout' },
    };

    const aliases = paramAliases[toolName] || {};

    // 解析参数
    const parsedArgs: Record<string, string> = {};
    for (const arg of args) {
      const [key, ...valueParts] = arg.split('=');
      const resolvedKey = aliases[key] || key;
      parsedArgs[resolvedKey] = valueParts.join('=');
    }

    // 从 stdin 读取 content
    if (options.stdin) {
      const stdinContent = await readStdin();
      if (stdinContent && !parsedArgs.content) {
        parsedArgs.content = stdinContent;
      }
    }

    if (!options.json) {
      printHeader();
      printSection(`执行工具: ${toolName}`);
      if (Object.keys(parsedArgs).length > 0) {
        console.log(chalk.gray(`  参数: ${JSON.stringify(parsedArgs)}\n`));
      }
    }

    const result = await toolRegistry.execute(toolName, parsedArgs);

    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    if (result.success) {
      printSuccess('执行成功');
      if (result.output.trim()) {
        console.log(chalk.white('\n' + result.output.slice(0, MAX_OUTPUT_DISPLAY_CHARS)));
        if (result.output.length > MAX_OUTPUT_DISPLAY_CHARS) {
          console.log(chalk.gray(`\n... (输出已截断，共 ${result.output.length} 字符)`));
        }
      }
    } else {
      printError('执行失败');
      if (result.output) console.log(chalk.white(result.output));
      if (result.error) console.log(chalk.red(result.error));
      process.exitCode = 1;
    }
  });

// 导出工具定义为JSON（用于AI function calling）
toolsExecCommand
  .command('schema')
  .description('导出工具定义为JSON格式')
  .action(() => {
    const definitions = toolRegistry.getToolDefinitions();
    console.log(JSON.stringify(definitions, null, 2));
  });

// 管道链式调用
toolsExecCommand
  .command('pipe')
  .alias('p')
  .description('管道链式调用多个工具')
  .argument('<chain>', '工具链，格式: tool1(args) | tool2(args) | ...')
  .option('-i, --input <text>', '初始输入文本')
  .option('-j, --json', 'JSON 格式输出', false)
  .action(async (chain: string, options: { input?: string; json: boolean }) => {
    // 解析管道链: tool1(key=val) | tool2(key=val)
    const steps = chain.split('|').map(s => s.trim()).filter(Boolean);

    if (steps.length === 0) {
      printError('请提供至少一个工具步骤');
      return;
    }

    if (!options.json) {
      printHeader();
      printSection('管道链式调用');
      console.log(chalk.gray(`  链路: ${chain}\n`));
    }

    let currentOutput = options.input || '';

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      const match = step.match(/^(\w+)\((.*)\)$/s);
      if (!match) {
        printError(`步骤 ${i + 1} 格式错误: ${step}（应为 toolName(key=value)）`);
        process.exitCode = 1;
        return;
      }

      const toolName = match[1];
      const argsStr = match[2];

      // 解析参数
      const parsedArgs: Record<string, string> = {};
      if (argsStr.trim()) {
        for (const pair of argsStr.split(',')) {
          const [key, ...valueParts] = pair.split('=').map(s => s.trim());
          if (key) {
            parsedArgs[key] = valueParts.join('=').replace(/^["']|["']$/g, '');
          }
        }
      }

      // 上一步的输出作为 input
      if (currentOutput) {
        if (!parsedArgs.input && !parsedArgs.content && !parsedArgs.path) {
          parsedArgs.input = currentOutput;
        }
      }

      if (!options.json) {
        console.log(chalk.cyan(`  [${i + 1}/${steps.length}] ${toolName}`));
      }

      const result = await toolRegistry.execute(toolName, parsedArgs);

      if (!result.success) {
        printError(`步骤 ${i + 1} (${toolName}) 失败: ${result.error}`);
        process.exitCode = 1;
        return;
      }

      currentOutput = result.output;

      if (!options.json) {
        const preview = currentOutput.slice(0, 100).replace(/\n/g, ' ');
        console.log(chalk.gray(`       → ${preview}${currentOutput.length > 100 ? '...' : ''}`));
      }
    }

    if (options.json) {
      console.log(JSON.stringify({ success: true, output: currentOutput }, null, 2));
    } else {
      printSuccess('管道执行完成');
      console.log(chalk.white('\n' + currentOutput.slice(0, MAX_OUTPUT_DISPLAY_CHARS)));
    }
  });

// 读取 stdin 内容
function readStdin(): Promise<string> {
  return new Promise((resolve) => {
    if (!process.stdin.isTTY) {
      let data = '';
      process.stdin.setEncoding('utf-8');
      process.stdin.on('data', (chunk) => { data += chunk; });
      process.stdin.on('end', () => { resolve(data); });
      process.stdin.on('error', () => { resolve(''); });
    } else {
      resolve('');
    }
  });
}
