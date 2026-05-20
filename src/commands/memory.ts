import { Command } from 'commander';
import { memoryBasicCommand } from './memory/basic-cmd.js';
import { memoryGraphCommand } from './memory/graph-cmd.js';
import { memoryKnowledgeCommand } from './memory/knowledge-cmd.js';
import { memoryRagCommand } from './memory/rag-cmd.js';
import { memoryReflectCommand } from './memory/reflect-cmd.js';

export const memoryCommand = new Command('memory')
  .alias('mem')
  .description('记忆管理（记住对话历史，智能召回）');
memoryCommand.addCommand(memoryBasicCommand);
memoryCommand.addCommand(memoryGraphCommand);
memoryCommand.addCommand(memoryKnowledgeCommand);
memoryCommand.addCommand(memoryRagCommand);
memoryCommand.addCommand(memoryReflectCommand);
