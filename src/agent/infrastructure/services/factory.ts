/**
 * Agent Service Factory - 服务工厂实现
 *
 * 创建和配置 Agent 核心服务实例。
 * 使用新的 DDD 四层架构
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

import type { Task, TaskStep } from '../../types.js';
import type { ToolResult } from '../core/types.js';

import { TaskCoordinator } from './task-coordinator.js';
import { ContextManager } from '../common/context-manager.js';
import { KnowledgeGraph } from '../../../memory/knowledge-graph.js';
import { PersonalityController } from '../../interfaces/controllers/personality.controller.js';
import { DecisionController } from '../../interfaces/controllers/decision.controller.js';
import { EmotionApplicationService } from '../../application/services/emotion.application.service.js';
import { createLogger } from '../../../services/logger.js';

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
  private personalityController?: PersonalityController;
  private decisionController?: DecisionController;
  private emotionService?: EmotionApplicationService;

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
    const decisionController = this.getDecisionController();

    return {
      reflectOnStep: async (step: TaskStep, context): Promise<ReflectionResult> => {
        // 使用 reflectOnTask 作为替代
        const reflection = await decisionController.reflectOnTask(
          context.taskId,
          step.description,
          step.result ?? ''
        );

        return {
          content:
            (reflection as any).failures?.length > 0
              ? `步骤反思: ${(reflection as any).failures.join('; ')}`
              : `步骤完成: ${step.description}`,
          corrections: (reflection as any).failures?.length ?? 0,
          improvements: ((reflection as any).improvements || []).map((i: any) => i.recommendation || i),
          overallRating: (reflection as any).overallRating ?? 0.5,
        };
      },
      reflectOnTask: async (task: Task): Promise<ReflectionResult> => {
        const reflection = await decisionController.reflectOnTask(
          task.id,
          task.userInput,
          task.result ?? ''
        );

        return {
          content:
            (reflection as any).successes?.length > 0
              ? `任务成功: ${(reflection as any).successes.join('; ')}`
              : `任务反思: ${(reflection as any).failures?.join('; ') || ''}`,
          corrections: (reflection as any).failures?.length ?? 0,
          improvements: ((reflection as any).improvements || []).map((i: any) => i.recommendation || i),
          overallRating: (reflection as any).overallRating ?? 0.5,
        };
      },
      generateImprovements: async (task: Task): Promise<string[]> => {
        const reflection = await decisionController.reflectOnTask(
          task.id,
          task.userInput,
          task.result ?? ''
        );
        return ((reflection as any).improvements || []).map((i: any) => i.recommendation || i);
      },
    };
  }

  /**
   * 创建学习引擎
   */
  createLearningEngine(): ILearningEngine {
    logger.debug('Creating LearningEngine adapter');
    const decisionController = this.getDecisionController();

    return {
      learnFromTask: async (task: Task, reflection: ReflectionResult): Promise<ExperienceEntry> => {
        const experience: any = {
          id: `exp-${task.id}`,
          timestamp: new Date().toISOString(),
          taskType: task.intent ?? 'general',
          taskDescription: task.userInput,
          decisions: [],
          lessons: reflection.improvements,
          improvements: reflection.improvements,
          patterns: [],
          emotionalTone: reflection.overallRating >= 0.8
            ? 'excited'
            : reflection.overallRating >= 0.5
              ? 'confident'
              : reflection.overallRating >= 0.3
                ? 'neutral'
                : 'cautious',
        };

        await decisionController.addExperience(experience);
        return experience;
      },
      storeExperience: async (experience: ExperienceEntry): Promise<void> => {
        await decisionController.addExperience(experience as any);
      },
      getBehaviorGuidelines: async (): Promise<string> => {
        // 从新的架构中获取行为指南
        return '';
      },
      loadExperiences: async (): Promise<void> => {
        await decisionController.loadExperiences();
      },
    };
  }

  /**
   * 创建状态管理器
   * @param taskId 任务ID
   */
  createStateManager(taskId: string): IStateManager {
    logger.debug({ taskId }, 'Creating StateManager');
    const { createStateMachine } = require('../state-machine.js');
    return createStateMachine(taskId);
  }

  /**
   * 创建信任检查器
   */
  createTrustChecker(): ITrustChecker {
    logger.debug('Creating TrustChecker adapter');
    const { detectIssues, generateTrustReport, askUserConfirmation } = require('../trust/trust.js');

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
        return cm
          .getContext()
          .map((m) => m.content)
          .join('\n');
      },
      addToolResult: async (toolName: string, result: string, success: boolean) => {
        await cm.addToolResult(toolName, result, success);
      },
      getContext: () => {
        return cm
          .getContext()
          .map((m) => m.content)
          .join('\n');
      },
      clearContext: () => {
        cm.clear();
      },
    };
  }

  // ============================================================
  // 单例访问器 - 使用新的 DDD 架构
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
   * 获取共享的人格控制器
   */
  getPersonalityController(): PersonalityController {
    if (!this.personalityController) {
      this.personalityController = new PersonalityController();
    }
    return this.personalityController;
  }

  /**
   * 获取共享的决策控制器
   */
  getDecisionController(): DecisionController {
    if (!this.decisionController) {
      this.decisionController = new DecisionController();
    }
    return this.decisionController;
  }

  /**
   * 获取共享的情绪服务
   */
  getEmotionService(): EmotionApplicationService {
    if (!this.emotionService) {
      this.emotionService = new EmotionApplicationService();
    }
    return this.emotionService;
  }

  /**
   * 获取共享的决策反思器（向后兼容）
   */
  getDecisionReflector(): any {
    return this.getDecisionController();
  }

  /**
   * 获取共享的经验存储（向后兼容）
   */
  getExperienceStore(): any {
    return this.getDecisionController();
  }

  /**
   * 获取共享的人格管理器（向后兼容）
   */
  getPersonalityManager(): any {
    return this.getPersonalityController();
  }

  /**
   * 获取共享的情绪状态管理器（向后兼容）
   */
  getEmotionalStateManager(): any {
    return this.getEmotionService();
  }

  // ============================================================
  // 初始化方法
  // ============================================================

  /**
   * 初始化所有共享服务
   */
  async initialize(): Promise<void> {
    logger.info('Initializing AgentServiceFactory (DDD Architecture)');

    // 初始化人格控制器
    try {
      await this.getPersonalityController().initialize();
    } catch (error) {
      logger.debug({ error }, 'Personality initialization failed (non-critical)');
    }

    // 初始化决策控制器
    try {
      await this.getDecisionController().initialize();
    } catch (error) {
      logger.debug({ error }, 'Decision controller initialization failed (non-critical)');
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
    this.personalityController = undefined;
    this.decisionController = undefined;
    this.emotionService = undefined;
  }
}

// ============================================================
// 默认工厂实例
// ============================================================

/**
 * 默认服务工厂实例
 */
export const agentServiceFactory = new AgentServiceFactory();
