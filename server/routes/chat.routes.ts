import { Router, type Request, type Response } from 'express';
import { randomUUID } from 'node:crypto';
import type { ILLMPort } from '../../src/ports/llm.port.js';
import type { IConfigPort } from '../../src/ports/config.port.js';
import type { IMemoryPort } from '../../src/ports/memory.port.js';
import { SessionStore } from '../session-store.js';
import { resolveApiKey } from '../providers.js';
import { updateEmotionFromInteraction } from './emotion.routes.js';
import { incrementToolCall } from './dashboard.routes.js';
import type { ProviderType } from '../../src/ports/config.port.js';
import type { ChatMessage } from '../types.js';
import { PROVIDER_META } from '../providers.js';

interface ChatDeps {
  llm: ILLMPort;
  config: IConfigPort;
  memory: IMemoryPort;
  sessions: SessionStore;
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

export function chatRoutes(deps: ChatDeps): Router {
  const r = Router();

  r.get('/sessions', async (_req, res) => {
    const list = await deps.sessions.list();
    res.json(
      list.map((s) => ({
        id: s.id,
        title: s.title,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
        messageCount: s.messages.length,
        provider: s.provider,
        model: s.model,
      })),
    );
  });

  r.post('/sessions', async (req: Request, res: Response) => {
    const { title, provider, model } = req.body as Record<string, string>;
    const session = await deps.sessions.create({ title, provider, model });
    res.json(session);
  });

  r.get('/sessions/:id', async (req, res) => {
    const session = await deps.sessions.get(req.params.id);
    if (!session) {
      res.status(404).json({ error: 'not found' });
      return;
    }
    res.json(session);
  });

  r.delete('/sessions/:id', async (req, res) => {
    const ok = await deps.sessions.remove(req.params.id);
    res.json({ ok });
  });

  r.post('/sessions/bulk-delete', async (req: Request, res: Response) => {
    const body = req.body as { ids?: unknown };
    if (!Array.isArray(body.ids)) {
      res.status(400).json({ error: 'ids must be an array of strings' });
      return;
    }
    const ids = (body.ids as unknown[]).filter((x): x is string => typeof x === 'string');
    const result = await deps.sessions.removeMany(ids);
    res.json({ ok: true, ...result });
  });

  r.post('/sessions/clear', async (_req, res) => {
    const list = await deps.sessions.list();
    const ids = list.map((s) => s.id);
    const result = await deps.sessions.removeMany(ids);
    res.json({ ok: true, ...result });
  });

  r.patch('/sessions/:id', async (req, res) => {
    const { title } = req.body as { title?: string };
    if (title) await deps.sessions.rename(req.params.id, title);
    res.json({ ok: true });
  });

  r.post('/stream', async (req: Request, res: Response) => {
    const { sessionId, message, provider, model, systemPrompt } = req.body as {
      sessionId?: string;
      message: string;
      provider?: ProviderType;
      model?: string;
      systemPrompt?: string;
    };

    if (!message) {
      res.status(400).json({ error: 'message is required' });
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

    let session = sessionId ? await deps.sessions.get(sessionId) : null;
    if (!session) {
      if (sessionId) {
        res.status(404).json({ error: `session "${sessionId}" not found` });
        return;
      }
      session = await deps.sessions.create({
        title: message.slice(0, 40),
        provider: useProvider,
        model,
      });
    }

    sseHeaders(res);

    sseSend(res, 'session', { id: session.id, title: session.title });

    const userMsg: ChatMessage = {
      id: randomUUID(),
      role: 'user',
      content: message,
      createdAt: new Date().toISOString(),
    };
    await deps.sessions.appendMessage(session.id, userMsg);
    sseSend(res, 'user-message', userMsg);

    const assistantId = randomUUID();
    const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [];
    if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
    for (const m of session.messages) {
      messages.push({ role: m.role, content: m.content });
    }
    messages.push({ role: 'user', content: message });

    let accumulated = '';
    const abortController = new AbortController();
    let aborted = false;
    req.on('close', () => {
      aborted = true;
      try {
        abortController.abort();
      } catch {
      }
    });

    // C5 (W19) / M18 (W19): SSE keep-alive heartbeat. Long LLM
    // streams can spend 30+ seconds emitting nothing, which makes
    // intermediaries (nginx, ALB, Cloudflare) silently drop the
    // connection. We send a `:keep-alive` SSE comment every 15s.
    // The agent.routes.ts handler ships the same heartbeat
    // pattern; we replicate it here so /api/chat/stream behaves
    // the same way.
    const HEARTBEAT_MS = 15_000;
    const heartbeat = setInterval(() => {
      if (aborted || res.writableEnded) return;
      try {
        res.write(':keep-alive\n\n');
      } catch {
        /* best-effort */
      }
    }, HEARTBEAT_MS);
    const stopHeartbeat = () => clearInterval(heartbeat);
    res.on('close', stopHeartbeat);
    res.on('finish', stopHeartbeat);

    sseSend(res, 'assistant-start', { id: assistantId, provider: useProvider, model: model ?? meta.defaultModel });

    try {
      for await (const chunk of deps.llm.stream({
        provider: useProvider,
        model: model ?? meta.defaultModel,
        messages,
        temperature: 0.7,
        maxTokens: 2048,
        signal: abortController.signal,
      })) {
        if (aborted) break;
        if (chunk.content) {
          accumulated += chunk.content;
          sseSend(res, 'chunk', { content: chunk.content, done: false });
        }
        if (chunk.done) break;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      sseSend(res, 'error', { message: msg });
    }

    const assistantMsg: ChatMessage = {
      id: assistantId,
      role: 'assistant',
      content: accumulated,
      createdAt: new Date().toISOString(),
      provider: useProvider,
      model: model ?? meta.defaultModel,
    };
    // H13 (W19): when the client disconnects mid-stream, the SSE
    // write of `assistant-end` is the only signal that the loop
    // ended. The assistant message still gets appended to the
    // session (so the user sees it on reload), but the content is
    // truncated. A subsequent turn would have no idea the
    // previous turn was a user-initiated abort, so the model
    // would happily continue from a context that looks complete.
    // We append a system note to the session's history so the
    // next turn's prompt carries the "[response truncated by
    // user abort]" annotation. We only do this when the abort
    // actually happened (so a normal stream end is unaffected).
    if (aborted) {
      const note: ChatMessage = {
        id: randomUUID(),
        role: 'system',
        content: '[response truncated by user abort]',
        createdAt: new Date().toISOString(),
      };
      try {
        await deps.sessions.appendMessage(session.id, note);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        process.stderr.write(`[chat] abort-note append failed: ${msg}\n`);
      }
    }
    await deps.sessions.appendMessage(session.id, assistantMsg);
    sseSend(res, 'assistant-end', { id: assistantId, length: accumulated.length });

    try {
      await deps.memory.remember({
        input: message,
        output: accumulated.slice(0, 2000),
        provider: useProvider,
        model: model ?? meta.defaultModel,
        tags: ['chat', useProvider],
      });
      incrementToolCall();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      process.stderr.write(`[chat] memory write failed: ${msg}\n`);
    }

    if (accumulated.length > 0) {
      const lower = message.toLowerCase();
      const positive = ['great', 'thanks', 'amazing', 'perfect', 'love', 'good'].filter((k) => lower.includes(k)).length;
      const negative = ['bad', 'wrong', 'error', 'broken', 'useless'].filter((k) => lower.includes(k)).length;
      const intensityDelta = positive * 6 - negative * 8;
      if (intensityDelta !== 0) {
        updateEmotionFromInteraction({ intensity: intensityDelta });
      }
    }

    res.end();
  });

  return r;
}
