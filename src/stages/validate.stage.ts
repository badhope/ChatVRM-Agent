import { EventEmitter } from 'eventemitter3';
import type { Stage, PipelineContext, PipelineEvents } from '../core/types.js';
import { getEventBus } from '../core/event-bus.js';
import { TrustService, TrustLevel } from '../domain/trust/index.js';
import fs from 'fs/promises';
import path from 'path';

export class ValidateStage implements Stage {
  readonly name = 'validate';
  readonly required = true;
  private emitter: EventEmitter<PipelineEvents>;
  private rootDir: string;
  private verifyFiles: boolean;

  constructor(emitter?: EventEmitter<PipelineEvents>, rootDir?: string, options?: { verifyFiles?: boolean }) {
    this.emitter = emitter ?? getEventBus();
    this.rootDir = rootDir ?? process.cwd();
    this.verifyFiles = options?.verifyFiles ?? true;
  }

  async execute(ctx: PipelineContext): Promise<PipelineContext> {
    const results = ctx.results ?? [];
    const plan = ctx.plan ?? [];

    const validationIssues: string[] = [];
    const validationTimestamp = Date.now();
    const startTime = (ctx.metadata.startTime as number) ?? validationTimestamp;
    const totalDurationMs = validationTimestamp - startTime;

    const planSteps = plan.filter((s) => s.status !== 'skipped');
    const notCompletedSteps = planSteps.filter((s) => s.status !== 'completed');

    if (notCompletedSteps.length > 0) {
      validationIssues.push(`${notCompletedSteps.length} step(s) not completed`);
    }

    const failedResults = results.filter((r) => !r.success);
    if (failedResults.length > 0) {
      validationIssues.push(`${failedResults.length} result(s) had errors`);
    }

    const emptyResults = results.filter((r) => r.success && (!r.output || r.output.trim().length === 0));
    if (emptyResults.length > 0) {
      validationIssues.push(`${emptyResults.length} successful step(s) produced empty output`);
    }

    const hasOutputFiles = (ctx.modifiedFiles?.length ?? 0) > 0 || (ctx.createdFiles?.length ?? 0) > 0;
    if (results.length > 0 && !hasOutputFiles) {
      validationIssues.push('No output files were produced');
    }

    const verifiedFiles: string[] = [];
    const missingFiles: string[] = [];
    if (this.verifyFiles) {
      for (const file of ctx.modifiedFiles ?? []) {
        try {
          const resolved = path.isAbsolute(file) ? file : path.resolve(this.rootDir, file);
          const stat = await fs.stat(resolved);
          if (stat.isFile() && stat.size > 0) {
            verifiedFiles.push(file);
          } else if (stat.size === 0) {
            missingFiles.push(`${file} (empty)`);
          }
        } catch {
          missingFiles.push(`${file} (not found)`);
        }
      }
      if (missingFiles.length > 0) {
        validationIssues.push(`${missingFiles.length} file(s) failed verification: ${missingFiles.join(', ')}`);
      }
    }

    if (totalDurationMs > 600_000) {
      validationIssues.push(`Pipeline exceeded 10 minutes (${(totalDurationMs / 1000).toFixed(1)}s)`);
    }

    const allVerdicts: Array<{ stepId: string; verdict: ReturnType<typeof TrustService.evaluate> }> = [];
    const allIssues: Array<{ type: string; level: string; description: string }> = [];

    for (const result of results) {
      const verdict = TrustService.evaluate(result.output ?? '');
      allVerdicts.push({ stepId: result.stepId, verdict });
      for (const issue of verdict.issues) {
        allIssues.push({
          type: issue.type,
          level: issue.level,
          description: issue.description,
        });
      }
    }

    let shouldConfirm = ctx.shouldConfirm;

    if (allIssues.length > 0) {
      this.emitter.emit('trust:warning', {
        message: `Found ${allIssues.length} trust issue(s) across ${results.length} result(s)`,
        issues: allIssues,
      });

      const hasCritical = allVerdicts.some((v) =>
        v.verdict.issues.some((i) => i.level === TrustLevel.Critical),
      );

      if (hasCritical) {
        shouldConfirm = true;
      }
    }

    const validated = validationIssues.length === 0;

    this.emitter.emit('output', {
      text: validated
        ? `Validation passed: ${results.length} result(s), ${verifiedFiles.length} file(s) verified`
        : `Validation failed: ${validationIssues.length} issue(s)`,
    });

    return {
      ...ctx,
      shouldConfirm,
      metadata: {
        ...ctx.metadata,
        validated,
        validationIssues,
        validationTimestamp,
        validationSummary: validated
          ? `All ${results.length} step(s) passed; ${verifiedFiles.length} file(s) verified`
          : `${validationIssues.length} issue(s): ${validationIssues.join('; ')}`,
        validationTime: validationTimestamp,
        totalDurationMs,
        verifiedFiles,
        missingFiles,
        trustVerdicts: allVerdicts,
      },
    };
  }
}