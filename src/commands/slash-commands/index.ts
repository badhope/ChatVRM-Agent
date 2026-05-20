/**
 * 斜杠命令模块导出
 */

export {
  // 类型
  type SlashCommand,
  type SlashCommandContext,
  type SlashCommandResult,
  type Message,
  type ParsedCommand,
  // 函数
  registerCommand,
  getAllCommands,
  executeSlashCommand,
  parseCommand,
  // 注册表
  COMMAND_REGISTRY,
  BUILT_IN_COMMANDS,
  createCommandRegistry,
  registerCommandToRegistry,
  getAllCommandsFromRegistry,
} from '../slash-commands.js';
