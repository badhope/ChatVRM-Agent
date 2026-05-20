/**
 * DevFlow Agent SDK - Agent Module
 *
 * Provides programmatic access to the DevFlow Agent for running
 * AI-powered development tasks.
 */

import type {
  AgentOptions,
  AgentResult,
  AgentStep,
  ActModeConfig,
  ContextBuilderOptions,
  ContextBuildResult,
  KnowledgeEntry,
} from './types.js';
import { DevFlowError, formatError } from './errors.js';

/**
 * Plan result from plan mode.
 * This type mirrors the backend PlanResult with SDK-friendly types.
 */
export interface PlanResult {
  /** Task description */
  taskDescription: string;
  /** Recognized intent */
  intent: string;
  /** Planned steps */
  steps: AgentStep[];
  /** AI-generated detailed plan */
  detailedPlan: string;
  /** Files that need modification */
  filesToModify: string[];
  /** Potential risks */
  risks: string[];
  /** Estimated number of steps */
  estimatedSteps: number;
  /** Context information */
  context?: {
    repoMapIncluded: boolean;
    codeSearchIncluded: boolean;
    knowledgeIncluded: boolean;
    codeEntryCount: number;
    knowledgeEntryCount: number;
  };
}

/**
 * Act result from act mode execution.
 */
export interface ActResult {
  /** Results of individual steps */
  stepResults: ActStepResult[];
  /** Total execution duration in milliseconds */
  durationMs: number;
  /** Whether all steps succeeded */
  allSuccess: boolean;
  /** Summary text */
  summary: string;
  /** Change control statistics */
  changeControlStats?: {
    total: number;
    byRisk: Record<string, number>;
  };
}

/**
 * Result of a single act step.
 */
export interface ActStepResult {
  /** The step that was executed */
  step: AgentStep;
  /** Whether the step succeeded */
  success: boolean;
  /** Error message (if failed) */
  error?: string;
  /** Step duration in milliseconds */
  durationMs: number;
}

/**
 * DevFlowAgent - Main agent class for executing development tasks.
 *
 * @example
 * ```typescript
 * const agent = new DevFlowAgent({ model: 'claude-3-5-sonnet' });
 * agent.on('step', (step) => console.log(step));
 * const result = await agent.run('Add error handling to the auth module');
 * ```
 */
export class DevFlowAgent {
  private options: AgentOptions;
  private stepHandlers: Map<string, Set<Function>> = new Map();

  /**
   * Create a new DevFlowAgent instance.
   *
   * @param options - Configuration options for the agent
   */
  constructor(options?: AgentOptions) {
    this.options = {
      model: 'claude-3-5-sonnet',
      temperature: 0.3,
      maxTokens: 2048,
      planFirst: true,
      autoCheckpoint: true,
      ...options,
    };
  }

  /**
   * Run the agent on a task.
   *
   * This executes the full agent loop: understanding, planning,
   * executing, verifying, and reflecting.
   *
   * @param input - The task description or user input
   * @returns The execution result
   */
  async run(input: string): Promise<AgentResult> {
    const startTime = Date.now();
    const steps: AgentStep[] = [];
    const changedFiles: string[] = [];

    try {
      // Dynamic import of core module
      const { AgentExecutor } = await import('../../dist/agent/core.js');

      const onStepChange = (step: any): void => {
        steps[step.id] = step;
        this.options.onStep?.(step);
        this.emit('step', step);
      };

      const onOutput = (text: string): void => {
        this.options.onOutput?.(text);
        this.emit('output', text);
      };

      const executor = new AgentExecutor(input, onStepChange, onOutput);
      const task = await executor.run();

      const duration = Date.now() - startTime;

      return {
        success: task.status === 'completed',
        output: task.result || '',
        steps: task.steps,
        changedFiles: this.extractChangedFiles(task.steps),
        duration,
        taskId: task.id,
        intent: task.intent,
      };
    } catch (error) {
      const duration = Date.now() - startTime;

      // Handle DevFlowError and re-throw with proper error handling
      if (error instanceof DevFlowError) {
        throw error;
      }

      // Wrap unknown errors
      const formatted = formatError(error);
      throw new DevFlowError(formatted.message, formatted.code, 500, formatted.details);
    }
  }

  /**
   * Plan a task without executing it (Plan Mode).
   *
   * This runs the agent in read-only mode, generating a detailed
   * execution plan that can be reviewed before execution.
   *
   * @param input - The task description
   * @param options - Optional plan configuration
   * @returns The generated plan
   *
   * @example
   * ```typescript
   * const plan = await agent.plan('Add user authentication');
   * console.log('Planned steps:', plan.steps.length);
   * console.log('Files to modify:', plan.filesToModify);
   * ```
   */
  async plan(input: string, options?: { rootDir?: string }): Promise<PlanResult> {
    try {
      const { runPlanMode } = await import('../../dist/agent/plan-mode.js');

      const onOutput = (text: string): void => {
        this.options.onOutput?.(text);
        this.emit('output', text);
      };

      const result = await runPlanMode(
        input,
        {
          model: this.options.model,
          temperature: this.options.temperature,
          maxTokens: this.options.maxTokens,
        },
        onOutput,
        options?.rootDir
      );

      return {
        taskDescription: result.taskDescription,
        intent: result.intent,
        steps: result.steps.map((s, i) => this.convertStep(s, i)),
        detailedPlan: result.detailedPlan,
        filesToModify: result.filesToModify,
        risks: result.risks,
        estimatedSteps: result.estimatedSteps,
        context: result.context,
      };
    } catch (error) {
      if (error instanceof DevFlowError) {
        throw error;
      }
      const formatted = formatError(error);
      throw new DevFlowError(formatted.message, formatted.code, 500, formatted.details);
    }
  }

  /**
   * Execute a pre-generated plan (Act Mode).
   *
   * @param plan - The plan to execute (from plan() method)
   * @param options - Optional execution configuration
   * @returns The execution result
   *
   * @example
   * ```typescript
   * const plan = await agent.plan('Add user authentication');
   * // Review plan...
   * const result = await agent.execute(plan);
   * console.log('Changed files:', result.changedFiles);
   * ```
   */
  async execute(plan: PlanResult, options?: ActModeConfig): Promise<ActResult> {
    try {
      const { runActMode } = await import('../../dist/agent/act-mode.js');

      const onOutput = (text: string): void => {
        this.options.onOutput?.(text);
        this.emit('output', text);
      };

      const backendPlan = {
        taskDescription: plan.taskDescription,
        intent: plan.intent,
        steps: plan.steps.map(s => ({
          id: s.id,
          description: s.description,
          tool: s.tool,
          args: s.args,
          status: s.status,
          result: s.result,
          error: s.error,
        })),
        filesToModify: plan.filesToModify,
        risks: plan.risks,
        estimatedSteps: plan.estimatedSteps,
        context: plan.context,
        detailedPlan: plan.detailedPlan,
      };

      const result = await runActMode(
        backendPlan,
        plan.taskDescription,
        {
          llm: {
            model: options?.model ?? this.options.model,
            temperature: options?.temperature ?? this.options.temperature,
            maxTokens: options?.maxTokens ?? this.options.maxTokens,
          },
          autoApprove: options?.autoApprove,
          dryRun: options?.dryRun,
          rootDir: options?.rootDir,
          enableChangeControl: options?.enableChangeControl,
        },
        onOutput
      );

      return {
        stepResults: result.stepResults.map(sr => ({
          step: this.convertStep(sr.step, sr.step.id || 0),
          success: sr.success,
          error: sr.error,
          durationMs: sr.durationMs,
        })),
        durationMs: result.durationMs,
        allSuccess: result.allSuccess,
        summary: result.summary,
        changeControlStats: result.changeControlStats,
      };
    } catch (error) {
      if (error instanceof DevFlowError) {
        throw error;
      }
      const formatted = formatError(error);
      throw new DevFlowError(formatted.message, formatted.code, 500, formatted.details);
    }
  }

  /**
   * Access the context builder for building code context.
   *
   * @returns The context builder instance
   *
   * @example
   * ```typescript
   * const result = await agent.contextBuilder.build({
   *   rootDir: './src',
   *   query: 'authentication',
   *   includeRepoMap: true,
   *   includeKnowledge: true
   * });
   * console.log('Context:', result.context);
   * ```
   */
  get contextBuilder(): ContextBuilderWrapper {
    return new ContextBuilderWrapper(this.options.onOutput);
  }

  /**
   * Set the LLM model to use.
   *
   * @param model - Model identifier (e.g., 'claude-3-5-sonnet')
   */
  setModel(model: string): void {
    this.options.model = model;
  }

  /**
   * Set the generation temperature.
   *
   * @param temp - Temperature value (0-1)
   */
  setTemperature(temp: number): void {
    this.options.temperature = temp;
  }

  /**
   * Register an event handler.
   *
   * @param event - Event name ('step', 'output', 'error')
   * @param handler - Handler function
   */
  on(event: 'step' | 'output' | 'error', handler: Function): void {
    if (!this.stepHandlers.has(event)) {
      this.stepHandlers.set(event, new Set());
    }
    this.stepHandlers.get(event)!.add(handler);
  }

  /**
   * Remove an event handler.
   *
   * @param event - Event name
   * @param handler - Handler to remove
   */
  off(event: string, handler: Function): void {
    this.stepHandlers.get(event)?.delete(handler);
  }

  /**
   * Get current options.
   */
  getOptions(): Readonly<AgentOptions> {
    return { ...this.options };
  }

  private emit(event: string, data: any): void {
    this.stepHandlers.get(event)?.forEach(handler => {
      try {
        handler(data);
      } catch (e) {
        console.error(`Error in ${event} handler:`, e);
      }
    });
  }

  private extractChangedFiles(steps: any[]): string[] {
    const files: string[] = [];
    for (const step of steps) {
      if (step.tool === 'write_file' && step.args?.path) {
        files.push(String(step.args.path));
      }
    }
    return files;
  }

  private convertStep(step: any, id: number): AgentStep {
    return {
      id: step.id ?? id,
      description: step.description || '',
      tool: step.tool,
      args: step.args,
      status: step.status || 'pending',
      result: step.result,
      error: step.error,
    };
  }
}

/**
 * ContextBuilderWrapper - SDK wrapper for the backend ContextBuilder.
 *
 * Provides a clean interface for building code context from:
 * - Repo Map: Codebase structure overview
 * - Code Index: Searchable symbol index
 * - Knowledge Graph: Prior context from memory
 */
export class ContextBuilderWrapper {
  private onOutput?: (text: string) => void;

  constructor(onOutput?: (text: string) => void) {
    this.onOutput = onOutput;
  }

  /**
   * Build a comprehensive context for the agent.
   *
   * @param options - Build options
   * @returns Assembled context result
   *
   * @example
   * ```typescript
   * const result = await contextBuilder.build({
   *   rootDir: './src',
   *   query: 'authentication logic',
   *   maxTokens: 8000,
   *   includeRepoMap: true,
   *   includeKnowledge: true,
   *   includeCodeSearch: true
   * });
   * ```
   */
  async build(options: ContextBuilderOptions): Promise<ContextBuildResult> {
    try {
      const { ContextBuilder } = await import('../../dist/agent/context-builder.js');

      const builder = new ContextBuilder();
      const result = await builder.build({
        rootDir: options.rootDir,
        query: options.query,
        maxTokens: options.maxTokens,
        includeKnowledge: options.includeKnowledge,
        includeRepoMap: options.includeRepoMap,
        includeCodeSearch: options.includeCodeSearch,
      });

      return {
        context: result.context,
        repoMapIncluded: result.repoMapIncluded,
        codeSearchIncluded: result.codeSearchIncluded,
        knowledgeIncluded: result.knowledgeIncluded,
        codeEntryCount: result.codeEntryCount,
        knowledgeEntryCount: result.knowledgeEntryCount,
      };
    } catch (error) {
      if (error instanceof DevFlowError) {
        throw error;
      }
      const formatted = formatError(error);
      throw new DevFlowError(formatted.message, formatted.code, 500, formatted.details);
    }
  }

  /**
   * Query the knowledge graph for relevant entries.
   *
   * @param query - Search query
   * @returns Matching knowledge entries
   *
   * @example
   * ```typescript
   * const entries = await contextBuilder.queryKnowledge('React hooks');
   * entries.forEach(e => console.log(`[${e.type}] ${e.label}`));
   * ```
   */
  async queryKnowledge(query: string): Promise<KnowledgeEntry[]> {
    try {
      const { ContextBuilder } = await import('../../dist/agent/context-builder.js');

      const builder = new ContextBuilder();
      return await builder.queryKnowledgeGraph(query);
    } catch (error) {
      if (error instanceof DevFlowError) {
        throw error;
      }
      const formatted = formatError(error);
      throw new DevFlowError(formatted.message, formatted.code, 500, formatted.details);
    }
  }

  /**
   * Clear cached data (repo map, code index).
   */
  clearCache(): void {
    // Note: The underlying builder doesn't expose clearCache publicly
    // This is a placeholder for future implementation
  }
}

/**
 * Convenience function to run an agent task.
 *
 * @param input - The task description
 * @param options - Optional agent configuration
 * @returns The execution result
 *
 * @example
 * ```typescript
 * const result = await runAgent('Refactor the database module');
 * console.log(result.output);
 * ```
 */
export async function runAgent(input: string, options?: AgentOptions): Promise<AgentResult> {
  const agent = new DevFlowAgent(options);
  return agent.run(input);
}

/**
 * Convenience function to plan a task without executing.
 *
 * @param input - The task description
 * @param options - Optional agent configuration
 * @returns The generated plan
 *
 * @example
 * ```typescript
 * const plan = await planTask('Add user authentication');
 * console.log('Steps:', plan.steps.length);
 * ```
 */
export async function planTask(input: string, options?: AgentOptions & { rootDir?: string }): Promise<PlanResult> {
  const agent = new DevFlowAgent(options);
  return agent.plan(input, { rootDir: options?.rootDir });
}

/**
 * Convenience function to execute a pre-generated plan.
 *
 * @param plan - The plan to execute
 * @param options - Optional execution configuration
 * @returns The execution result
 *
 * @example
 * ```typescript
 * const plan = await planTask('Add user authentication');
 * const result = await executePlan(plan, { autoApprove: true });
 * ```
 */
export async function executePlan(plan: PlanResult, options?: ActModeConfig): Promise<ActResult> {
  const agent = new DevFlowAgent();
  return agent.execute(plan, options);
}
