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
import { validateCwd } from '../middleware/auth.js';
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

/**
 * C5 (W19): write a SSE frame with a try/catch so a single failed
 * `res.write` (e.g. socket already closed mid-flight) does not crash
 * the agent loop and prevent the final `pipeline-end` from being
 * delivered. The function is silent on failure — the surrounding
 * `finally` in the route handler is responsible for the
 * `pipeline-end` finalisation. Returns true on success, false on
 * failure (so callers can short-circuit subsequent writes).
 */
function safeWrite(res: Response, event: string, data: unknown): boolean {
  if (res.writableEnded) return false;
  try {
    sseSend(res, event, data);
    return true;
  } catch {
    return false;
  }
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
  // H13/H15: agent run / run-task endpoints run an LLM call, may
  // shell out, and write to the workspace. Bearer-token gate is
  // applied globally in app.ts; cwd allowlist is enforced per-request
  // in the /run handler below.

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

    // H15: validate the user-supplied cwd before any tool runs in it.
    const cwdCheck = validateCwd(cwd);
    if (!cwdCheck.ok) {
      res.status(400).json({ error: cwdCheck.error });
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

    const workdir = cwdCheck.resolved;
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

    const abortController = new AbortController();
    const ctx: PipelineContext = {
      taskId: randomUUID(),
      input: task,
      errors: [],
      metadata: { requestProvider: useProvider, requestModel: model ?? meta.defaultModel, cwd: workdir },
      createdFiles: [],
      modifiedFiles: [],
      phaseHistory: [],
      shouldConfirm: false,
      // L12 (W19): forward the request's AbortController
      // signal to every stage via the PipelineContext. A
      // client disconnect (`res.on('close', ...)`) calls
      // `abortController.abort()` below, which propagates
      // to any LLM call / ReAct loop / MCP tool inside a
      // stage. Pre-W19 the signal was kept local to the
      // route handler; stages never saw it, so a 30-second
      // LLM call kept running for the full duration after
      // the browser tab was closed.
      signal: abortController.signal,
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
    // M10 (W18): `req.on('aborted')` was deprecated in Node 17 and emits
    // a deprecation warning under Node 18+; we now use the `close` event
    // on the response instead, which is the documented, supported way to
    // observe client disconnects on an HTTP/1.1 SSE response. The old
    // listener is removed entirely so no `DeprecationWarning` shows up in
    // the logs.
    // L6 (W18): also register a `finish` handler that explicitly
    // removes the close listener. The previous code only relied on
    // the `closeFired` flag, which meant the listener was retained
    // on the `res` object until GC. For long-lived server processes
    // serving many SSE requests, that retained-closure chain kept
    // the `emitter` and the stage results in memory long after the
    // request was done. `res.off('close', handleClose)` cuts the
    // reference immediately.
    const onFinish = () => {
      res.off('close', handleClose);
    };
    res.on('close', handleClose);
    res.on('finish', onFinish);

    // M11 (W18): SSE keep-alive heartbeat. A long-running stage (e.g. a
    // slow LLM call inside `understand`) can spend 30+ seconds emitting
    // nothing. Many proxies (nginx default 60s, ALB 60s, Cloudflare
    // 100s) will silently drop the connection if no bytes flow in
    // that window, and the user will see a stream that "just stops".
    // We send a `:keep-alive` SSE comment every 15s — comments are
    // ignored by EventSource clients, don't trigger any handler, and
    // are exactly the mechanism the SSE spec recommends for
    // heartbeats. The timer is cleared on close.
    const HEARTBEAT_MS = 15_000;
    const heartbeat = setInterval(() => {
      if (aborted || res.writableEnded) return;
      try {
        res.write(':keep-alive\n\n');
      } catch {
        // Best-effort. If the write fails the close listener will
        // fire and tear the request down.
      }
    }, HEARTBEAT_MS);
    const stopHeartbeat = () => clearInterval(heartbeat);
    res.on('close', stopHeartbeat);
    res.on('finish', stopHeartbeat);

    let currentCtx: PipelineContext = ctx;
    let failed: string | null = null;
    let failedErr: string | null = null;
    let pipelineEndSent = false;

    try {
      for (const stage of stages) {
        if (aborted) break;
        try {
          currentCtx = await stage.execute(currentCtx);

          if (stage.name === 'understand' && currentCtx.intent) {
            safeWrite(res, 'understand', { intent: currentCtx.intent });
          }
          if (stage.name === 'plan' && currentCtx.plan) {
            safeWrite(res, 'plan', {
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
            safeWrite(res, 'workspace', { files });
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
          safeWrite(res, 'stage', { stage: stage.name, status: 'failed', error: failedErr });
          // M16 (W18): emit a top-level `failed` event in addition to
          // the per-stage `stage:failed` payload. The client code in
          // `web-ui/src/...` listens for `failed` to switch the UI
          // into an error state without having to inspect
          // `pipeline-end`. Without this top-level event, a route
          // that crashes *before* the `pipeline-end` is sent (e.g.
          // a crash in the SSE write itself) leaves the client
          // stuck on the "running" state forever.
          safeWrite(res, 'failed', {
            taskId: ctx.taskId,
            stage: stage.name,
            error: failedErr,
          });
          break;
        }
      }
    } catch (err) {
      // C5 (W19): the stage loop is the only place pipelineEnd is
      // normally fired; an uncaught throw from a tool or a stage
      // would skip that path and leave the client spinning. Surface
      // the error to the SSE stream here so the client always sees
      // a terminal event.
      const msg = err instanceof Error ? err.message : String(err);
      failed = failed ?? 'unknown';
      failedErr = failedErr ?? msg;
      safeWrite(res, 'failed', { taskId: ctx.taskId, stage: failed, error: msg });
    } finally {
      // C5 (W19): always emit the final pipelineEnd frame, even when
      // the loop was aborted (client disconnect) or crashed. The
      // safeWrite helper is a no-op if the response is already
      // closed, so this is safe to call unconditionally.
      const endPayload: Record<string, unknown> = {
        taskId: ctx.taskId,
        success: !failed && !aborted,
        failed,
        error: failedErr,
        aborted,
        createdFiles: currentCtx.createdFiles,
        modifiedFiles: currentCtx.modifiedFiles,
        phaseHistory: currentCtx.phaseHistory,
        toolCalls,
      };
      if (safeWrite(res, 'pipeline-end', endPayload)) {
        pipelineEndSent = true;
      }
    }

    if (pipelineEndSent) {
      if (failed) {
        incrementAgentRun();
        updateEmotionFromInteraction({ intensity: 8, name: 'frustrated' });
      } else {
        incrementAgentRun();
        updateEmotionFromInteraction({ intensity: 12, name: 'confident' });
      }
    }

    try {
      res.end();
    } catch {
      // Best-effort: socket may already be closed by the client.
    }
  });

  return r;
}
