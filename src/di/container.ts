import 'reflect-metadata';
import { container, Lifecycle } from 'tsyringe';
import { TOKENS } from './tokens.js';

// 导入核心服务类
import { ConfigManager, configManager } from '../config/manager.js';
import { MemoryManager, memoryManager } from '../memory/manager.js';
import { GitManager } from '../git/manager.js';
import { ToolRegistry, toolRegistry } from '../tools/registry.js';
import { PluginLoader } from '../plugins/plugin-loader.js';
import { HistoryManager } from '../history/manager.js';

// 导入 Service 层
import { ChatService } from '../services/chat-service.js';
import { AgentService } from '../services/agent-service.js';
import { MemoryService } from '../services/memory-service.js';
import { CompressionService } from '../services/compression-service.js';

// ========== 导入新架构 (DDD) ==========
// Repositories
import { JsonPersonalityRepository } from '../agent/infrastructure/repositories/personality.repository.js';
import { JsonDecisionRepository } from '../agent/infrastructure/repositories/decision.repository.js';
import { JsonExperienceRepository } from '../agent/infrastructure/repositories/experience.repository.js';

// Application Services
import { PersonalityApplicationService } from '../agent/application/services/personality.application.service.js';
import { EmotionApplicationService } from '../agent/application/services/emotion.application.service.js';
import { DecisionApplicationService } from '../agent/application/services/decision.application.service.js';
import { ExperienceApplicationService } from '../agent/application/services/experience.application.service.js';

// Controllers
import { PersonalityController } from '../agent/interfaces/controllers/personality.controller.js';
import { DecisionController } from '../agent/interfaces/controllers/decision.controller.js';

// ========== 旧架构已删除，使用新的 DDD 架构 ==========

// 导入 Agent 核心组件
import { ContextManager } from '../agent/context-manager.js';
import { AgentExecutor } from '../agent/core.js';

// ============================================================
// 依赖注入容器配置
// ============================================================

/**
 * 注册核心服务到 DI 容器
 * 所有核心服务都以单例模式注册
 */
export function registerCoreServices(): void {
  // ConfigManager - 使用已存在的单例
  container.register(TOKENS.ConfigManager, { useValue: configManager });

  // MemoryManager - 使用已存在的单例
  container.register(TOKENS.MemoryManager, { useValue: memoryManager });

  // GitManager - 单例
  container.register(
    TOKENS.GitManager,
    { useClass: GitManager },
    { lifecycle: Lifecycle.Singleton }
  );

  // ToolRegistry - 使用已存在的单例
  container.register(TOKENS.ToolRegistry, { useValue: toolRegistry });

  // PluginLoader - 单例
  container.register(
    TOKENS.PluginLoader,
    { useClass: PluginLoader },
    { lifecycle: Lifecycle.Singleton }
  );

  // HistoryManager - 单例
  container.register(
    TOKENS.HistoryManager,
    { useClass: HistoryManager },
    { lifecycle: Lifecycle.Singleton }
  );
}

/**
 * 注册 Service 层到 DI 容器
 * Service 层以单例模式注册，便于状态共享
 */
export function registerServices(): void {
  // ChatService - 单例
  container.register(
    TOKENS.ChatService,
    { useClass: ChatService },
    { lifecycle: Lifecycle.Singleton }
  );

  // AgentService - 单例
  container.register(
    TOKENS.AgentService,
    { useClass: AgentService },
    { lifecycle: Lifecycle.Singleton }
  );

  // MemoryService - 单例
  container.register(
    TOKENS.MemoryService,
    { useClass: MemoryService },
    { lifecycle: Lifecycle.Singleton }
  );

  // CompressionService - 单例
  container.register(
    TOKENS.CompressionService,
    { useClass: CompressionService },
    { lifecycle: Lifecycle.Singleton }
  );
}

/**
 * 注册 Agent 核心组件到 DI 容器
 * Agent 组件以单例模式注册
 */
export function registerAgentServices(): void {
  // ContextManager - 单例（默认 8000 tokens）
  // 使用 useValue 注册预创建的实例
  const contextManagerInstance = new ContextManager(8000);
  container.register(TOKENS.ContextManager, { useValue: contextManagerInstance });

  // AgentCore (AgentExecutor) - 每次创建新实例（因为需要传入 userInput）
  // 注意：AgentExecutor 需要构造参数，这里注册为类提供者
  container.register(TOKENS.AgentCore, { useClass: AgentExecutor });

  // TaskPlanner - 使用函数形式，无需注册（planTask 是纯函数）
  // StepExecutor - 使用函数形式，无需注册（executeStep 是纯函数）
}

/**
 * 注册新架构 (DDD) 层到 DI 容器
 */
export function registerDDDServices(): void {
  // ========== Repositories (Infrastructure Layer) ==========
  // Personality Repository
  container.register(
    TOKENS.PersonalityRepository,
    { useClass: JsonPersonalityRepository },
    { lifecycle: Lifecycle.Singleton }
  );

  // Decision Repository
  container.register(
    TOKENS.DecisionRepository,
    { useClass: JsonDecisionRepository },
    { lifecycle: Lifecycle.Singleton }
  );

  // Experience Repository
  container.register(
    TOKENS.ExperienceRepository,
    { useClass: JsonExperienceRepository },
    { lifecycle: Lifecycle.Singleton }
  );

  // ========== Domain Services (Domain Layer) ==========
  // Personality Service - 静态类，无需注册
  // Emotion Service - 静态类，无需注册
  // Decision Service - 静态类，无需注册
  // Experience Service - 静态类，无需注册

  // ========== Application Services (Application Layer) ==========
  // Personality Application Service
  container.register(
    TOKENS.PersonalityApplicationService,
    { useClass: PersonalityApplicationService },
    { lifecycle: Lifecycle.Singleton }
  );

  // Emotion Application Service
  container.register(
    TOKENS.EmotionApplicationService,
    { useClass: EmotionApplicationService },
    { lifecycle: Lifecycle.Singleton }
  );

  // Decision Application Service
  container.register(
    TOKENS.DecisionApplicationService,
    { useClass: DecisionApplicationService },
    { lifecycle: Lifecycle.Singleton }
  );

  // Experience Application Service
  container.register(
    TOKENS.ExperienceApplicationService,
    { useClass: ExperienceApplicationService },
    { lifecycle: Lifecycle.Singleton }
  );

  // ========== Controllers (Interface Layer) ==========
  // Personality Controller
  container.register(
    TOKENS.PersonalityController,
    { useClass: PersonalityController },
    { lifecycle: Lifecycle.Singleton }
  );

  // Decision Controller
  container.register(
    TOKENS.DecisionController,
    { useClass: DecisionController },
    { lifecycle: Lifecycle.Singleton }
  );
}

/**
 * 初始化所有依赖注入注册
 * 在应用启动时调用
 */
export function initializeContainer(): void {
  registerCoreServices();
  registerServices();
  registerAgentServices();
  registerDDDServices(); // 添加新架构服务
}

/**
 * 获取已注册的服务实例
 * 这些辅助函数提供类型安全的服务访问
 */
export function getConfigManager(): ConfigManager {
  return container.resolve<ConfigManager>(TOKENS.ConfigManager);
}

export function getMemoryManager(): MemoryManager {
  return container.resolve<MemoryManager>(TOKENS.MemoryManager);
}

export function getGitManager(): GitManager {
  return container.resolve<GitManager>(TOKENS.GitManager);
}

export function getToolRegistry(): ToolRegistry {
  return container.resolve<ToolRegistry>(TOKENS.ToolRegistry);
}

export function getPluginLoader(): PluginLoader {
  return container.resolve<PluginLoader>(TOKENS.PluginLoader);
}

export function getHistoryManager(): HistoryManager {
  return container.resolve<HistoryManager>(TOKENS.HistoryManager);
}

// Service 层访问函数
export function getChatService(): ChatService {
  return container.resolve<ChatService>(TOKENS.ChatService);
}

export function getAgentService(): AgentService {
  return container.resolve<AgentService>(TOKENS.AgentService);
}

export function getMemoryService(): MemoryService {
  return container.resolve<MemoryService>(TOKENS.MemoryService);
}

// 旧 API 的向后兼容，返回新的控制器
export function getPersonalityManager(): unknown {
  return getPersonalityController();
}

export function getEmotionalStateManager(): unknown {
  return getEmotionApplicationService();
}

// Agent 组件访问函数
export function getContextManager(): ContextManager {
  return container.resolve<ContextManager>(TOKENS.ContextManager);
}

// ========== 新架构 (DDD) 访问函数 ==========
// Repositories
export function getPersonalityRepository(): JsonPersonalityRepository {
  return container.resolve<JsonPersonalityRepository>(TOKENS.PersonalityRepository);
}

export function getDecisionRepository(): JsonDecisionRepository {
  return container.resolve<JsonDecisionRepository>(TOKENS.DecisionRepository);
}

export function getExperienceRepository(): JsonExperienceRepository {
  return container.resolve<JsonExperienceRepository>(TOKENS.ExperienceRepository);
}

// Application Services
export function getPersonalityApplicationService(): PersonalityApplicationService {
  return container.resolve<PersonalityApplicationService>(TOKENS.PersonalityApplicationService);
}

export function getEmotionApplicationService(): EmotionApplicationService {
  return container.resolve<EmotionApplicationService>(TOKENS.EmotionApplicationService);
}

export function getDecisionApplicationService(): DecisionApplicationService {
  return container.resolve<DecisionApplicationService>(TOKENS.DecisionApplicationService);
}

export function getExperienceApplicationService(): ExperienceApplicationService {
  return container.resolve<ExperienceApplicationService>(TOKENS.ExperienceApplicationService);
}

// Controllers
export function getPersonalityController(): PersonalityController {
  return container.resolve<PersonalityController>(TOKENS.PersonalityController);
}

export function getDecisionController(): DecisionController {
  return container.resolve<DecisionController>(TOKENS.DecisionController);
}

// 导出容器实例（用于高级用例）
export { container };
