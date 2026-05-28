/**
 * Agent Core - 主执行器
 *
 * 这是一个薄层协调器，负责整合各个子模块：
 * - types: 类型定义
 * - state-machine: 状态机管理
 * - tool-executor: 工具执行
 * - response-parser: 响应解析
 *
 * 使用新的 DDD 架构重构
 */

import { container } from '../di/container.js';
import { TOKENS } from '../di/tokens.js';
import type { MemoryManager } from '../memory/manager.js';
import { KnowledgeGraph } from '../memory/knowledge-graph.js';
import { reasonWithSelfCorrection } from './infrastructure/common/reasoner.js';
import { detectIssues, generateTrustReport, askUserConfirmation, TrustLevel, type TrustIssue } from './infrastructure/trust/trust.js';
import { ContextManager } from './infrastructure/common/context-manager.js';
import { ContextBuilder, type KnowledgeEntry } from './infrastructure/common/context-builder.js';
import { ChangeControlManager } from './infrastructure/change-control/index.js';
import { DirtyProtect, AutoCommitEngine, CheckpointManager } from '../git/index.js';
import { agentLogger } from '../services/logger.js';
import { projectConfigLoader } from '../config/project-config.js';
import { intentRecognizer } from './infrastructure/common/intent-recognizer.js';
import { planTask } from './infrastructure/common/task-planner.js';
import { generateSummary } from './infrastructure/common/agent-utils.js';
import { assessTaskComplexity, shouldUseDualAgent } from './infrastructure/common/task-complexity.js';
import { CollaborationManager } from './infrastructure/common/collaboration-manager.js';
import { DEFAULT_CONTEXT_TOKENS, TASK_TIMEOUT_MS } from '../constants/index.js';
import chalk from 'chalk';
import type { TaskStep, Task } from './types.js';
import type { CodeIndex } from '../analysis/indexer/types.js';

// ========== 导入新架构 (DDD) ==========
import { PersonalityController } from './interfaces/controllers/personality.controller.js';
import { DecisionController } from './interfaces/controllers/decision.controller.js';
import { EmotionService } from './domain/services/emotion.service.js';
import { ExperienceService } from './domain/services/experience.service.js';
import { PersonalityService } from './domain/services/personality.service.js';
import type { AgentIdentity } from './domain/models/personality.model.js';
import type { Experience } from './domain/models/experience.model.js';

// 导入核心子模块
import {
  ExecutionPhase,
  type ToolResult,
} from './infrastructure/core/types.js';

import { AgentStateMachine, createStateMachine } from './infrastructure/core/state-machine.js';
import { executeToolStep, executeReasoningStep } from './infrastructure/core/tool-executor.js';

// Re-export 类型（向后兼容）
export type { TaskStep, Task } from './types.js';

// Re-export 意图识别器（向后兼容）
export { intentRecognizer } from './infrastructure/common/intent-recognizer.js';
export { planTask } from './infrastructure/common/task-planner.js';
export { executeStep } from './infrastructure/core/tool-executor.js';

// Re-export 核心子模块类型
export {
  ExecutionPhase,
  type AgentConfig,
  type AgentState,
  type AgentContext,
  type ToolCall,
  type ToolResult,
} from './infrastructure/core/types.js';

export { AgentStateMachine, createStateMachine } from './infrastructure/core/state-machine.js';

/**
 * Agent 执行器 - 运行完整的 Agent 循环
 */
export class AgentExecutor {
  private task: Task;
  private onStepChange?: (step: TaskStep) => void;
  private onOutput?: (text: string) => void;
  private contextManager: ContextManager;
  private contextBuilder: ContextBuilder;
  private dirtyProtect: DirtyProtect;
  private autoCommit: AutoCommitEngine;
  private changeControl: ChangeControlManager;
  private knowledgeGraph: KnowledgeGraph;
  private repoMap?: string;
  private codeIndex?: CodeIndex;
  private changedFiles: string[] = [];
  private rootDir: string;
  private builtContext: string = '';

  // ========== 新架构 (DDD) ==========
  private personalityController: PersonalityController;
  private decisionController: DecisionController;
  private agentIdentity: AgentIdentity;
  private behaviorGuidelines: string = '';
  private stateMachine: AgentStateMachine;

  // ========== 双Agent模式 ==========
  private useDualAgent: boolean;
  private collaborationManager: CollaborationManager;

  constructor(
    userInput: string,
    onStepChange?: (step: TaskStep) => void,
    onOutput?: (text: string) => void,
    options?: {
      rootDir?: string;
      enableRepoMap?: boolean;
      enableKnowledgeGraph?: boolean;
      enableChangeControl?: boolean;
      useDualAgent?: boolean;
    }
  ) {
    this.task = {
      id: crypto.randomUUID(),
      userInput,
      steps: [],
      currentStep: 0,
      status: 'planning',
      startedAt: Date.now(),
    };
    this.onStepChange = onStepChange;
    this.onOutput = onOutput;
    this.rootDir = options?.rootDir || process.cwd();
    this.contextManager = new ContextManager(DEFAULT_CONTEXT_TOKENS);
    this.contextBuilder = new ContextBuilder();
    this.dirtyProtect = new DirtyProtect(this.rootDir);
    this.autoCommit = new AutoCommitEngine(this.rootDir);
    this.changeControl = new ChangeControlManager();
    this.knowledgeGraph = new KnowledgeGraph();

    // ========== 新架构初始化 ==========
    this.personalityController = new PersonalityController();
    this.decisionController = new DecisionController();
    this.agentIdentity = PersonalityService.createDefaultIdentity();
    this.stateMachine = createStateMachine(this.task.id);

    // ========== 双Agent模式初始化 ==========
    this.collaborationManager = new CollaborationManager();
    
    // 评估任务复杂度，决定是否使用双Agent模式
    const assessment = assessTaskComplexity(userInput);
    this.useDualAgent = shouldUseDualAgent(assessment, options?.useDualAgent);
    
    if (this.useDualAgent) {
      agentLogger.info(
        { taskId: this.task.id, assessment },
        'Using dual-agent collaboration mode'
      );
    }

    // ChangeControl 默认启用
    if (options?.enableChangeControl === false) {
      this.changeControl.setEnabled(false);
    }
  }

  async run(): Promise<Task> {
    agentLogger.info({ taskId: this.task.id, input: this.task.userInput }, 'Starting agent task');

    // 如果使用双Agent模式，直接使用CollaborationManager执行
    if (this.useDualAgent) {
      return this.runWithDualAgent();
    }

    // 初始化阶段
    this.stateMachine.transitionTo(ExecutionPhase.INITIALIZING);
    await this.initialize();

    try {
      // === 阶段 0: Git 检查点 ===
      await this.createGitCheckpoint();

      // === 阶段 1: 理解 ===
      this.stateMachine.transitionTo(ExecutionPhase.UNDERSTANDING);
      await this.understandTask();

      // === 阶段 2: 规划 ===
      this.stateMachine.transitionTo(ExecutionPhase.PLANNING);
      await this.planSteps();

      // === 阶段 3: 执行 ===
      this.stateMachine.transitionTo(ExecutionPhase.EXECUTING);
      const executionSuccess = await this.executeSteps();
      if (!executionSuccess) {
        return this.task;
      }

      // === 阶段 4: 验证 ===
      this.stateMachine.transitionTo(ExecutionPhase.VALIDATING);
      this.validateResults();

      // === 阶段 5: 反思 ===
      this.stateMachine.transitionTo(ExecutionPhase.REFLECTING);
      await this.reflectAndLearn();

      // 完成任务
      this.completeTask();
      this.stateMachine.transitionTo(ExecutionPhase.COMPLETED);

      return this.task;
    } catch (error) {
      return this.handleExecutionError(error);
    }
  }

  /**
   * 初始化：加载配置和经验
   */
  private async initialize(): Promise<void> {
    // 情绪衰减（使用新的 EmotionService）
    EmotionService.applyDecay();

    // 并行加载非关键系统
    const loaders = [
      this.loadPersonality(),
      this.decisionController.loadDecisions(),
      this.loadExperience()
    ];

    await Promise.allSettled(loaders);
  }

  private async loadPersonality(): Promise<void> {
    try {
      this.agentIdentity = await this.personalityController.loadIdentity();
      this.agentIdentity = PersonalityService.incrementInteractions(this.agentIdentity);
    } catch {
      // non-critical
    }
  }

  private async loadExperience(): Promise<void> {
    try {
      const experiences = await this.decisionController.loadExperiences();
      this.behaviorGuidelines = ExperienceService.generateBehaviorGuidelines(experiences);
      if (this.behaviorGuidelines) {
        agentLogger.info(
          { taskId: this.task.id, experienceCount: experiences.length },
          'Loaded experience-based behavior guidelines'
        );
      }
    } catch {
      this.behaviorGuidelines = '';
    }
  }

  /**
   * 创建 Git 检查点
   */
  private async createGitCheckpoint(): Promise<void> {
    try {
      const checkpoint = new CheckpointManager(this.rootDir);
      await checkpoint.create(`执行前自动检查点: ${this.task.userInput.substring(0, 50)}`);
      agentLogger.debug({ taskId: this.task.id }, 'Git checkpoint created');
    } catch (error) {
      agentLogger.debug(
        { taskId: this.task.id, error: error instanceof Error ? error.message : String(error) },
        'Git checkpoint skipped (not a git repo)'
      );
    }
  }

  /**
   * 理解任务阶段
   */
  private async understandTask(): Promise<void> {
    this.output(chalk.dim('[1/5] 理解任务...'));
    agentLogger.debug({ taskId: this.task.id }, 'Phase 1: Understanding task');

    const { intent } = intentRecognizer.recognizeSync(this.task.userInput);
    this.task.intent = intent;
    agentLogger.debug({ taskId: this.task.id, intent }, 'Intent recognized');

    // 构建上下文
    this.output(chalk.dim('  📊 构建代码库上下文...'));
    try {
      const contextResult = await this.contextBuilder.build({
        rootDir: this.rootDir,
        query: this.task.userInput,
        maxTokens: 6000,
        includeRepoMap: true,
        includeKnowledge: true,
        includeCodeSearch: true,
      });

      if (contextResult.repoMapIncluded) {
        this.output(chalk.dim(`  ✓ 代码结构图已生成 (${contextResult.codeEntryCount} 个符号)`));
      }

      if (contextResult.context) {
        this.builtContext = contextResult.context;
        this.output(
          chalk.dim(`  ✓ 知识图谱已查询 (${contextResult.knowledgeEntryCount} 个相关条目)`)
        );
      }
    } catch (error) {
      this.output(
        chalk.dim(`  ⚠ 上下文构建失败: ${error instanceof Error ? error.message : String(error)}`)
      );
    }
  }

  /**
   * 规划步骤阶段
   */
  private async planSteps(): Promise<void> {
    this.output(chalk.dim('[2/5] 规划步骤...'));
    agentLogger.debug({ taskId: this.task.id }, 'Phase 2: Planning steps');

    this.task.steps = await planTask(this.task.userInput, this.task.intent ?? 'general');
    this.task.status = 'executing';
    agentLogger.info({ taskId: this.task.id, stepCount: this.task.steps.length }, 'Task planned');

    // 展示计划
    this.output(chalk.bold('\n📋 任务计划:'));
    this.task.steps.forEach((step, i) => {
      this.output(
        `  ${i + 1}. ${step.description}${step.tool ? ` (${chalk.cyan(step.tool)})` : ''}`
      );
    });
    this.output('');
  }

  /**
   * 执行步骤阶段
   */
  private async executeSteps(): Promise<boolean> {
    this.output(chalk.dim('[3/5] 执行任务...'));
    agentLogger.debug({ taskId: this.task.id }, 'Phase 3: Executing steps');

    const context: Record<string, unknown> = {};
    const taskStartTime = Date.now();

    for (let i = 0; i < this.task.steps.length; i++) {
      // 检查超时
      if (Date.now() - taskStartTime > TASK_TIMEOUT_MS) {
        this.output(chalk.yellow(`⏱ 任务超时（${TASK_TIMEOUT_MS / 60000}分钟），强制停止`));
        this.task.status = 'timeout';
        this.task.result = `任务执行超时（${TASK_TIMEOUT_MS / 60000}分钟），可能是任务范围过大或LLM响应过慢`;
        this.stateMachine.transitionTo(ExecutionPhase.TIMEOUT);
        return false;
      }

      const step = this.task.steps[i];
      this.task.currentStep = i;
      step.status = 'running';
      this.onStepChange?.(step);

      try {
        const result = await this.executeStep(step, i, context);
        if (!result.success) {
          throw new Error(result.error || '步骤执行失败');
        }

        await this.handleStepSuccess(step, result);
        await this.performTrustCheck(step);
        step.status = 'done';
      } catch (error) {
        const success = await this.handleStepError(step, error, i);
        if (!success) return false;
      }

      this.onStepChange?.(step);
    }

    return true;
  }

  /**
   * 执行单个步骤
   */
  private async executeStep(
    step: TaskStep,
    stepIndex: number,
    context: Record<string, unknown>
  ): Promise<ToolResult> {
    // 反思步骤跳过
    if (step.description.includes('反思')) {
      return { success: true, output: '(反思步骤将在最后统一处理)' };
    }

    const commonOptions = {
      taskId: this.task.id,
      userInput: this.task.userInput,
      onOutput: this.output.bind(this),
      getContext: () => this.getContextWithBuiltContext(),
    };

    if (step.tool) {
      return executeToolStep(step, stepIndex, context, {
        ...commonOptions,
        intent: this.task.intent ?? 'general',
      });
    }

    return executeReasoningStep(step, stepIndex, {
      ...commonOptions,
      intent: this.task.intent,
    });
  }

  /**
   * 处理步骤成功
   */
  private async handleStepSuccess(step: TaskStep, result: ToolResult): Promise<void> {
    step.result = result.output;

    if (step.tool) {
      await this.contextManager.addToolResult(step.tool, step.result ?? '', true);

      if (step.tool === 'write_file' && step.args?.path) {
        this.changedFiles.push(String(step.args.path));
      }
    }
  }

  /**
   * 执行信任检查
   */
  private async performTrustCheck(step: TaskStep): Promise<void> {
    if (!step.result) return;

    const issues = detectIssues(step.result, {
      intent: this.task.intent,
      toolUsed: step.tool,
    });

    if (issues.length > 0) {
      const report = generateTrustReport(issues);
      if (report.requiresConfirmation) {
        this.output(chalk.yellow(`  ⚠ 信任检查: 发现 ${issues.length} 个问题`));
        this.output(chalk.gray(`    ${report.summary}`));
        const confirmed = await askUserConfirmation(report);
        if (!confirmed) {
          this.output(chalk.yellow(`  ⏭ 用户拒绝，跳过: ${step.description}`));
          step.status = 'skipped';
          return;
        }
        this.output(chalk.green(`  ✓ 用户确认通过`));
      } else {
        const autoExecuteIssues = issues.filter((issue: TrustIssue) => issue.level === TrustLevel.AutoExecute);
        if (autoExecuteIssues.length > 0) {
          this.output(
            chalk.dim(
              `  ℹ 信任提示: ${autoExecuteIssues.map((issue: TrustIssue) => issue.description).join(', ')}`
            )
          );
        }
      }
    }
  }

  /**
   * 处理步骤错误
   */
  private async handleStepError(
    step: TaskStep,
    error: unknown,
    stepIndex: number
  ): Promise<boolean> {
    step.status = 'error';
    step.error = error instanceof Error ? error.message : String(error);
    agentLogger.error(
      { taskId: this.task.id, step: stepIndex, error: step.error },
      'Step execution failed'
    );
    this.output(chalk.red(`  ✗ 失败: ${step.error}`));

    // 添加到上下文
    if (step.tool) {
      await this.contextManager.addToolResult(step.tool, step.error || '执行失败', false);
    }

    // 询问是否继续
    const shouldContinue = await this.askContinue();
    if (!shouldContinue) {
      this.task.status = 'failed';
      this.stateMachine.transitionTo(ExecutionPhase.FAILED);
      return false;
    }

    step.status = 'skipped';
    return true;
  }

  /**
   * 验证结果阶段
   */
  private validateResults(): void {
    this.output(chalk.dim('[4/5] 验证结果...'));
    agentLogger.debug({ taskId: this.task.id }, 'Phase 4: Validating results');

    this.task.result = this.task.steps
      .filter((s) => s.status === 'done' && s.result)
      .map((s) => s.result!)
      .join('\n\n');
  }

  /**
   * 反思和学习阶段
   */
  private async reflectAndLearn(): Promise<void> {
    this.output(chalk.dim('[5/5] 反思总结...'));
    agentLogger.debug({ taskId: this.task.id }, 'Phase 5: Reflection');

    // 执行反思步骤
    const reflectStep = this.task.steps.find((s) => s.description.includes('反思'));
    if (reflectStep) {
      reflectStep.status = 'running';
      this.output(chalk.dim(`  🧠 AI 反思中（带自校正推理）...`));

      const { content: reflection, corrections } = await reasonWithSelfCorrection(
        this.task.userInput,
        '反思执行过程，总结经验教训，评估完成度，提出改进建议',
        await this.getContextWithBuiltContext(),
        [],
        2
      );

      if (corrections > 0) {
        agentLogger.info({ taskId: this.task.id, corrections }, 'Reflection self-corrected');
      }

      reflectStep.result = reflection;
      reflectStep.status = 'done';
      this.output(chalk.green('  ✓ 反思完成'));
    }

    // 任务级反思和经验学习
    await this.performTaskReflection();
  }

  /**
   * 执行任务级反思
   */
  private async performTaskReflection(): Promise<void> {
    try {
      const executionSummary = this.task.steps
        .filter((s) => s.status === 'done' && s.result)
        .map((s) => `[${s.description}]: ${s.result?.substring(0, 200) ?? ''}`)
        .join('\n');

      const taskReflection = await this.decisionController.reflectOnTask(
        this.task.id,
        this.task.userInput,
        executionSummary
      );

      if (taskReflection.improvements.length > 0) {
        agentLogger.info(
          { taskId: this.task.id, improvementCount: taskReflection.improvements.length },
          'Task reflection generated improvement suggestions'
        );
        this.output(chalk.dim(`  💡 反思发现 ${taskReflection.improvements.length} 个改进建议:`));
        for (const improvement of taskReflection.improvements) {
          this.output(chalk.dim(`    - [${improvement.priority}] ${improvement.description}`));
        }
      }

      // 学习循环
      await this.learnFromExperience(taskReflection);
    } catch (error) {
      agentLogger.warn(
        { taskId: this.task.id, error: error instanceof Error ? error.message : String(error) },
        'DecisionReflector reflection failed (non-critical)'
      );
    }
  }

  /**
   * 从经验中学习
   */
  private async learnFromExperience(taskReflection: {
    improvements: Array<{ recommendation: string }>;
    failures: string[];
    successes: string[];
    overallRating: number;
  }): Promise<void> {
    try {
      const improvementReport = await this.decisionController.generateImprovementReport();
      if (improvementReport) {
        agentLogger.info({ report: improvementReport }, '改进报告已生成');
      }

      const lessons = await this.decisionController.learnFromExperience(this.task.id);
      const taskDecisions = await this.decisionController.getDecisionsByTask(this.task.id);

      const experienceDecisions = taskDecisions.map((d) => ({
        context: d.description,
        chosen: d.chosenAlternative,
        outcome: (d.outcome?.success ? 'success' : !d.outcome ? 'partial' : 'failure') as
          | 'success'
          | 'failure'
          | 'partial',
        confidence: d.confidence,
        reasoning: d.rationale,
      }));

      // 使用 performTaskReflection 中已获取的 taskReflection
      // 避免重复调用 reflectOnTask
      const improvements = taskReflection.improvements.map((i) => i.recommendation);
      const patterns: string[] = [];
      if (taskReflection.failures.length > 0) {
        patterns.push(...taskReflection.failures.map((f) => f.replace(/^失败:\s*/, '')));
      }
      if (taskReflection.successes.length > 0) {
        patterns.push(...taskReflection.successes.map((s) => s.replace(/^成功:\s*/, '')));
      }

      const hasFailures = this.task.steps.some(
        (s) => s.status === 'error' || s.status === 'skipped'
      );
      const allSuccess = this.task.steps.every((s) => s.status === 'done');
      const errorCount = this.task.steps.filter((s) => s.status === 'error').length;

      let emotionalTone: Experience['emotionalTone'] = 'neutral';
      if (allSuccess && taskReflection.overallRating >= 0.8) emotionalTone = 'excited';
      else if (allSuccess) emotionalTone = 'confident';
      else if (errorCount > 0) emotionalTone = 'frustrated';
      else if (hasFailures) emotionalTone = 'cautious';

      const experience: Experience = {
        id: `exp-${this.task.id}`,
        timestamp: new Date().toISOString(),
        taskType: this.inferTaskType(this.task.userInput, this.task.intent),
        taskDescription: this.task.userInput,
        decisions: experienceDecisions,
        lessons,
        improvements,
        patterns,
        emotionalTone,
      };

      await this.decisionController.addExperience(experience);

      agentLogger.info(
        {
          taskId: this.task.id,
          experienceId: experience.id,
          lessonCount: lessons.length,
          improvementCount: improvements.length,
          emotionalTone,
        },
        'Experience stored for future learning'
      );
    } catch (error) {
      agentLogger.warn(
        { taskId: this.task.id, error: error instanceof Error ? error.message : String(error) },
        'Experience storage failed (non-critical)'
      );
    }
  }

  /**
   * 完成任务
   */
  private async completeTask(): Promise<void> {
    const summary = generateSummary(this.task);
    this.output(chalk.bold('\n📊 执行总结:'));
    this.output(summary);

    this.task.status = 'completed';
    this.task.completedAt = Date.now();
    agentLogger.info(
      { taskId: this.task.id, duration: this.task.completedAt - this.task.startedAt },
      'Task completed'
    );

    // 更新情绪状态
    EmotionService.onTaskSuccess(this.task.userInput);

    // 保存到记忆
    await this.saveToMemory(summary);

    // Git 自动提交
    if (this.changedFiles.length > 0) {
      try {
        const result = await this.autoCommit.autoCommit(this.changedFiles, this.task.userInput);
        if (result.success) {
          this.output(chalk.dim(`  📝 ${result.message}`));
        }
      } catch (error) {
        agentLogger.debug(
          { taskId: this.task.id, error: error instanceof Error ? error.message : String(error) },
          'Git auto-commit failed (non-critical)'
        );
      }
    }

    // 保存状态
    await this.decisionController.saveDecisions();
    await this.personalityController.saveIdentity(this.agentIdentity);
  }

  /**
   * 处理执行错误
   */
  private handleExecutionError(error: unknown): Task {
    const errorMessage = error instanceof Error ? error.message : String(error);

    if (error instanceof Error && error.message.includes('timeout')) {
      this.output(chalk.red(`⏱ 任务超时: ${errorMessage}`));
      this.task.status = 'timeout';
      this.task.result = errorMessage;
      this.stateMachine.transitionTo(ExecutionPhase.TIMEOUT);
    } else {
      this.task.status = 'failed';
      this.task.result = errorMessage;
      this.stateMachine.transitionTo(ExecutionPhase.FAILED);
    }

    agentLogger.error({ taskId: this.task.id, error: this.task.result }, 'Task failed');

    // 更新情绪状态
    EmotionService.onTaskFailure(this.task.result || '未知错误');

    // 即使失败也保存已记录的决策
    this.decisionController.saveDecisions().catch((error) => {
      agentLogger.warn(
        { taskId: this.task.id, error: error instanceof Error ? error.message : String(error) },
        'Failed to save decisions'
      );
    });

    return this.task;
  }

  /**
   * 输出文本
   */
  private output(text: string): void {
    console.log(text);
    this.onOutput?.(text);
  }

  /**
   * 推断任务类型
   */
  private inferTaskType(userInput: string, intent?: string): string {
    const input = userInput.toLowerCase();

    if (/bug|fix|修复|错误|报错|异常|error|fail|crash/.test(input)) return 'bug-fix';
    if (/refactor|重构|优化|整理|clean|improve/.test(input)) return 'refactor';
    if (/feature|功能|新增|添加|实现|create|add|implement/.test(input)) return 'feature';
    if (/test|测试|单元|e2e|spec/.test(input)) return 'testing';
    if (/review|审查|检查|check/.test(input)) return 'review';
    if (/doc|文档|readme|comment/.test(input)) return 'documentation';
    if (/deploy|部署|发布|release|build/.test(input)) return 'deployment';

    if (intent) {
      return intent.replace(/-/g, '_');
    }

    return 'general';
  }

  /**
   * 获取包含项目上下文和行为指导的 previousResults
   */
  private async getContextWithBuiltContext(): Promise<string[]> {
    const previousContext = this.contextManager.getContext().map((m) => {
      if (typeof m.content === 'string') return m.content;
      if (Array.isArray(m.content)) {
        return m.content
          .map((c) => {
            if (typeof c === 'string') return c;
            if (
              typeof c === 'object' &&
              c !== null &&
              'text' in c &&
              typeof (c as { text: unknown }).text === 'string'
            ) {
              return (c as { text: string }).text;
            }
            return '';
          })
          .join('');
      }
      return String(m.content);
    });

    const parts: string[] = [];

    // 注入人格描述
    const personalityPrompt = PersonalityService.getPersonalityPrompt(this.agentIdentity);
    if (personalityPrompt) {
      parts.push(`[Agent 人格]\n${personalityPrompt}`);
    }

    // 注入情绪状态
    const emotionalContext = EmotionService.getEmotionalContext();
    if (emotionalContext) {
      parts.push(emotionalContext);
    }

    // 注入行为指导
    if (this.behaviorGuidelines) {
      const experienceCount = await this.decisionController.getExperienceCount();
      parts.push(
        `[行为指导（基于${experienceCount}次历史经验自动生成）]\n${this.behaviorGuidelines}`
      );
    }

    // 注入项目配置指令
    try {
      const projectInstructions = await projectConfigLoader.getProjectInstructions(this.rootDir);
      if (projectInstructions) {
        parts.push(projectInstructions);
      }
    } catch (error) {
      agentLogger.debug(
        { error: error instanceof Error ? error.message : String(error) },
        'Project config loading failed (non-critical)'
      );
    }

    if (this.builtContext) {
      parts.push(`[项目上下文]\n${this.builtContext}`);
    }

    return [...parts, ...previousContext];
  }

  /**
   * 询问是否继续
   */
  private async askContinue(): Promise<boolean> {
    if (!process.stdin.isTTY) {
      if (process.env.DEVFLOW_CONTINUE_ON_ERROR === 'true') return true;
      this.output(
        chalk.yellow(
          '  非交互环境，步骤失败将中止任务（设置 DEVFLOW_CONTINUE_ON_ERROR=true 可继续）'
        )
      );
      return false;
    }
    try {
      const inquirer = await import('inquirer');
      const { continue: result } = await inquirer.default.prompt([
        {
          type: 'confirm',
          name: 'continue',
          message: '步骤失败，是否继续执行后续步骤？',
          default: false,
        },
      ]);
      return result;
    } catch (error) {
      agentLogger.debug(
        { error: error instanceof Error ? error.message : String(error) },
        'Failed to load inquirer module'
      );
      this.output(chalk.yellow('  无法加载交互模块，默认中止任务'));
      return false;
    }
  }

  /**
   * 保存到记忆
   */
  private async saveToMemory(summary: string): Promise<void> {
    try {
      const memoryManager = container.resolve<MemoryManager>(TOKENS.MemoryManager);
      await memoryManager.rememberChat({
        input: this.task.userInput,
        output: summary,
        provider: 'agent',
        model: 'core-loop',
        taskId: this.task.id,
        tags: ['agent', this.task.intent || 'chat'],
      });

      try {
        await this.knowledgeGraph.init();
        const records = await memoryManager.loadAllRecords();
        const recentRecords = records.slice(0, 5);
        await this.knowledgeGraph.extractFromMemory(recentRecords);
      } catch (error) {
        agentLogger.debug(
          { taskId: this.task.id, error: error instanceof Error ? error.message : String(error) },
          'Knowledge graph extraction failed (optional)'
        );
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      agentLogger.warn({ taskId: this.task.id, error: errorMsg }, 'Failed to save to memory');
    }
  }

  /**
   * Query the knowledge graph for relevant context.
   */
  async queryKnowledgeGraph(query: string): Promise<KnowledgeEntry[]> {
    try {
      return await this.contextBuilder.queryKnowledgeGraph(query);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      agentLogger.warn(
        { taskId: this.task.id, query, error: errorMsg },
        'Knowledge graph query failed'
      );
      return [];
    }
  }

  /**
   * Get the current repo map if available.
   */
  getRepoMap(): string | undefined {
    return this.repoMap;
  }

  /**
   * Get the change control manager for monitoring file changes.
   */
  getChangeControl(): ChangeControlManager {
    return this.changeControl;
  }

  /**
   * Execute a protected file operation with change control.
   */
  async executeProtected(
    action: 'create' | 'modify' | 'delete' | 'read' | 'shell',
    target: string,
    executeFn: () => Promise<unknown>
  ): Promise<{ success: boolean; result?: unknown }> {
    return this.changeControl.executeProtectedChange(action, target, executeFn);
  }

  getTask(): Task {
    return this.task;
  }

  /**
   * 获取当前状态机
   */
  getStateMachine(): AgentStateMachine {
    return this.stateMachine;
  }

  /**
   * 使用双Agent协作模式执行任务
   */
  private async runWithDualAgent(): Promise<Task> {
    this.output(chalk.cyan('🤖 启用双Agent协作模式...'));

    try {
      // 评估任务并获取推荐意图
      const assessment = assessTaskComplexity(this.task.userInput);
      const intent = assessment.recommendedIntent || 'general';
      
      this.output(chalk.dim(`  任务复杂度评分: ${assessment.score}/100`));
      this.output(chalk.dim(`  推荐意图: ${intent}`));

      // 使用CollaborationManager执行
      const result = await this.collaborationManager.startCollaboration(
        this.task.userInput,
        intent,
        {
          maxDepth: 3,
          maxSubtasks: 10,
          onStatusUpdate: (taskId: string, status: string, progress?: number) => {
            this.output(chalk.dim(`  [${status}] ${progress !== undefined ? `${progress}%` : ''}`));
          },
        }
      );

      // 转换结果为Task格式
      this.task.status = result.success ? 'completed' : 'failed';
      this.task.result = result.summary || '';
      
      if (result.success) {
        this.output(chalk.green('\n✓ 双Agent协作任务完成!'));
        if (result.summary) {
          this.output(chalk.dim(`\n${result.summary}`));
        }
        this.stateMachine.transitionTo(ExecutionPhase.COMPLETED);
      } else {
        this.output(chalk.red('\n✗ 双Agent协作任务失败'));
        this.stateMachine.transitionTo(ExecutionPhase.FAILED);
      }

      return this.task;
    } catch (error) {
      agentLogger.error(
        { taskId: this.task.id, error: error instanceof Error ? error.message : String(error) },
        'Dual-agent collaboration failed, falling back to single-agent'
      );
      
      // 双Agent失败时，回退到单Agent模式
      this.output(chalk.yellow('双Agent模式失败，回退到单Agent模式...'));
      this.useDualAgent = false;
      
      // 重新执行单Agent流程
      this.stateMachine.transitionTo(ExecutionPhase.INITIALIZING);
      await this.initialize();
      
      await this.createGitCheckpoint();
      this.stateMachine.transitionTo(ExecutionPhase.UNDERSTANDING);
      await this.understandTask();
      this.stateMachine.transitionTo(ExecutionPhase.PLANNING);
      await this.planSteps();
      this.stateMachine.transitionTo(ExecutionPhase.EXECUTING);
      const executionSuccess = await this.executeSteps();
      
      if (executionSuccess) {
        this.stateMachine.transitionTo(ExecutionPhase.VALIDATING);
        this.validateResults();
        this.stateMachine.transitionTo(ExecutionPhase.REFLECTING);
        await this.reflectAndLearn();
        this.completeTask();
        this.stateMachine.transitionTo(ExecutionPhase.COMPLETED);
      } else {
        this.stateMachine.transitionTo(ExecutionPhase.FAILED);
      }
      
      return this.task;
    }
  }
}

/**
 * 快捷函数 - 执行一个用户任务
 */
export async function runAgentTask(
  userInput: string,
  onStepChange?: (step: TaskStep) => void,
  onOutput?: (text: string) => void
): Promise<Task> {
  const executor = new AgentExecutor(userInput, onStepChange, onOutput);
  return executor.run();
}
