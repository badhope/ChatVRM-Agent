/**
 * 斜杠命令系统
 *
 * 在聊天交互中通过 /command 触发快捷操作。
 * 学习自 Aider 的 40+ 斜杠命令体系。
 */

import chalk from 'chalk';
import { parseCommand } from './slash-commands/parser.js';
import {
  COMMAND_REGISTRY,
  registerCommandToRegistry,
  getAllCommandsFromRegistry,
} from './slash-commands/registry.js';
import type { SlashCommand, SlashCommandContext, SlashCommandResult } from './slash-commands/types.js';

// 重新导出类型
export type {
  SlashCommand,
  SlashCommandContext,
  SlashCommandResult,
  Message,
  ParsedCommand,
} from './slash-commands/types.js';

// 重新导出解析器
export { parseCommand } from './slash-commands/parser.js';

// 重新导出注册表
export {
  COMMAND_REGISTRY,
  BUILT_IN_COMMANDS,
  createCommandRegistry,
  registerCommandToRegistry,
  getAllCommandsFromRegistry,
} from './slash-commands/registry.js';

/**
 * 注册斜杠命令
 */
export function registerCommand(command: SlashCommand): void {
  registerCommandToRegistry(COMMAND_REGISTRY, command);
}

/**
 * 获取所有命令（去重）
 */
export function getAllCommands(): SlashCommand[] {
  return getAllCommandsFromRegistry(COMMAND_REGISTRY);
}

/**
 * 执行斜杠命令
 * @returns 处理结果，null 表示未知命令
 */
export async function executeSlashCommand(
  input: string,
  context: SlashCommandContext
): Promise<SlashCommandResult | null> {
  const parsed = parseCommand(input);
  if (!parsed) return null;

  const command = COMMAND_REGISTRY.get(parsed.name);
  if (!command) {
    return {
      handled: true,
      message: chalk.yellow(`未知命令: /${parsed.name}，输入 /help 查看所有命令`),
    };
  }

  try {
    const result = await command.execute({ ...context, args: parsed.args });
    return result || { handled: true };
  } catch (error) {
    return {
      handled: true,
      message: chalk.red(`命令执行失败: ${error instanceof Error ? error.message : String(error)}`),
    };
  }
}
