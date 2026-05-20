import { Command } from 'commander';
import { configManager } from '../config/manager.js';
import { chatStartCommand } from './chat/chat-start.js';
import { chatAskCommand } from './chat/chat-ask.js';
import { chatModelsCommand, chatSearchCommand, chatRemoteModelsCommand } from './chat/chat-models.js';

export const chatCommand = new Command('chat')
  .description('与 AI 对话');
chatCommand.addCommand(chatStartCommand);
chatCommand.addCommand(chatAskCommand);
chatCommand.addCommand(chatModelsCommand);
chatCommand.addCommand(chatSearchCommand);
chatCommand.addCommand(chatRemoteModelsCommand);

// 添加 resume 子命令
chatCommand
  .command('resume [sessionId]')
  .description('恢复中断的对话')
  .action(async (sessionId) => {
    await configManager.init();
    const { resumeSession } = await import('./chat/chat-resume.js');
    await resumeSession(sessionId);
  });
