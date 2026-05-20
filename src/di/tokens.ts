// ============================================================
// 依赖注入令牌定义
// ============================================================

/**
 * 注入令牌 - 用于 TSyringe 依赖注入容器
 * 使用 Symbol 确保唯一性
 */
export const TOKENS = {
  // 核心服务
  ConfigManager: Symbol('ConfigManager'),
  MemoryManager: Symbol('MemoryManager'),
  ProviderFactory: Symbol('ProviderFactory'),

  // Git 相关
  GitManager: Symbol('GitManager'),

  // 工具与插件
  ToolRegistry: Symbol('ToolRegistry'),
  PluginLoader: Symbol('PluginLoader'),

  // Agent 组件
  AgentCore: Symbol('AgentCore'),
  TaskPlanner: Symbol('TaskPlanner'),
  StepExecutor: Symbol('StepExecutor'),

  // 历史与上下文
  HistoryManager: Symbol('HistoryManager'),
  ContextManager: Symbol('ContextManager'),

  // UI 组件
  DisplayManager: Symbol('DisplayManager'),

  // Service 层
  ChatService: Symbol('ChatService'),
  AgentService: Symbol('AgentService'),
  MemoryService: Symbol('MemoryService'),
  CompressionService: Symbol('CompressionService'),

  // 人格与情绪
  PersonalityManager: Symbol('PersonalityManager'),
  EmotionalStateManager: Symbol('EmotionalStateManager'),

  // 知识图谱
  KnowledgeGraph: Symbol('KnowledgeGraph'),
} as const;

/**
 * 令牌类型 -从 TOKENS 对象派生
 */
export type TokenType = typeof TOKENS[keyof typeof TOKENS];
