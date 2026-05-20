/**
 * 斜杠命令解析器
 */

import chalk from 'chalk';
import type { ParsedCommand, SlashCommand } from './types.js';

/**
 * 解析用户输入为命令
 * @returns 命令名和参数，如果不是命令则返回 null
 */
export function parseCommand(input: string): ParsedCommand | null {
  const trimmed = input.trim();
  if (!trimmed.startsWith('/')) return null;

  const spaceIndex = trimmed.indexOf(' ');
  if (spaceIndex === -1) {
    return { name: trimmed.slice(1).toLowerCase(), args: '' };
  }
  return {
    name: trimmed.slice(1, spaceIndex).toLowerCase(),
    args: trimmed.slice(spaceIndex + 1).trim(),
  };
}

/**
 * 获取命令名称（处理别名）
 */
export function getCommandName(command: SlashCommand): string {
  return command.name;
}

/**
 * 验证命令是否存在
 */
export function validateCommand(
  name: string,
  registry: Map<string, SlashCommand>
): SlashCommand | undefined {
  return registry.get(name);
}
