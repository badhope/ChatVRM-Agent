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

/**
 * L11 (W18): strip ANSI escape sequences from a string. Sandbox
 * error messages can come from a child process whose stdout
 * (e.g. a Python test runner, an npm script) emits colour codes
 * even when the rest of the run is non-TTY. The raw error then
 * looks like:
 *   `writeFile blocked: \u001b[31mpath escapes workspace root: foo\u001b[0m`
 * and the LLM's tool-error path is hard to read, plus the
 * escape codes can be misinterpreted as control characters by
 * log shippers. We strip everything matching the ECMA-48
 * escape grammar we care about: CSI sequences (`\u001b[...m`),
 * single-character escapes (`\u001b[?25l`), and OSC
 * (`\u001b]...BEL`).
 */
function stripAnsi(s: string): string {
  return s
    .replace(/\u001b\][\s\S]*?(?:\u0007|\u001b\\)/g, '')
    .replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, '')
    .replace(/\u001b[=>][\s\S]*?(?:\u001b\\|\u0007)/g, '')
    .replace(/\u001b[P^_].*?(?:\u001b\\|\u0007)/g, '')
    .replace(/\u001b[()][\s\S]/g, '')
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '');
}

function extractCodeBlocks(content: string): string[] {
  const regex = /```[\w]*\n([\s\S]*?)```/g;
  const blocks: string[] = [];
  let match: RegExpExecArray | null = null;
  while ((match = regex.exec(content)) !== null) {
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

          // H8: capture pre-tool file snapshot so we can roll back if the
          // post-execute trust check fails. We snapshot every file path
          // visible in step.args (`filePath` / `path`) since these are
          // the candidate write targets of typical file-mutating tools.
          const preToolSnapshot: Array<{
            filePath: string;
            existed: boolean;
            content: string | null;
          }> = [];
          const candidatePaths: unknown[] = [
            (step.args as Record<string, unknown> | undefined)?.filePath,
            (step.args as Record<string, unknown> | undefined)?.path,
            (step.args as Record<string, unknown> | undefined)?.target,
            (step.args as Record<string, unknown> | undefined)?.dest,
          ];
          if (this.storage) {
            for (const candidate of candidatePaths) {
              if (typeof candidate !== 'string' || candidate.length === 0) continue;
              const { sandboxPath } = await import('../shared/sandbox.js');
              const safe = sandboxPath(candidate);
              if (!safe.ok) continue;
              const existed = await this.storage.exists(safe.resolved);
              let content: string | null = null;
              if (existed) {
                try {
                  content = await this.storage.read(safe.resolved);
                } catch {
                  content = null;
                }
              }
              preToolSnapshot.push({ filePath: safe.resolved, existed, content });
            }
          }

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

          // M18 (W18): retroactively extend the snapshot for any
          // files the tool reported as `changedFiles` in its
          // result. Some tools (e.g. `wordProcess` writing a
          // generated .docx, `reportBuild` producing a folder of
          // artefacts) don't expose the target path in their
          // `args` — they take a folder name and emit a path
          // derived at runtime. The pre-tool snapshot in that
          // case is empty, and a post-execute trust rollback
          // would have nothing to roll back to. We catch up
          // here: for every path the tool says it touched, we
          // record the *current* state as the rollback target.
          // This is correct because (a) the tool just finished
          // writing, so "current" is the post-write state, and
          // (b) if the trust check passes, this snapshot is
          // thrown away anyway.
          if (this.storage && Array.isArray(toolResult.changedFiles)) {
            for (const fp of toolResult.changedFiles) {
              if (typeof fp !== 'string' || fp.length === 0) continue;
              if (preToolSnapshot.some((s) => s.filePath === fp)) continue;
              try {
                const existed = await this.storage.exists(fp);
                let content: string | null = null;
                if (existed) {
                  try {
                    content = await this.storage.read(fp);
                  } catch {
                    content = null;
                  }
                }
                preToolSnapshot.push({ filePath: fp, existed, content });
              } catch {
                // Best-effort. If we can't snapshot a path here, we
                // just don't include it in the rollback set.
              }
            }
          }

          // H8: if the *post-execute* trust check (evaluated later in this
          // block) decides this step's output is high-risk or critical, we
          // need to undo side effects. The judgement is not yet made — but
          // we stash the snapshot on the runningStep so the trust-failure
          // branch can find it.
          if (preToolSnapshot.length > 0) {
            (runningStep as TaskStep & { _rollbackSnapshot?: typeof preToolSnapshot })._rollbackSnapshot = preToolSnapshot;
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
              // Sandbox the path so a prompt-injection-driven step
              // can't write to /etc/passwd or overwrite the project
              // root. The handler in server/tools-setup.ts already
              // does this; this fallback path (LLM-generated
              // step.output) did not, so a malicious step could
              // slip through.
              const { sandboxPath } = await import('../shared/sandbox.js');
              const safe = sandboxPath(explicitFilePath);
              if (!safe.ok) {
                // L11 (W18): strip ANSI from the sandbox error
                // so a child process's colour codes don't leak
                // into the agent's error stream.
                throw new Error(`writeFile blocked: ${stripAnsi(safe.error)}`);
              }
              // H10 (W18): capture a pre-write snapshot in the
              // LLM-fallback path so a post-execute trust rollback
              // can restore the previous content. Without this, a
              // high-risk response that prompts `writeFile` to
              // overwrite an existing file would leave the overwrite
              // on disk because the snapshot block above only runs
              // in the `useTool` branch.
              let fallbackSnapshot: { filePath: string; existed: boolean; content: string | null } | null = null;
              if (this.storage) {
                const existed = await this.storage.exists(safe.resolved);
                let content: string | null = null;
                if (existed) {
                  try {
                    content = await this.storage.read(safe.resolved);
                  } catch {
                    content = null;
                  }
                }
                fallbackSnapshot = { filePath: safe.resolved, existed, content };
              }
              const content = codeBlocks.length > 0 ? codeBlocks.join('\n\n') : response.content;
              if (this.storage && !(await this.storage.exists(safe.resolved))) {
                createdFiles.push(safe.resolved);
              }
              await this.storage.write(safe.resolved, content);
              stepChangedFiles.push(safe.resolved);
              modifiedFiles.push(safe.resolved);
              stepOutput = `Written ${content.length} bytes to ${safe.resolved}`;
              if (fallbackSnapshot) {
                (runningStep as TaskStep & { _rollbackSnapshot?: Array<{ filePath: string; existed: boolean; content: string | null }> })._rollbackSnapshot = [fallbackSnapshot];
              }
            } else if (codeBlocks.length > 0) {
              // No explicit path — write to a sandboxed 'output.txt'.
              const { sandboxPath } = await import('../shared/sandbox.js');
              const safe = sandboxPath('output.txt');
              if (!safe.ok) {
                throw new Error(`writeFile blocked: ${stripAnsi(safe.error)}`);
              }
              // H10 (W18): same snapshot-on-fallback-write logic as
              // the explicit-path branch above.
              let fallbackSnapshot: { filePath: string; existed: boolean; content: string | null } | null = null;
              if (this.storage) {
                const existed = await this.storage.exists(safe.resolved);
                let content: string | null = null;
                if (existed) {
                  try {
                    content = await this.storage.read(safe.resolved);
                  } catch {
                    content = null;
                  }
                }
                fallbackSnapshot = { filePath: safe.resolved, existed, content };
              }
              const content = codeBlocks.join('\n\n');
              if (this.storage && !(await this.storage.exists(safe.resolved))) {
                createdFiles.push(safe.resolved);
              }
              await this.storage.write(safe.resolved, content);
              stepChangedFiles.push(safe.resolved);
              modifiedFiles.push(safe.resolved);
              stepOutput = `Written to ${safe.resolved}`;
              if (fallbackSnapshot) {
                (runningStep as TaskStep & { _rollbackSnapshot?: Array<{ filePath: string; existed: boolean; content: string | null }> })._rollbackSnapshot = [fallbackSnapshot];
              }
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

            // H8: post-execute trust check failed. The tool already ran and
            // may have written files. Restore the pre-tool state from the
            // snapshot we captured earlier so a prompt-injection-driven
            // tool can't leave a partial write on disk.
            const snapshot = (runningStep as TaskStep & {
              _rollbackSnapshot?: Array<{ filePath: string; existed: boolean; content: string | null }>;
            })._rollbackSnapshot;
            if (snapshot && this.storage) {
              let restored = 0;
              let removed = 0;
              for (const entry of snapshot) {
                try {
                  const nowExists = await this.storage.exists(entry.filePath);
                  if (!entry.existed) {
                    // The file didn't exist before — remove it.
                    if (nowExists) {
                      await this.storage.delete(entry.filePath);
                      removed += 1;
                    }
                  } else if (entry.content !== null) {
                    // The file existed with a known content — overwrite to
                    // restore. (We don't compare-then-skip because the
                    // restored state must be authoritative.)
                    await this.storage.write(entry.filePath, entry.content);
                    restored += 1;
                  }
                } catch (err) {
                  // M5 (W18): swallow ENOENT during rollback. The
                  // file the snapshot expected to exist was deleted
                  // by some other process between snapshot and
                  // rollback; that's the *desired* post-rollback
                  // state, so a "no such file" is success, not
                  // failure. We log it at debug level so an
                  // operator can see it happened.
                  const code = (err as NodeJS.ErrnoException | undefined)?.code;
                  if (code !== 'ENOENT') {
                    this.emitter.emit('output', {
                      text: `  ⚠ Trust-rollback: could not restore ${entry.filePath}: ${
                        err instanceof Error ? err.message : String(err)
                      }`,
                    });
                  }
                }
              }
              if (restored > 0 || removed > 0) {
                this.emitter.emit('output', {
                  text: `  ↩️ Trust-rollback: restored ${restored} file(s), removed ${removed} new file(s)`,
                });
              }
              // Drop these from the run-level modifiedFiles / createdFiles
              // since the rollback put the workspace back to its pre-step
              // state.
              for (const entry of snapshot) {
                const mi = modifiedFiles.indexOf(entry.filePath);
                if (mi >= 0) modifiedFiles.splice(mi, 1);
                const ci = createdFiles.indexOf(entry.filePath);
                if (ci >= 0) createdFiles.splice(ci, 1);
              }
            }

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