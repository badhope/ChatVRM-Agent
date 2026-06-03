import { Router, type Request, type Response } from 'express';
import { randomUUID } from 'node:crypto';
import type { LLMAdapter } from '../../src/adapters/llm.adapter.js';
import type { ConfigAdapter } from '../../src/adapters/config.adapter.js';
import type { MemoryAdapter } from '../../src/adapters/memory.adapter.js';
import { SessionStore } from '../session-store.js';
import { resolveApiKey } from '../providers.js';
import { updateEmotionFromInteraction } from './emotion.routes.js';
import { incrementToolCall } from './dashboard.routes.js';
import type { ProviderType } from '../../src/ports/config.port.js';
import type { ChatMessage } from './types.js';
import { PROVIDER_META } from '../providers.js';

interface ChatDeps {
  llm: LLMAdapter;
  config: ConfigAdapter;
  memory: MemoryAdapter;
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
    let aborted = false;
    req.on('close', () => {
      aborted = true;
    });

    sseSend(res, 'assistant-start', { id: assistantId, provider: useProvider, model: model ?? meta.defaultModel });

    try {
      for await (const chunk of deps.llm.stream({
        provider: useProvider,
        model: model ?? meta.defaultModel,
        messages,
        temperature: 0.7,
        maxTokens: 2048,
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
    } catch {
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
