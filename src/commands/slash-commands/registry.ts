/**
 * 斜杠命令注册表
 *
 * 所有内置命令在此定义
 */

import chalk from 'chalk';
import type { SlashCommand, SlashCommandContext } from './types.js';
import type { ProviderType } from '../../types.js';
import type { IProviderFactory, IConfigManager, ILLMProvider } from '../../services/interfaces.js';
import { getErrorMessage } from '../../utils/error-handling.js';

/** 命令注册表类型 */
export type CommandRegistry = Map<string, SlashCommand>;

/**
 * 创建命令注册表
 */
export function createCommandRegistry(): CommandRegistry {
  return new Map<string, SlashCommand>();
}

/**
 * 注册斜杠命令到注册表
 */
export function registerCommandToRegistry(
  registry: CommandRegistry,
  command: SlashCommand
): void {
  registry.set(command.name, command);
  if (command.aliases) {
    for (const alias of command.aliases) {
      registry.set(alias, command);
    }
  }
}

/**
 * 从注册表获取所有命令（去重）
 */
export function getAllCommandsFromRegistry(registry: CommandRegistry): SlashCommand[] {
  const seen = new Set<string>();
  const result: SlashCommand[] = [];
  for (const [, cmd] of registry) {
    if (!seen.has(cmd.name)) {
      seen.add(cmd.name);
      result.push(cmd);
    }
  }
  return result.sort((a, b) => a.name.localeCompare(b.name));
}

// ═══════════════════════════════════════════════════════════
// 内置命令实现
// ═══════════════════════════════════════════════════════════

// /exit — 退出对话
const exitCommand: SlashCommand = {
  name: 'exit',
  aliases: ['quit', 'q'],
  description: '退出对话',
  execute: async () => ({ handled: true, exit: true }),
};

// /help — 帮助
const helpCommand: SlashCommand = {
  name: 'help',
  aliases: ['h', '?'],
  description: '显示所有可用命令',
  execute: async () => {
    let output = '\n';
    output += chalk.bold('📝 常用命令:\n');
    output += '  /exit, /q     退出对话\n';
    output += '  /clear        清空历史\n';
    output += '  /model        切换模型\n';
    output += '  /save         保存到记忆\n';
    output += '\n';
    output += chalk.bold('🔧 高级命令:\n');
    output += '  /architect    双模型模式（规划+执行）\n';
    output += '  /plan         Plan/Act 分步模式\n';
    output += '  /compact      压缩历史\n';
    output += '  /tokens       显示 token 用量\n';
    output += '\n';
    output += chalk.bold('📂 Git 相关:\n');
    output += '  /undo         撤销上次提交\n';
    output += '  /diff         查看变更\n';
    output += '  /checkpoint   创建检查点\n';
    output += '\n';
    output += chalk.bold('🖼️ 媒体:\n');
    output += '  /image, /img  附加图片到对话\n';
    output += '\n';
    output += chalk.bold('快捷操作:\n');
    output += '  !<命令>       直接执行 shell 命令\n';
    output += '  /image <路径>  附加图片到对话\n';
    output += '\n';
    return { handled: true, message: output };
  },
};

// /clear — 清空对话历史
const clearCommand: SlashCommand = {
  name: 'clear',
  aliases: ['cls'],
  description: '清空对话历史',
  execute: async (ctx) => {
    ctx.messages.length = 0;
    return { handled: true, message: chalk.green('✓ 对话历史已清空') };
  },
};

// /model — 切换模型
const modelCommand: SlashCommand = {
  name: 'model',
  description: '切换 AI 模型 (/model <模型名>)',
  args: { name: '模型名', description: '要切换的模型ID', required: false },
  execute: async (ctx) => {
    if (!ctx.args) {
      return { handled: true, message: chalk.dim(`当前模型: ${ctx.modelId}\n用法: /model <模型名>`) };
    }
    ctx.setModel(ctx.args);
    return { handled: true, message: chalk.green(`✓ 已切换到模型: ${ctx.args}`) };
  },
};

// /undo — 撤销最后一次 AI 提交
const undoCommand: SlashCommand = {
  name: 'undo',
  description: '撤销最后一次 AI Git 提交',
  execute: async () => {
    try {
      const { GitManager } = await import('../../git/manager.js');
      const git = new GitManager();
      if (!(await git.isRepo())) {
        return { handled: true, message: chalk.yellow('当前目录不是 Git 仓库') };
      }
      const commits = await git.getCommits({ count: 1 });
      if (commits.length === 0) {
        return { handled: true, message: chalk.yellow('没有提交记录') };
      }
      if (!commits[0].isAider) {
        return { handled: true, message: chalk.yellow(`最后一次提交不是 AI 生成的: ${commits[0].shortHash}`) };
      }
      const result = await git.undoLastCommit();
      return { handled: true, message: result.success ? chalk.green(`✓ ${result.message}`) : chalk.red(`✗ ${result.message}`) };
    } catch {
      return { handled: true, message: chalk.yellow('Git 模块不可用') };
    }
  },
};

// /diff — 查看 Git 变更
const diffCommand: SlashCommand = {
  name: 'diff',
  description: '查看当前 Git 变更',
  execute: async () => {
    try {
      const { GitManager } = await import('../../git/manager.js');
      const git = new GitManager();
      if (!(await git.isRepo())) {
        return { handled: true, message: chalk.yellow('当前目录不是 Git 仓库') };
      }
      const diff = await git.getDiff();
      if (diff.files.length === 0) {
        return { handled: true, message: chalk.dim('没有变更') };
      }
      let output = chalk.bold(`\n📝 变更: ${chalk.green(`+${diff.totalAdditions}`)} ${chalk.red(`-${diff.totalDeletions}`)}\n`);
      for (const f of diff.files) {
        const icon = f.status === 'added' ? chalk.green('A') : f.status === 'deleted' ? chalk.red('D') : chalk.yellow('M');
        output += `  ${icon} ${f.file} (+${f.additions} -${f.deletions})\n`;
      }
      return { handled: true, message: output };
    } catch {
      return { handled: true, message: chalk.yellow('Git 模块不可用') };
    }
  },
};

// /checkpoint — 创建检查点
const checkpointCommand: SlashCommand = {
  name: 'checkpoint',
  aliases: ['cp'],
  description: '创建 Git 检查点',
  execute: async (ctx) => {
    try {
      const { CheckpointManager } = await import('../../git/checkpoint.js');
      const cp = new CheckpointManager(process.cwd());
      const desc = ctx.args || undefined;
      const result = await cp.create(desc);
      return { handled: true, message: result.success ? chalk.green(`✓ ${result.message}`) : chalk.red(`✗ ${result.message}`) };
    } catch {
      return { handled: true, message: chalk.yellow('Git 模块不可用') };
    }
  },
};

// /tokens — 显示 token 用量
const tokensCommand: SlashCommand = {
  name: 'tokens',
  description: '显示当前对话的 token 用量估算',
  execute: async (ctx) => {
    const { estimateTokens } = await import('../../utils/tokens.js');
    let totalTokens = 0;
    for (const msg of ctx.messages) {
      totalTokens += estimateTokens(msg.content);
    }
    const msgCount = ctx.messages.length;
    return {
      handled: true,
      message: chalk.dim(`\n📊 Token 用量估算:\n  消息数: ${msgCount}\n  估算 tokens: ~${totalTokens.toLocaleString()}\n  估算字符: ~${ctx.messages.reduce((s, m) => s + m.content.length, 0).toLocaleString()}\n`),
    };
  },
};

// /save — 保存对话到记忆
const saveCommand: SlashCommand = {
  name: 'save',
  description: '手动保存当前对话到记忆系统',
  execute: async (ctx) => {
    try {
      const { memoryManager } = await import('../../memory/manager.js');
      const lastUser = [...ctx.messages].reverse().find(m => m.role === 'user');
      const lastAssistant = [...ctx.messages].reverse().find(m => m.role === 'assistant');
      if (lastUser && lastAssistant) {
        await memoryManager.rememberChat({
          input: lastUser.content,
          output: lastAssistant.content,
          provider: ctx.providerType as ProviderType,
          model: ctx.modelId,
        });
        return { handled: true, message: chalk.green('✓ 对话已保存到记忆') };
      }
      return { handled: true, message: chalk.yellow('没有可保存的对话') };
    } catch {
      return { handled: true, message: chalk.yellow('记忆系统不可用') };
    }
  },
};

// /architect — 切换到双模型模式
const architectCommand: SlashCommand = {
  name: 'architect',
  description: '切换到双模型模式 (Architect + Editor)',
  execute: async () => {
    return {
      handled: true,
      message: chalk.cyan('🏗️ 双模型模式需要在 agent run 中使用:\n  devflow agent run "任务" --architect'),
    };
  },
};

// /plan — 切换到 Plan/Act 模式
const planCommand: SlashCommand = {
  name: 'plan',
  description: '切换到 Plan/Act 模式 (先规划后执行)',
  execute: async () => {
    return {
      handled: true,
      message: chalk.cyan('📋 Plan/Act 模式需要在 agent run 中使用:\n  devflow agent run "任务" --plan-first'),
    };
  },
};

// /compact — 压缩对话历史（AI 智能摘要）
const compactCommand: SlashCommand = {
  name: 'compact',
  aliases: ['summarize'],
  description: '压缩对话历史（AI 智能摘要）',
  execute: async (ctx) => {
    if (ctx.messages.length < 4) {
      return { handled: true, message: chalk.dim('对话太短，无需压缩') };
    }

    const originalCount = ctx.messages.length;

    // 尝试使用 AI 压缩
    try {
      const { CompressionService } = await import('../../services/compression-service.js');
      const { configManager } = await import('../../config/manager.js');
      const { createProviderInstance } = await import('../chat/helpers.js');

      // 直接创建 CompressionService 实例
      // CompressionService 依赖 IProviderFactory，这里通过适配器注入
      const providerType = ctx.providerType as ProviderType;
      const provider = createProviderInstance(providerType);

      // 手动构建压缩所需的 provider factory 适配器
      const adapterFactory: IProviderFactory = {
        getDefaultProvider: () => provider as ILLMProvider,
        getProvider: () => provider as ILLMProvider,
        listAvailableProviders: () => [providerType],
        isProviderAvailable: () => true,
      };

      const compressionService = new CompressionService(
        adapterFactory,
        configManager as IConfigManager
      );

      const nonSystemMessages = ctx.messages.filter(m => m.role !== 'system');
      const result = await compressionService.compressMessages(nonSystemMessages);

      if (result.summary) {
        const systemMsgs = ctx.messages.filter(m => m.role === 'system');
        const recentMsgs = ctx.messages.filter(m => m.role !== 'system').slice(-4);
        ctx.messages.length = 0;
        ctx.messages.push(...systemMsgs);
        ctx.messages.push({
          role: 'system',
          content: `[对话历史摘要]\n${result.summary}`,
        });
        ctx.messages.push(...recentMsgs);

        return {
          handled: true,
          message: chalk.green(
            `✓ 对话已智能压缩: ${originalCount}条 → ${ctx.messages.length}条` +
            chalk.dim(` (节省 ~${result.tokensSaved} tokens)`)
          ),
        };
      }
    } catch (error) {
      // AI 压缩失败，回退到简单截断
      const errMsg = error instanceof Error ? error.message : String(error);
      const systemMsgs = ctx.messages.filter(m => m.role === 'system');
      const recentMsgs = ctx.messages.slice(-4);
      ctx.messages.length = 0;
      ctx.messages.push(...systemMsgs);
      ctx.messages.push({
        role: 'system',
        content: '[之前的对话历史已被压缩（AI摘要失败，使用简单截断）]',
      });
      ctx.messages.push(...recentMsgs);
      return {
        handled: true,
        message: chalk.yellow(
          `⚠ AI 压缩失败 (${errMsg})，已回退到简单截断: ${originalCount}条 → ${ctx.messages.length}条`
        ),
      };
    }

    // 默认回退
    const systemMsgs = ctx.messages.filter(m => m.role === 'system');
    const recentMsgs = ctx.messages.slice(-4);
    ctx.messages.length = 0;
    ctx.messages.push(...systemMsgs);
    ctx.messages.push({
      role: 'system',
      content: '[之前的对话历史已被压缩]',
    });
    ctx.messages.push(...recentMsgs);
    return { handled: true, message: chalk.green(`✓ 对话已压缩 (${ctx.messages.length} 条消息)`) };
  },
};

// /copy — 复制最后一次 AI 回复
const copyCommand: SlashCommand = {
  name: 'copy',
  description: '复制最后一次 AI 回复到剪贴板',
  execute: async (ctx) => {
    const lastAssistant = [...ctx.messages].reverse().find(m => m.role === 'assistant');
    if (!lastAssistant) {
      return { handled: true, message: chalk.yellow('没有可复制的回复') };
    }
    try {
      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      const execAsync = promisify(exec);

      // 尝试使用 pbcopy (macOS) 或 xclip (Linux) 或 clip (Windows)
      const cmd = process.platform === 'darwin' ? 'pbcopy' : process.platform === 'win32' ? 'clip' : 'xclip -selection clipboard';
      await execAsync(`echo ${JSON.stringify(lastAssistant.content)} | ${cmd}`);
      return { handled: true, message: chalk.green('✓ 已复制到剪贴板') };
    } catch {
      return { handled: true, message: chalk.yellow('复制失败（剪贴板工具不可用）') };
    }
  },
};

// /history — 查看聊天历史
const historyCommand: SlashCommand = {
  name: 'history',
  description: '查看聊天历史记录',
  execute: async () => {
    try {
      const { historyManager } = await import('../../history/manager.js');
      const sessions = await historyManager.listSessions();
      const recent = sessions.slice(0, 10);
      if (sessions.length === 0) {
        return { handled: true, message: chalk.dim('没有历史记录') };
      }
      let output = chalk.bold('\n📜 最近对话:\n');
      recent.forEach((s: { title?: string; messageCount?: number }, i: number) => {
        output += `  ${chalk.dim(`${i + 1}.`)} ${chalk.cyan(s.title || '无标题')} ${chalk.dim(`(${s.messageCount || 0}条消息)`)}\n`;
      });
      return { handled: true, message: output };
    } catch {
      return { handled: true, message: chalk.yellow('历史模块不可用') };
    }
  },
};

// /image — 附加图片到对话
const imageCommand: SlashCommand = {
  name: 'image',
  aliases: ['img'],
  description: '附加图片到对话 (/image <文件路径>)',
  args: { name: '文件路径', description: '图片文件路径 (png, jpg, gif, webp)', required: true },
  execute: async (ctx) => {
    const imagePath = ctx.args.trim();
    if (!imagePath) {
      return {
        handled: true,
        message: chalk.yellow('用法: /image <文件路径>\n  支持的格式: png, jpg, gif, webp'),
      };
    }
    try {
      const fs = await import('fs/promises');
      const path = await import('path');
      const fullPath = path.resolve(imagePath);
      const cwd = process.cwd();
      if (!fullPath.startsWith(cwd)) {
        throw new Error('Image path must be within project directory');
      }
      const ext = path.extname(fullPath).slice(1).toLowerCase();
      const mediaType = ext === 'jpg' ? 'jpeg' : ext === 'svg' ? 'svg+xml' : ext;
      const imageBuffer = await fs.readFile(fullPath);
      const base64 = imageBuffer.toString('base64');
      const imageUrl = `data:image/${mediaType};base64,${base64}`;

      // 将图片添加到消息中
      ctx.messages.push({
        role: 'user',
        content: [
          { type: 'text', text: '[用户附加了一张图片]' },
          { type: 'image_url', image_url: { url: imageUrl, detail: 'auto' } }
        ],
        timestamp: new Date().toISOString(),
      });
      return {
        handled: true,
        message: chalk.green(`✓ 已附加图片: ${imagePath} (${(imageBuffer.length / 1024).toFixed(1)} KB)`),
      };
    } catch (err: unknown) {
      return {
        handled: true,
        message: chalk.red(`✗ 图片读取失败: ${getErrorMessage(err)}`),
      };
    }
  },
};

// ═══════════════════════════════════════════════════════════
// 命令注册表初始化
// ═══════════════════════════════════════════════════════════

/** 全局命令注册表 */
export const COMMAND_REGISTRY: CommandRegistry = createCommandRegistry();

// 注册所有内置命令
registerCommandToRegistry(COMMAND_REGISTRY, exitCommand);
registerCommandToRegistry(COMMAND_REGISTRY, helpCommand);
registerCommandToRegistry(COMMAND_REGISTRY, clearCommand);
registerCommandToRegistry(COMMAND_REGISTRY, modelCommand);
registerCommandToRegistry(COMMAND_REGISTRY, undoCommand);
registerCommandToRegistry(COMMAND_REGISTRY, diffCommand);
registerCommandToRegistry(COMMAND_REGISTRY, checkpointCommand);
registerCommandToRegistry(COMMAND_REGISTRY, tokensCommand);
registerCommandToRegistry(COMMAND_REGISTRY, saveCommand);
registerCommandToRegistry(COMMAND_REGISTRY, architectCommand);
registerCommandToRegistry(COMMAND_REGISTRY, planCommand);
registerCommandToRegistry(COMMAND_REGISTRY, compactCommand);
registerCommandToRegistry(COMMAND_REGISTRY, copyCommand);
registerCommandToRegistry(COMMAND_REGISTRY, historyCommand);
registerCommandToRegistry(COMMAND_REGISTRY, imageCommand);

/** 导出所有内置命令 */
export const BUILT_IN_COMMANDS: SlashCommand[] = [
  exitCommand,
  helpCommand,
  clearCommand,
  modelCommand,
  undoCommand,
  diffCommand,
  checkpointCommand,
  tokensCommand,
  saveCommand,
  architectCommand,
  planCommand,
  compactCommand,
  copyCommand,
  historyCommand,
  imageCommand,
];
