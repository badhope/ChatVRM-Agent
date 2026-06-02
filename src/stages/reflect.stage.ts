import { EventEmitter } from 'eventemitter3';
import type { Stage, PipelineContext, PipelineEvents } from '../core/types.js';
import { getEventBus } from '../core/event-bus.js';
import type { LLMAdapter } from '../adapters/llm.adapter.js';
import type { ConfigAdapter } from '../adapters/config.adapter.js';
import type { MemoryAdapter } from '../adapters/memory.adapter.js';

export class ReflectStage implements Stage {
  readonly name = 'reflect';
  readonly required = false;
  private emitter: EventEmitter<PipelineEvents>;
  private llm?: LLMAdapter;
  private config?: ConfigAdapter;
  private memory?: MemoryAdapter;

  constructor(
    emitter?: EventEmitter<PipelineEvents>,
    llm?: LLMAdapter,
    config?: ConfigAdapter,
    memory?: MemoryAdapter,
  ) {
    this.emitter = emitter ?? getEventBus();
    this.llm = llm;
    this.config = config;
    this.memory = memory;
  }

  async execute(ctx: PipelineContext): Promise<PipelineContext> {
    try {
      const results = ctx.results ?? [];
      const errors = ctx.errors ?? [];
      const plan = ctx.plan ?? [];

      const completedCount = results.filter((r) => r.success).length;
      const failedCount = results.filter((r) => !r.success).length;
      const startTime = (ctx.metadata.startTime as number) ?? Date.now();
      const totalDurationMs = Date.now() - startTime;
      const totalSteps = plan.length;
      const skippedCount = plan.filter((s) => s.status === 'skipped').length;

      const changedFiles = [
        ...new Set([...(ctx.modifiedFiles ?? []), ...(ctx.createdFiles ?? [])]),
      ];

      const failedSteps = plan.filter((s) => s.status === 'failed').map((s) => ({
        id: s.id,
        description: s.description,
        error: s.error,
      }));

      const completedSteps = plan.filter((s) => s.status === 'completed').map((s) => ({
        id: s.id,
        description: s.description,
      }));

      let llmReflection: string | undefined;

      if (this.llm && this.config) {
        try {
          const provider = await this.config.getDefaultProvider();
          const chatConfig = await this.config.getChatConfig();
          const model = chatConfig.model;

          const prompt = `You just completed a task. Reflect on what happened, what was learned, any issues.

Completed steps (${completedCount}):
${completedSteps.map((s) => `- ${s.description}`).join('\n')}

Failed steps (${failedCount}):
${failedSteps.map((s) => `- ${s.description}: ${s.error ?? 'unknown error'}`).join('\n')}

Errors:
${errors.map((e) => `- [${e.phase}] ${e.message}`).join('\n')}

Provide a concise reflection covering:
1. What went well
2. What went wrong
3. What could be improved next time
4. Lessons learned`;

          const response = await this.llm.chat({
            messages: [
              { role: 'system', content: 'You are a task reflection assistant. Analyze task execution and provide concise, actionable reflections.' },
              { role: 'user', content: prompt },
            ],
            temperature: 0.3,
            maxTokens: 500,
            provider,
            model,
          });

          llmReflection = response.content;

          this.emitter.emit('llm:call', {
            provider,
            model: response.model,
            tokens: response.usage.totalTokens,
          });
        } catch {
          this.emitter.emit('output', {
            text: '  ⚠ LLM reflection generation failed, continuing without it',
          });
        }
      }

      const lessonsLearned: string[] = [];
      if (failedSteps.length > 0) {
        for (const step of failedSteps) {
          if (step.error) {
            lessonsLearned.push(`Step "${step.description}" failed: ${step.error}`);
          }
        }
      }
      if (completedSteps.length > 0) {
        lessonsLearned.push(`Successfully completed ${completedSteps.length} step(s)`);
      }
      if (changedFiles.length === 0 && results.length > 0) {
        lessonsLearned.push('No files were changed');
      }
      if (totalDurationMs > 60000) {
        lessonsLearned.push(`Pipeline took ${Math.round(totalDurationMs / 1000)}s to complete`);
      }

      if (this.memory) {
        try {
          const provider = this.config ? await this.config.getDefaultProvider() : 'unknown';
          const chatConfig = this.config ? await this.config.getChatConfig() : undefined;
          const model = chatConfig?.model ?? 'unknown';

          await this.memory.remember({
            input: ctx.input,
            output: llmReflection ?? `Completed ${completedCount}/${results.length} steps`,
            provider,
            model,
            tags: [ctx.intent ?? 'general', 'completed'],
          });

          this.emitter.emit('memory:store', { type: 'task_completion' });
        } catch {
          this.emitter.emit('output', {
            text: '  ⚠ Memory storage failed, continuing without it',
          });
        }
      }

      return {
        ...ctx,
        metadata: {
          ...ctx.metadata,
          reflection: {
            llmReflection,
            completedCount,
            failedCount,
            totalSteps,
            totalDurationMs,
            skippedCount,
            changedFiles,
            lessonsLearned,
            timestamp: Date.now(),
          },
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.emitter.emit('output', {
        text: `  ⚠ Reflection warning: ${errorMessage}`,
      });
      return {
        ...ctx,
        metadata: {
          ...ctx.metadata,
          reflection: {
            error: errorMessage,
            timestamp: Date.now(),
          },
        },
      };
    }
  }
}