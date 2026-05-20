import { Command } from 'commander';
import { toolsLibraryCommand } from './tools/tools-library.js';
import { toolsExecCommand } from './tools/tools-exec.js';

export const toolsCommand = new Command('tools')
  .alias('t')
  .description('工具调用（独立使用 + AI function calling）');
toolsCommand.addCommand(toolsLibraryCommand);
toolsCommand.addCommand(toolsExecCommand);
