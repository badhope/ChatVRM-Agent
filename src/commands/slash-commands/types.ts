/**
 * 斜杠命令类型定义
 */

/** 消息类型 */
export type Message = {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | any;
  timestamp?: string;
  provider?: string;
  model?: string;
};

/** 斜杠命令定义 */
export interface SlashCommand {
  /** 命令名（不含 /） */
  name: string;
  /** 别名 */
  aliases?: string[];
  /** 简短描述 */
  description: string;
  /** 详细帮助 */
  help?: string;
  /** 是否需要参数 */
  args?: {
    name: string;
    description: string;
    required?: boolean;
  };
  /** 执行函数 */
  execute: (context: SlashCommandContext) => Promise<SlashCommandResult | void>;
}

/** 斜杠命令上下文 */
export interface SlashCommandContext {
  /** 命令参数（/command 后面的部分） */
  args: string;
  /** 聊天历史 */
  messages: Message[];
  /** 当前模型 ID */
  modelId: string;
  /** 当前平台类型 */
  providerType: string;
  /** 更新模型 */
  setModel: (modelId: string) => void;
  /** 更新平台 */
  setProvider: (provider: string) => void;
}

/** 斜杠命令结果 */
export interface SlashCommandResult {
  /** 是否已处理（阻止发送给 AI） */
  handled: boolean;
  /** 输出消息 */
  message?: string;
  /** 是否退出聊天 */
  exit?: boolean;
}

/** 解析后的命令结果 */
export interface ParsedCommand {
  name: string;
  args: string;
}
