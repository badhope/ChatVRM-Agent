import { Command } from 'commander';
import { providerCommand } from './config/provider.js';
import { chatConfigCommand } from './config/chat.js';
import { memoryConfigCommand } from './config/memory-cmd.js';
import { sandboxConfigCommand } from './config/sandbox-cmd.js';
import { initConfigCommand } from './config/init.js';

export const configCommand = new Command('config').description('配置管理');
configCommand.addCommand(providerCommand);
configCommand.addCommand(chatConfigCommand);
configCommand.addCommand(memoryConfigCommand);
configCommand.addCommand(sandboxConfigCommand);
configCommand.addCommand(initConfigCommand);
