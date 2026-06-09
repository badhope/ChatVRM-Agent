/**
 * Personal Assistant Agent SDK - Agent Module
 *
 * Provides programmatic access to the Personal Assistant Agent for running
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
import { PersonalAssistantError, formatError } from './errors.js';

/**
 * Plan result from plan mode.
 */
export interface PlanResult {
  taskDescription: string;
  intent: string;
  steps: AgentStep[];
  detailedPlan: string;
  filesToModify: string[];
  risks: string[];
  estimatedSteps: number;
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
  stepResults: ActStepResult[];
  durationMs: number;
  allSuccess: boolean;
  summary: string;
  changeControlStats?: {
    total: number;
    byRisk: Record<string, number>;
  };
}

export interface ActStepResult {
  step: AgentStep;
  success: boolean;
  error?: string;
  durationMs: number;
}

/**
 * PersonalAssistantAgent - Main agent class for executing development tasks.
 *
 * @example
 * ```typescript
 * const agent = new PersonalAssistantAgent({ model: 'claude-3-5-sonnet' });
 * agent.on('step', (step) => console.log(step));
 * const result = await agent.run('Add error handling to the auth module');
 * ```
 */
export class PersonalAssistantAgent {
  private options: AgentOptions;
  private stepHandlers: Map<string, Set<Function>> = new Map();

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
   */
  async run(input: string): Promise<AgentResult> {
    const startTime = Date.now();
    const steps: AgentStep[] = [];

    try {
      // Import the main package's CLI entry point which wires up the pipeline
      const { runAgent: coreRunAgent } = await import('@personal-assistant/agent');

      const onStepChange = (step: AgentStep): void => {
        steps[step.id] = step;
        this.options.onStep?.(step);
        this.emit('step', step);
      };

      const onOutput = (text: string): void => {
        this.options.onOutput?.(text);
        this.emit('output', text);
      };

      const result = await coreRunAgent(input, {
        model: this.options.model,
        temperature: this.options.temperature,
        maxTokens: this.options.maxTokens,
        onStep: onStepChange,
        onOutput,
      });

      const duration = Date.now() - startTime;

      return {
        success: result.success,
        output: result.output || '',
        steps: result.steps || steps,
        changedFiles: this.extractChangedFiles(result.steps || steps),
        duration,
        taskId: result.taskId,
        intent: result.intent,
      };
    } catch (error) {
      const duration = Date.now() - startTime;

      if (error instanceof PersonalAssistantError) {
        throw error;
      }

      const formatted = formatError(error);
      throw new PersonalAssistantError(formatted.message, formatted.code, 500, formatted.details);
    }
  }

  /**
   * Plan a task without executing it (Plan Mode).
   */
  async plan(input: string, _options?: { rootDir?: string }): Promise<PlanResult> {
    const startTime = Date.now();

    try {
      // Run the agent in plan-only mode through the main package
      const { runAgent: coreRunAgent } = await import('@personal-assistant/agent');

      const result = await coreRunAgent(input, {
        model: this.options.model,
        temperature: this.options.temperature,
        maxTokens: this.options.maxTokens,
        planOnly: true,
      });

      const duration = Date.now() - startTime;

      return {
        taskDescription: input,
        intent: result.intent || '',
        steps: result.steps || [],
        detailedPlan: result.output || '',
        filesToModify: result.changedFiles || [],
        risks: [],
        estimatedSteps: result.steps?.length ?? 0,
      };
    } catch (error) {
      if (error instanceof PersonalAssistantError) {
        throw error;
      }
      const formatted = formatError(error);
      throw new PersonalAssistantError(formatted.message, formatted.code, 500, formatted.details);
    }
  }

  /**
   * Execute a pre-generated plan (Act Mode).
   */
  async execute(plan: PlanResult, options?: ActModeConfig): Promise<ActResult> {
    const startTime = Date.now();

    try {
      const { runAgent: coreRunAgent } = await import('@personal-assistant/agent');

      const result = await coreRunAgent(plan.taskDescription, {
        model: options?.model ?? this.options.model,
        temperature: options?.temperature ?? this.options.temperature,
        maxTokens: options?.maxTokens ?? this.options.maxTokens,
        dryRun: options?.dryRun,
      });

      const duration = Date.now() - startTime;

      return {
        stepResults: (result.steps || []).map((s: AgentStep, i: number) => ({
          step: s,
          success: s.status === 'done',
          error: s.error,
          durationMs: duration / Math.max(result.steps?.length || 1, 1),
        })),
        durationMs: duration,
        allSuccess: result.success,
        summary: result.output || '',
      };
    } catch (error) {
      if (error instanceof PersonalAssistantError) {
        throw error;
      }
      const formatted = formatError(error);
      throw new PersonalAssistantError(formatted.message, formatted.code, 500, formatted.details);
    }
  }

  /**
   * Access the context builder for building code context.
   */
  get contextBuilder(): ContextBuilderWrapper {
    return new ContextBuilderWrapper(this.options.onOutput);
  }

  setModel(model: string): void {
    this.options.model = model;
  }

  setTemperature(temp: number): void {
    this.options.temperature = temp;
  }

  on(event: 'step' | 'output' | 'error', handler: Function): void {
    if (!this.stepHandlers.has(event)) {
      this.stepHandlers.set(event, new Set());
    }
    this.stepHandlers.get(event)!.add(handler);
  }

  off(event: string, handler: Function): void {
    this.stepHandlers.get(event)?.delete(handler);
  }

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

  private extractChangedFiles(steps: AgentStep[]): string[] {
    const files: string[] = [];
    for (const step of steps) {
      if (step.tool === 'write_file' && step.args?.path) {
        files.push(String(step.args.path));
      }
    }
    return files;
  }
}

/**
 * ContextBuilderWrapper - SDK wrapper for the backend ContextBuilder.
 */
export class ContextBuilderWrapper {
  private onOutput?: (text: string) => void;

  constructor(onOutput?: (text: string) => void) {
    this.onOutput = onOutput;
  }

  async build(options: ContextBuilderOptions): Promise<ContextBuildResult> {
    try {
      // Import from the main package's adapter layer
      const adapters = await import('@personal-assistant/agent/adapters');
      const builder = new adapters.ContextBuilder();

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
        codeSearchIncluded: ('codeSearchIncluded' in result ? result.codeSearchIncluded : false) as boolean,
        knowledgeIncluded: ('knowledgeIncluded' in result ? result.knowledgeIncluded : false) as boolean,
        codeEntryCount: result.codeEntryCount,
        knowledgeEntryCount: result.knowledgeEntryCount,
      };
    } catch (error) {
      if (error instanceof PersonalAssistantError) {
        throw error;
      }
      const formatted = formatError(error);
      throw new PersonalAssistantError(formatted.message, formatted.code, 500, formatted.details);
    }
  }

  async queryKnowledge(query: string): Promise<KnowledgeEntry[]> {
    try {
      const adapters = await import('@personal-assistant/agent/adapters');
      const builder = new adapters.ContextBuilder();
      return await builder.queryKnowledgeGraph(query);
    } catch (error) {
      if (error instanceof PersonalAssistantError) {
        throw error;
      }
      const formatted = formatError(error);
      throw new PersonalAssistantError(formatted.message, formatted.code, 500, formatted.details);
    }
  }

  clearCache(): void {
    // No-op: the underlying builder doesn't expose clearCache publicly
  }
}

/**
 * Convenience function to run an agent task.
 */
export async function runAgent(input: string, options?: AgentOptions): Promise<AgentResult> {
  const agent = new PersonalAssistantAgent(options);
  return agent.run(input);
}

/**
 * Convenience function to plan a task without executing.
 */
export async function planTask(input: string, options?: AgentOptions & { rootDir?: string }): Promise<PlanResult> {
  const agent = new PersonalAssistantAgent(options);
  return agent.plan(input, { rootDir: options?.rootDir });
}

/**
 * Convenience function to execute a pre-generated plan.
 */
export async function executePlan(plan: PlanResult, options?: ActModeConfig): Promise<ActResult> {
  const agent = new PersonalAssistantAgent();
  return agent.execute(plan, options);
}
