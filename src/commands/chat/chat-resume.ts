import fs from 'fs/promises';
import path from 'path';
import inquirer from 'inquirer';
import { DEVFLOW_DIR } from '../../utils/index.js';
import { printInfo, printSuccess, printError } from '../../ui/logo.js';

const SESSIONS_DIR = path.join(DEVFLOW_DIR, 'sessions');

export interface InterruptedSession {
  id: string;
  savedAt: string;
  messageCount: number;
}

/**
 * 列出所有中断的对话会话
 */
export async function listInterruptedSessions(): Promise<InterruptedSession[]> {
  try {
    await fs.mkdir(SESSIONS_DIR, { recursive: true });
    const files = await fs.readdir(SESSIONS_DIR);
    const sessions: InterruptedSession[] = [];
    
    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      try {
        const content = await fs.readFile(path.join(SESSIONS_DIR, file), 'utf-8');
        const session = JSON.parse(content);
        if (session.interrupted) {
          sessions.push({
            id: session.id,
            savedAt: session.savedAt,
            messageCount: session.messages?.length || 0
          });
        }
      } catch (error) {
        // Skip invalid session files
      }
    }
    
    return sessions.sort((a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime());
  } catch (error) {
    return [];
  }
}

/**
 * 恢复中断的对话会话
 */
export async function resumeSession(sessionId?: string): Promise<void> {
  const sessions = await listInterruptedSessions();
  
  if (sessions.length === 0) {
    printInfo('没有找到可恢复的对话');
    return;
  }
  
  let targetSession = sessionId;
  
  if (!targetSession) {
    if (sessions.length === 1) {
      targetSession = sessions[0].id;
    } else {
      const answer = await inquirer.prompt([{
        type: 'list',
        name: 'session',
        message: '选择要恢复的对话',
        choices: sessions.map(s => ({
          name: `${s.id} (${s.messageCount}条消息, ${new Date(s.savedAt).toLocaleString()})`,
          value: s.id
        }))
      }]);
      targetSession = answer.session;
    }
  }
  
  const sessionFile = path.join(SESSIONS_DIR, `${targetSession}.json`);
  const content = await fs.readFile(sessionFile, 'utf-8');
  const session = JSON.parse(content);
  
  printSuccess(`已恢复对话 (${session.messages.length}条历史消息)`);
  printInfo('输入 /help 查看可用命令');
  
  // 启动对话并传入历史消息
  const { startInteractiveChat } = await import('./chat-start.js');
  await startInteractiveChat({ resumeMessages: session.messages });
}
