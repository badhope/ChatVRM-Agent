/**
 * Agent Service Factory - 服务工厂实现
 *
 * 创建和配置 Agent 核心服务实例。
 * 实现依赖注入模式，支持服务共享和单例管理。
 */

import type {
  IAgentServiceFactory,
  ITaskCoordinator,
  IExecutionEngine,
  IReflectionEngine,
  ILearningEngine,
  IStateManager,
  ITrustChecker,
  IContextManager,
  ReflectionResult,
  ExperienceEntry,
} from './interfaces.js';

import type { Task, TaskStep } from '../types.js';
import type { ToolResult } from '../core/types.js';

import { TaskCoordinator } from './task-coordinator.js';
import { ContextManager } from '../context-manager.js';
import { KnowledgeGraph } from '../../memory/knowledgeGraph.js';
import { DecisionReflector } from '../decision-reflector.js';
import { ExperienceStore, type Experience } from '../experience-store.js';
import { PersonalityManager } from '../personality.js';
import { EmotionalStateManager } from '../emotional-state.js';
import { createLogger } from '../../services/logger.js';

const logger = createLogger('AgentServiceFactory');

/**
 * Agent 服务工厂实现
 *
 * 提供以下功能：
 * - 懒加载创建服务实例
 * - 单例模式管理共享服务
 * - 依赖注入支持
 */
export class AgentServiceFactory implements IAgentServiceFactory {
  // 缓存的单例实例
  private contextManagerInstance?: ContextManager;
  private knowledgeGraph?: KnowledgeGraph;
  private decisionReflector?: DecisionReflector;
  private experienceStore?: ExperienceStore;
  private personalityManager?: PersonalityManager;
  private emotionalStateManager?: EmotionalStateManager;

  // 默认配置
  private readonly defaultMaxTokens: number;

  constructor(options?: { defaultMaxTokens?: number }) {
    this.defaultMaxTokens = options?.defaultMaxTokens ?? 8000;
  }

  /**
   * 创建任务协调器
   * 每次调用返回新实例（任务相关）
   */
  createTaskCoordinator(): ITaskCoordinator {
    logger.debug('Creating new TaskCoordinator instance');
    return new TaskCoordinator();
  }

  /**
   * 创建执行引擎
   * 注意：当前实现使用函数式执行器，此方法返回一个适配器
   */
  createExecutionEngine(): IExecutionEngine {
    logger.debug('Creating ExecutionEngine adapter');
    const reflector = this.getDecisionReflector();
    // 返回一个基于现有 executeToolStep 和 executeReasoningStep 的适配器
    return {
      executeToolStep: async (step: TaskStep, context): Promise<ToolResult> => {
        const { executeToolStep } = await import('../core/tool-executor.js');
        return executeToolStep(step, context.stepIndex, context.sharedContext, {
          taskId: context.taskId,
          userInput: context.userInput,
          intent: context.intent,
          onOutput: context.onOutput,
          getContext: async () => [],
        });
      },
      executeReasoningStep: async (step: TaskStep, context): Promise<ToolResult> => {
        const { executeReasoningStep } = await import('../core/tool-executor.js');
        return executeReasoningStep(step, context.stepIndex, {
          taskId: context.taskId,
          userInput: context.userInput,
          intent: context.intent,
          onOutput: context.onOutput,
          getContext: async () => [],
        });
      },
      requiresConfirmation: (step: TaskStep): boolean => {
        // 危险操作需要确认
        const dangerousTools = ['shell', 'write_file', 'edit_file', 'delete_file'];
        return dangerousTools.includes(step.tool ?? '');
      },
      formatToolResult: (result: ToolResult): string => {
        if (result.success) {
          return result.output ?? '操作成功';
        }
        return `错误: ${result.error ?? '未知错误'}`;
      },
    };
  }

  /**
   * 创建反思引擎
   */
  createReflectionEngine(): IReflectionEngine {
    logger.debug('Creating ReflectionEngine adapter');
    const reflector = this.getDecisionReflector();

    return {
      reflectOnStep: async (step: TaskStep, context): Promise<ReflectionResult> => {
        // 使用 reflectOnTask 作为替代
        const reflection = await reflector.reflectOnTask(
          context.taskId,
          step.description,
          step.result ?? ''
        );

        return {
          content: reflection.failures.length > 0
            ? `步骤反思: ${reflection.failures.join('; ')}`
            : `步骤完成: ${step.description}`,
          corrections: reflection.failures.length,
          improvements: reflection.improvements.map(i => i.recommendation),
          overallRating: reflection.overallRating,
        };
      },
      reflectOnTask: async (task: Task): Promise<ReflectionResult> => {
        const reflection = await reflector.reflectOnTask(
          task.id,
          task.userInput,
          task.result ?? ''
        );

        return {
          content: reflection.successes.length > 0
            ? `任务成功: ${reflection.successes.join('; ')}`
            : `任务反思: ${reflection.failures.join('; ')}`,
          corrections: reflection.failures.length,
          improvements: reflection.improvements.map(i => i.recommendation),
          overallRating: reflection.overallRating,
        };
      },
      generateImprovements: async (task: Task): Promise<string[]> => {
        const reflection = await reflector.reflectOnTask(
          task.id,
          task.userInput,
          task.result ?? ''
        );
        return reflection.improvements.map(i => i.recommendation);
      },
    };
  }

  /**
   * 创建学习引擎
   */
  createLearningEngine(): ILearningEngine {
    logger.debug('Creating LearningEngine adapter');
    const experienceStore = this.getExperienceStore();

    return {
      learnFromTask: async (task: Task, reflection: ReflectionResult): Promise<ExperienceEntry> => {
        const emotionalTone: Experience['emotionalTone'] =
          reflection.overallRating >= 0.8 ? 'excited' :
          reflection.overallRating >= 0.5 ? 'confident' :
          reflection.overallRating >= 0.3 ? 'neutral' : 'cautious';

        const experience: Experience = {
          id: `exp-${task.id}`,
          timestamp: new Date().toISOString(),
          taskType: task.intent ?? 'general',
          taskDescription: task.userInput,
          decisions: [],
          lessons: reflection.improvements,
          improvements: reflection.improvements,
          patterns: [],
          emotionalTone,
        };

        await experienceStore.addExperience(experience);
        return experience;
      },
      storeExperience: async (experience: ExperienceEntry): Promise<void> => {
        await experienceStore.addExperience(experience as Experience);
      },
      getBehaviorGuidelines: async (): Promise<string> => {
        return experienceStore.generateBehaviorGuidelines();
      },
      loadExperiences: async (): Promise<void> => {
        await experienceStore.load();
      },
    };
  }

  /**
   * 创建状态管理器
   * @param taskId 任务ID
   */
  createStateManager(taskId: string): IStateManager {
    logger.debug({ taskId }, 'Creating StateManager');
    const { createStateMachine } = require('../core/state-machine.js');
    return createStateMachine(taskId);
  }

  /**
   * 创建信任检查器
   */
  createTrustChecker(): ITrustChecker {
    logger.debug('Creating TrustChecker adapter');
    const { detectIssues, generateTrustReport, askUserConfirmation } = require('../trust.js');

    return {
      checkStep: (result: string, context: { intent?: string; toolUsed?: string }) => {
        const issues = detectIssues(result, context);
        return generateTrustReport(issues);
      },
      askUserConfirmation: async (report) => {
        return askUserConfirmation(report);
      },
    };
  }

  /**
   * 创建上下文管理器
   * @param maxTokens 最大令牌数
   */
  createContextManager(maxTokens?: number): IContextManager {
    logger.debug({ maxTokens: maxTokens ?? this.defaultMaxTokens }, 'Creating ContextManager');
    const cm = new ContextManager(maxTokens ?? this.defaultMaxTokens);
    // 适配 IContextManager 接口
    return {
      buildContext: async (userInput: string, maxTokens: number) => {
        await cm.addMessage({ role: 'user', content: userInput });
        return cm.getContext().map(m => m.content).join('\n');
      },
      addToolResult: async (toolName: string, result: string, success: boolean) => {
        await cm.addToolResult(toolName, result, success);
      },
      getContext: () => {
        return cm.getContext().map(m => m.content).join('\n');
      },
      clearContext: () => {
        cm.clear();
      },
    };
  }

  // ============================================================
  // 单例访问器
  // ============================================================

  /**
   * 获取共享的上下文管理器
   */
  getContextManager(): ContextManager {
    if (!this.contextManagerInstance) {
      this.contextManagerInstance = new ContextManager(this.defaultMaxTokens);
    }
    return this.contextManagerInstance;
  }

  /**
   * 获取共享的知识图谱
   */
  getKnowledgeGraph(): KnowledgeGraph {
    if (!this.knowledgeGraph) {
      this.knowledgeGraph = new KnowledgeGraph();
    }
    return this.knowledgeGraph;
  }

  /**
   * 获取共享的决策反思器
   */
  getDecisionReflector(): DecisionReflector {
    if (!this.decisionReflector) {
      this.decisionReflector = new DecisionReflector();
    }
    return this.decisionReflector;
  }

  /**
   * 获取共享的经验存储
   */
  getExperienceStore(): ExperienceStore {
    if (!this.experienceStore) {
      this.experienceStore = new ExperienceStore();
    }
    return this.experienceStore;
  }

  /**
   * 获取共享的人格管理器
   */
  getPersonalityManager(): PersonalityManager {
    if (!this.personalityManager) {
      this.personalityManager = new PersonalityManager();
    }
    return this.personalityManager;
  }

  /**
   * 获取共享的情绪状态管理器
   */
  getEmotionalStateManager(): EmotionalStateManager {
    if (!this.emotionalStateManager) {
      this.emotionalStateManager = new EmotionalStateManager();
    }
    return this.emotionalStateManager;
  }

  // ============================================================
  // 初始化方法
  // ============================================================

  /**
   * 初始化所有共享服务
   */
  async initialize(): Promise<void> {
    logger.info('Initializing AgentServiceFactory');

    // 加载人格配置
    try {
      await this.getPersonalityManager().load();
    } catch (error) {
      logger.debug({ error }, 'Personality loading failed (non-critical)');
    }

    // 加载决策历史
    await this.getDecisionReflector().load();

    // 加载经验存储
    try {
      await this.getExperienceStore().load();
    } catch (error) {
      logger.debug({ error }, 'Experience loading failed (non-critical)');
    }

    // 初始化知识图谱
    try {
      await this.getKnowledgeGraph().init();
    } catch (error) {
      logger.debug({ error }, 'KnowledgeGraph initialization failed (non-critical)');
    }

    logger.info('AgentServiceFactory initialized successfully');
  }

  /**
   * 清理所有共享服务
   */
  reset(): void {
    logger.debug('Resetting AgentServiceFactory');
    this.contextManagerInstance = undefined;
    this.knowledgeGraph = undefined;
    this.decisionReflector = undefined;
    this.experienceStore = undefined;
    this.personalityManager = undefined;
    this.emotionalStateManager = undefined;
  }
}

// ============================================================
// 默认工厂实例
// ============================================================

/**
 * 默认服务工厂实例
 */
export const agentServiceFactory = new AgentServiceFactory();
