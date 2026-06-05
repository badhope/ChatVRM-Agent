import type { Stage, PipelineContext, TaskStep, StepResult, PipelineEvents } from '../core/types.js';
import { MAX_STEPS } from '../core/types.js';
import { EventEmitter } from 'eventemitter3';
import type { ILLMPort } from '../ports/llm.port.js';
import type { IConfigPort } from '../ports/config.port.js';
import type { IStoragePort } from '../ports/storage.port.js';
import type { IMemoryPort } from '../ports/memory.port.js';
import type { IShellPort } from '../ports/shell.port.js';
import type { IToolsPort } from '../ports/tools.port.js';
import type { ToolResult } from '../ports/tools.port.js';
import { PersonalityService } from '../domain/personality/personality.service.js';
import { EmotionService } from '../domain/personality/emotion.service.js';
import { TrustService, TrustLevel } from '../domain/trust/trust.service.js';

function extractCodeBlocks(text: string): string[] {
  const regex = /```[\w]*\n([\s\S]*?)```/g;
  const blocks: string[] = [];
  let match: RegExpExecArray | null = null;
  while ((match = regex.exec(text)) !== null) {
    blocks.push(match[1]);
  }
  return blocks;
}

function extractShellCommand(text: string): string | null {
  const blockMatch = /```(?:bash|sh|shell|zsh)\n([\s\S]*?)```/.exec(text);
  if (blockMatch) return blockMatch[1].trim();
  return null;
}

export class ExecuteStage implements Stage {
  readonly name = 'execute';
  readonly required = true;
  readonly canRollback = true;
  private llm: ILLMPort;
  private config: IConfigPort;
  private emitter: EventEmitter<PipelineEvents>;
  private storage?: IStoragePort;
  private memory?: IMemoryPort;
  private shell?: IShellPort;
  private tools?: IToolsPort;

  constructor(
    llm: ILLMPort,
    config: IConfigPort,
    emitter?: EventEmitter<PipelineEvents>,
    options?: { storage?: IStoragePort; memory?: IMemoryPort; shell?: IShellPort; tools?: IToolsPort },
  ) {
    this.llm = llm;
    this.config = config;
    this.emitter = emitter ?? new EventEmitter<PipelineEvents>();
    this.storage = options?.storage;
    this.memory = options?.memory;
    this.shell = options?.shell;
    this.tools = options?.tools;
  }

  async execute(ctx: PipelineContext): Promise<PipelineContext> {
    const plan = ctx.plan ?? [];

    if (plan.length === 0) {
      throw new Error('No plan steps to execute');
    }

    if (plan.length > MAX_STEPS) {
      throw new Error(`Plan exceeds maximum of ${MAX_STEPS} steps (got ${plan.length})`);
    }

    const provider = await this.config.getDefaultProvider();
    const personality = PersonalityService.createDefaultIdentity();
    let emotion = EmotionService.createDefaultEmotion();

    this.emitter.emit('output', { text: `Executing ${plan.length} step(s) with provider: ${provider}` });

    const results: StepResult[] = [];
    const executedSteps: TaskStep[] = [];
    const modifiedFiles: string[] = [];
    const createdFiles: string[] = [];
    let combinedOutput = '';

    for (const step of plan) {
      const startTime = performance.now();

      const runningStep: TaskStep = { ...step, status: 'running', startTime: Date.now() };

      // Pre-execute trust check. Evaluates the *planned* action (step
      // description + tool + args) before any side effects. A high-risk
      // verdict here means we never even invoke the tool — guarding
      // against a prompt-injection-driven shell / writeFile / etc.
      // whose harm would already be done by the time the post-execute
      // check runs.
      const preCheckInput = [
        step.description,
        step.tool ? `tool: ${step.tool}` : '',
        step.args ? `args: ${JSON.stringify(step.args).slice(0, 2000)}` : '',
      ]
        .filter(Boolean)
        .join('\n');
      const preVerdict = TrustService.evaluate(preCheckInput, {
        intent: ctx.intent,
        toolUsed: step.tool,
      });
      if (
        preVerdict.level === TrustLevel.HighRisk ||
        preVerdict.level === TrustLevel.Critical
      ) {
        const durationMs = Math.round(performance.now() - startTime);
        const skippedStep: TaskStep = {
          ...runningStep,
          status: 'skipped',
          endTime: Date.now(),
          result: 'Skipped due to pre-execute trust check',
        };
        executedSteps.push(skippedStep);
        const skipResult: StepResult = {
          stepId: step.id,
          success: false,
          output: 'Skipped - pre-execute trust check failed',
          error: `Trust level: ${preVerdict.level}. ${preVerdict.summary}`,
          durationMs,
          changedFiles: [],
        };
        results.push(skipResult);
        this.emitter.emit('step:start', { step: runningStep });
        this.emitter.emit('step:complete', { step: skippedStep, result: skipResult });
        this.emitter.emit('output', {
          text: `  ⚠ ${step.description} skipped (pre-trust: ${preVerdict.level})`,
        });
        return {
          ...ctx,
          plan: executedSteps,
          results: [...(ctx.results ?? []), ...results],
          shouldConfirm: true,
          confirmPrompt: preVerdict.summary,
          errors: [
            ...(ctx.errors ?? []),
            {
              phase: `execute:${step.id}`,
              message: `Pre-execute trust: ${preVerdict.level}. ${preVerdict.summary}`,
              recoverable: true,
              timestamp: Date.now(),
            },
          ],
        };
      }

      executedSteps.push(runningStep);
      this.emitter.emit('step:start', { step: runningStep });
      this.emitter.emit('output', { text: `  Running step: ${step.description}` });

      try {
        let stepOutput = '';
        let stepChangedFiles: string[] = [];
        let trustVerdict: ReturnType<typeof TrustService.evaluate> | null = null;
        let llmResponseContent = '';

        const useTool = step.tool && this.tools && this.tools.has(step.tool);

        if (useTool && this.tools) {
          this.emitter.emit('output', { text: `  🔧 Invoking tool: ${step.tool}` });

          const previousOutput = results.length > 0
            ? results[results.length - 1]?.output ?? ''
            : '';

          const toolArgs: Record<string, unknown> = {
            input: ctx.input,
            message: ctx.input,
            ...(step.args as Record<string, unknown> | undefined),
            context: {
              taskInput: ctx.input,
              intent: ctx.intent,
              stepDescription: step.description,
              knowledgeContext: (ctx.metadata.knowledgeContext as string) ?? '',
              previousOutput,
            },
            previousOutput,
          };

          let toolResult: ToolResult;
          try {
            toolResult = await this.tools.execute(step.tool!, toolArgs);
          } catch (err) {
            throw new Error(`Tool "${step.tool}" threw: ${err instanceof Error ? err.message : String(err)}`);
          }

          if (!toolResult.success) {
            throw new Error(`Tool "${step.tool}" failed: ${toolResult.error ?? 'unknown error'}`);
          }

          stepOutput = toolResult.output ?? '';
          if (step.tool === 'writeFile') {
            const explicitFilePath = (step.args?.filePath as string) ?? (step.args?.path as string);
            if (explicitFilePath) {
              // First write to a previously-missing path counts as a
              // creation; later writes are modifications.
              if (this.storage && !(await this.storage.exists(explicitFilePath))) {
                createdFiles.push(explicitFilePath);
              }
              stepChangedFiles.push(explicitFilePath);
            }
          }
        } else {
          const chatConfig = await this.config.getChatConfig();
          const personalityPrompt = PersonalityService.getPersonalityPrompt(personality);
          const emotionalContext = EmotionService.getEmotionalContext(emotion);
          const knowledgeContext = (ctx.metadata.knowledgeContext as string) ?? '';

          let systemPrompt = personalityPrompt + '\n' + emotionalContext;
          if (knowledgeContext) {
            systemPrompt += '\n\nRelevant context from knowledge base:\n' + knowledgeContext;
          }

          const intentInstructions = `You are executing step: "${step.description}". ${step.tool ? `Use tool: ${step.tool}.` : ''} Respond directly and concisely.`;
          systemPrompt += '\n\n' + intentInstructions;

          const messages = [
            { role: 'system' as const, content: systemPrompt },
            { role: 'user' as const, content: `Task context: ${ctx.input}\n\nExecute step: ${step.description}` },
          ];

          const response = await this.llm.chat({
            messages,
            model: chatConfig.model,
            temperature: chatConfig.temperature,
          });

          llmResponseContent = response.content;
          this.emitter.emit('llm:call', { provider, model: response.model, tokens: response.usage.totalTokens });
          stepOutput = response.content;

          if (step.tool === 'writeFile' && this.storage) {
            const codeBlocks = extractCodeBlocks(response.content);
            const explicitFilePath = (step.args?.filePath as string) ?? (step.args?.path as string);
            if (explicitFilePath) {
              const content = codeBlocks.length > 0 ? codeBlocks.join('\n\n') : response.content;
              if (this.storage && !(await this.storage.exists(explicitFilePath))) {
                createdFiles.push(explicitFilePath);
              }
              await this.storage.write(explicitFilePath, content);
              stepChangedFiles.push(explicitFilePath);
              modifiedFiles.push(explicitFilePath);
              stepOutput = `Written ${content.length} bytes to ${explicitFilePath}`;
            } else if (codeBlocks.length > 0) {
              const filePath = 'output.txt';
              const content = codeBlocks.join('\n\n');
              if (this.storage && !(await this.storage.exists(filePath))) {
                createdFiles.push(filePath);
              }
              await this.storage.write(filePath, content);
              stepChangedFiles.push(filePath);
              modifiedFiles.push(filePath);
              stepOutput = `Written to ${filePath}`;
            }
          }

          if (step.tool === 'shell' && this.shell) {
            const commandFromArgs = (step.args?.command as string) ?? extractShellCommand(response.content);
            if (commandFromArgs) {
              const timeoutMs = (step.args?.timeout as number) ?? 30_000;
              try {
                const result = await this.shell.execute(commandFromArgs, { timeout: timeoutMs });
                stepOutput = `[exit ${result.exitCode}] (${result.durationMs}ms)\nSTDOUT:\n${result.stdout || '(empty)'}\nSTDERR:\n${result.stderr || '(empty)'}`;
                if (result.exitCode !== 0) {
                  this.emitter.emit('output', { text: `  ⚠ Shell command exited with code ${result.exitCode}` });
                }
              } catch (err) {
                stepOutput = `Shell execution failed: ${err instanceof Error ? err.message : String(err)}`;
              }
            } else {
              stepOutput = 'Shell step has no command in args or response content';
            }
          }
        }

        const trustInput = llmResponseContent || stepOutput;
        trustVerdict = TrustService.evaluate(trustInput, { intent: ctx.intent, toolUsed: step.tool });
        if (TrustService.shouldConfirm(trustVerdict)) {
          this.emitter.emit('trust:warning', {
            message: trustVerdict.summary,
            issues: trustVerdict.issues.map((i) => ({ type: i.type, level: i.level })),
          });
          if (trustVerdict.level === TrustLevel.HighRisk || trustVerdict.level === TrustLevel.Critical) {
            const endTime = performance.now();
            const durationMs = Math.round(endTime - startTime);

            const skippedStep: TaskStep = {
              ...runningStep,
              status: 'skipped',
              endTime: Date.now(),
              result: 'Skipped due to trust warning',
            };
            executedSteps[executedSteps.length - 1] = skippedStep;

            const skipResult: StepResult = {
              stepId: step.id,
              success: false,
              output: 'Skipped - trust check failed',
              error: `Trust level: ${trustVerdict.level}. ${trustVerdict.summary}`,
              durationMs,
              changedFiles: [],
            };

            results.push(skipResult);
            this.emitter.emit('step:complete', { step: skippedStep, result: skipResult });
            this.emitter.emit('output', { text: `  ⚠ ${step.description} skipped (trust: ${trustVerdict.level})` });

            const updatedCtx: PipelineContext = {
              ...ctx,
              plan: executedSteps,
              results: [...(ctx.results ?? []), ...results],
              modifiedFiles: [...ctx.modifiedFiles, ...modifiedFiles],
              createdFiles: [...(ctx.createdFiles ?? []), ...createdFiles],
              shouldConfirm: true,
              confirmPrompt: trustVerdict.summary,
              errors: [
                ...(ctx.errors ?? []),
                {
                  phase: `execute:${step.id}`,
                  message: `Trust level: ${trustVerdict.level}. ${trustVerdict.summary}`,
                  recoverable: true,
                  timestamp: Date.now(),
                },
              ],
              metadata: {
                ...ctx.metadata,
                emotion: emotion,
              },
            };

            return updatedCtx;
          }
        }

        emotion = EmotionService.onTaskSuccess(step.description, emotion);
        combinedOutput += (combinedOutput ? '\n' : '') + `[${step.description}] ${stepOutput}`;

        const endTime = performance.now();
        const durationMs = Math.round(endTime - startTime);

        const result: StepResult = {
          stepId: step.id,
          success: true,
          output: stepOutput,
          durationMs,
          changedFiles: stepChangedFiles,
        };

        const completedStep: TaskStep = {
          ...runningStep,
          status: 'completed',
          endTime: Date.now(),
          result: stepOutput,
        };
        executedSteps[executedSteps.length - 1] = completedStep;

        results.push(result);
        this.emitter.emit('step:complete', { step: completedStep, result });
        this.emitter.emit('output', { text: `  ✓ ${step.description} (${durationMs}ms)` });
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        const endTime = performance.now();
        const durationMs = Math.round(endTime - startTime);

        emotion = EmotionService.onTaskFailure(err.message, emotion);

        const result: StepResult = {
          stepId: step.id,
          success: false,
          error: err.message,
          durationMs,
          changedFiles: [],
        };

        const failedStep: TaskStep = {
          ...runningStep,
          status: 'failed',
          endTime: Date.now(),
          error: err.message,
        };
        executedSteps[executedSteps.length - 1] = failedStep;

        results.push(result);
        this.emitter.emit('step:error', { step: failedStep, error: err });
        this.emitter.emit('output', { text: `  ✗ ${step.description}: ${err.message}` });

        throw err;
      }
    }

    if (this.memory && combinedOutput) {
      try {
        await this.memory.remember({
          input: ctx.input,
          output: combinedOutput,
          tags: [ctx.intent ?? 'general', provider],
          provider: provider,
          model: 'default',
        });
        this.emitter.emit('memory:store', { type: 'conversation' });
      } catch {
      }
    }

    const updatedCtx: PipelineContext = {
      ...ctx,
      plan: executedSteps,
      results: [...(ctx.results ?? []), ...results],
      modifiedFiles: [...ctx.modifiedFiles, ...modifiedFiles],
      createdFiles: [...(ctx.createdFiles ?? []), ...createdFiles],
      metadata: {
        ...ctx.metadata,
        emotion: emotion,
        provider: provider,
      },
    };

    const completedCount = results.filter((r) => r.success).length;
    const failedCount = results.filter((r) => !r.success).length;
    this.emitter.emit('output', {
      text: `Execution complete: ${completedCount} succeeded, ${failedCount} failed, ${createdFiles.length} file(s) created, ${modifiedFiles.length} file(s) modified`,
    });

    return updatedCtx;
  }

  async rollback(ctx: PipelineContext): Promise<PipelineContext> {
    this.emitter.emit('output', { text: 'Rolling back execution...' });

    // Actually delete files we created during this run. Without this,
    // a failed pipeline leaves partial writes on disk that the user
    // can't distinguish from legitimate work. For files we merely
    // modified we can't safely restore without a backup, so we warn
    // and let the caller (or the user) decide.
    const createdFiles = ctx.createdFiles ?? [];
    const modifiedFiles = ctx.modifiedFiles ?? [];
    if (this.storage && createdFiles.length > 0) {
      let deleted = 0;
      for (const fp of createdFiles) {
        try {
          await this.storage.delete(fp);
          deleted++;
        } catch (err) {
          this.emitter.emit('output', {
            text: `  ⚠ Rollback: could not delete ${fp}: ${err instanceof Error ? err.message : String(err)}`,
          });
        }
      }
      this.emitter.emit('output', {
        text: `  ↩️ Deleted ${deleted}/${createdFiles.length} created file(s) during rollback`,
      });
    }
    if (modifiedFiles.length > 0) {
      this.emitter.emit('output', {
        text: `  ⚠ ${modifiedFiles.length} file(s) were modified and NOT automatically rolled back — review manually: ${modifiedFiles.join(', ')}`,
      });
    }

    const rolledBackPlan = (ctx.plan ?? []).map((step) => {
      if (step.status === 'completed' || step.status === 'failed') {
        return { ...step, status: 'pending' as const, result: undefined, error: undefined, startTime: undefined, endTime: undefined };
      }
      return step;
    });

    this.emitter.emit('output', { text: `Rollback complete: ${rolledBackPlan.length} step(s) reset to pending` });

    return {
      ...ctx,
      plan: rolledBackPlan,
      results: [],
      createdFiles: [],
      modifiedFiles: [],
    };
  }
}