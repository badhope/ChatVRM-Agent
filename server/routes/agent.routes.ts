import { Router, type Request, type Response } from 'express';
import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'eventemitter3';
import type { ILLMPort } from '../../src/ports/llm.port.js';
import type { IConfigPort } from '../../src/ports/config.port.js';
import type { IStoragePort } from '../../src/ports/storage.port.js';
import type { IMemoryPort } from '../../src/ports/memory.port.js';
import type { IShellPort } from '../../src/ports/shell.port.js';
import type { IToolsPort } from '../../src/ports/tools.port.js';
import { createDefaultStages } from '../../src/stages/index.js';
import { resolveApiKey, PROVIDER_META } from '../providers.js';
import { updateEmotionFromInteraction } from './emotion.routes.js';
import { incrementAgentRun, incrementToolCall } from './dashboard.routes.js';
import type { ProviderType } from '../../src/ports/config.port.js';
import type { PipelineContext, PipelineEvents, TaskStep } from '../../src/core/types.js';
import { readFile, access } from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

interface AgentDeps {
  llm: ILLMPort;
  config: IConfigPort;
  storage: IStoragePort;
  memory: IMemoryPort;
  shell: IShellPort;
  tools: IToolsPort;
}

function sseHeaders(res: Response) {
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();
}

function sseSend(res: Response, event: string, data: unknown) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

async function listWorkspaceFiles(cwd: string, max = 100): Promise<string[]> {
  async function walk(dir: string, depth: number, out: string[]): Promise<void> {
    if (out.length >= max || depth > 3) return;
    let entries: import('node:fs').Dirent[] = [];
    try {
      const { readdir } = await import('node:fs/promises');
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (out.length >= max) break;
      if (e.name.startsWith('.') || e.name === 'node_modules' || e.name === 'dist') continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) await walk(full, depth + 1, out);
      else if (e.isFile()) out.push(full);
    }
  }
  const out: string[] = [];
  await walk(cwd, 0, out);
  return out;
}

export function agentRoutes(deps: AgentDeps): Router {
  const r = Router();

  r.post('/run', async (req: Request, res: Response) => {
    const { task, provider, model, cwd } = req.body as {
      task: string;
      provider?: ProviderType;
      model?: string;
      cwd?: string;
    };
    if (!task) {
      res.status(400).json({ error: 'task is required' });
      return;
    }

    const useProvider = (provider ?? (await deps.config.getDefaultProvider())) as ProviderType;
    const meta = PROVIDER_META.find((p) => p.id === useProvider);
    if (!meta) {
      res.status(400).json({ error: `unknown provider "${useProvider}"` });
      return;
    }
    if (meta.requiresKey) {
      const key = await resolveApiKey(deps.config, useProvider);
      if (!key) {
        res.status(401).json({
          error: `No API key for provider "${useProvider}". Set it via /api/config/set-key or env var ${useProvider.toUpperCase()}_API_KEY`,
        });
        return;
      }
    }

    sseHeaders(res);

    const workdir = cwd && cwd.length > 0 ? cwd : process.cwd();
    const emitter = new EventEmitter<PipelineEvents>();

    const stageStartedAt: Record<string, number> = {};
    const toolCalls: Array<{ stepId?: string; toolName: string; args: unknown; output?: string; error?: string; durationMs: number }> = [];

    emitter.on('stage:start', (e) => {
      stageStartedAt[e.stage] = Date.now();
      sseSend(res, 'stage', { stage: e.stage, status: 'running' });
    });
    emitter.on('stage:complete', (e) => {
      sseSend(res, 'stage', { stage: e.stage, status: 'done', durationMs: Date.now() - (stageStartedAt[e.stage] ?? Date.now()) });
    });
    emitter.on('stage:error', (e) => {
      sseSend(res, 'stage', { stage: e.stage, status: 'failed', error: e.error.message });
    });
    emitter.on('step:start', (e) => {
      sseSend(res, 'step', { step: e.step, status: 'running' });
    });
    emitter.on('step:complete', (e) => {
      toolCalls.push({
        stepId: e.step.id,
        toolName: e.step.tool ?? 'unknown',
        args: e.step.args ?? {},
        output: e.result.output,
        durationMs: e.result.durationMs,
      });
      incrementToolCall();
      sseSend(res, 'step', { step: e.step, result: e.result, status: 'done' });
    });
    emitter.on('step:error', (e) => {
      sseSend(res, 'step', { step: e.step, error: e.error.message, status: 'failed' });
    });
    emitter.on('output', (e) => {
      sseSend(res, 'output', { text: e.text });
    });
    emitter.on('llm:call', (e) => {
      sseSend(res, 'llm', e);
    });

    const ctx: PipelineContext = {
      taskId: randomUUID(),
      input: task,
      errors: [],
      metadata: { requestProvider: useProvider, requestModel: model ?? meta.defaultModel, cwd: workdir },
      createdFiles: [],
      modifiedFiles: [],
      phaseHistory: [],
      shouldConfirm: false,
    };

    const stages = createDefaultStages({
      llm: deps.llm,
      config: deps.config,
      storage: deps.storage,
      memory: deps.memory,
      shell: deps.shell,
      tools: deps.tools,
      eventBus: emitter,
    });

    const stageOrder = stages.map((s) => s.name);
    sseSend(res, 'pipeline-start', { taskId: ctx.taskId, task, provider: useProvider, model: model ?? meta.defaultModel, stages: stageOrder });

    let aborted = false;
    const abortController = new AbortController();
    let closeFired = false;
    const handleClose = () => {
      if (closeFired) return;
      closeFired = true;
      aborted = true;
      try {
        abortController.abort();
      } catch {
      }
    };
    // res.on('close') fires when the underlying socket closes (client disconnect).
    // req.on('close') fires when the request body is fully consumed, which happens
    // early in the request lifecycle — useless for streaming response abort detection.
    res.on('close', handleClose);
    req.on('aborted', handleClose);

    let currentCtx: PipelineContext = ctx;
    let failed: string | null = null;
    let failedErr: string | null = null;

    for (const stage of stages) {
      if (aborted) break;
      try {
        currentCtx = await stage.execute(currentCtx);

        if (stage.name === 'understand' && currentCtx.intent) {
          sseSend(res, 'understand', { intent: currentCtx.intent });
        }
        if (stage.name === 'plan' && currentCtx.plan) {
          sseSend(res, 'plan', {
            steps: currentCtx.plan.map((s) => ({
              id: s.id,
              description: s.description,
              tool: s.tool,
              status: s.status,
            })),
          });
        }
        if (stage.name === 'execute') {
          const files = await listWorkspaceFiles(workdir, 50);
          sseSend(res, 'workspace', { files });
        }
        if (stage.name === 'reflect') {
          try {
            await deps.memory.remember({
              input: task,
              output: currentCtx.plan?.map((p) => p.result).filter(Boolean).join('\n').slice(0, 1500) ?? '',
              provider: useProvider,
              model: model ?? meta.defaultModel,
              tags: ['agent', currentCtx.intent ?? 'task', useProvider],
            });
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            process.stderr.write(`[agent] memory write failed: ${msg}\n`);
          }
        }
      } catch (err) {
        failed = stage.name;
        failedErr = err instanceof Error ? err.message : String(err);
        sseSend(res, 'stage', { stage: stage.name, status: 'failed', error: failedErr });
        break;
      }
    }

    sseSend(res, 'pipeline-end', {
      taskId: ctx.taskId,
      success: !failed,
      failed,
      error: failedErr,
      createdFiles: currentCtx.createdFiles,
      modifiedFiles: currentCtx.modifiedFiles,
      phaseHistory: currentCtx.phaseHistory,
      toolCalls,
    });

    if (failed) {
      incrementAgentRun();
      updateEmotionFromInteraction({ intensity: 8, name: 'frustrated' });
    } else {
      incrementAgentRun();
      updateEmotionFromInteraction({ intensity: 12, name: 'confident' });
    }

    res.end();
  });

  return r;
}
