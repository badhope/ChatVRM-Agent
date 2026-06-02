import { Router, type Request, type Response } from 'express';
import type { ConfigAdapter } from '../../src/adapters/config.adapter.js';
import type { LLMAdapter } from '../../src/adapters/llm.adapter.js';
import { PROVIDER_META, PROVIDER_BASE_URLS, resolveApiKey } from '../providers.js';
import type { ProviderType } from '../../src/ports/config.port.js';

export function configRoutes(cfg: ConfigAdapter, llm: LLMAdapter): Router {
  const r = Router();

  r.get('/providers', async (_req, res) => {
    const enriched = await Promise.all(
      PROVIDER_META.map(async (p) => {
        const hasKey = !!(await resolveApiKey(cfg, p.id));
        return { ...p, baseUrl: PROVIDER_BASE_URLS[p.id], hasKey };
      }),
    );
    res.json(enriched);
  });

  r.get('/snapshot', async (_req, res) => {
    await cfg.init();
    const defaultProvider = await cfg.getDefaultProvider();
    const all = await cfg.getAllConfig();
    const apiKeys = ((all.apiKeys as Record<string, string>) ?? {}) as Record<string, string>;
    const masked: Record<string, string> = {};
    for (const [k, v] of Object.entries(apiKeys)) {
      masked[k] = v ? `${v.slice(0, 4)}…${v.slice(-4)}` : '';
    }
    res.json({
      defaultProvider,
      apiKeys: masked,
      hasKey: Object.fromEntries(Object.keys(apiKeys).map((k) => [k, true])),
      chat: (all.chat as Record<string, unknown>) ?? {},
      sandbox: (all.sandbox as Record<string, unknown>) ?? {},
      circuitBreaker: (all.circuitBreaker as Record<string, unknown>) ?? {},
    });
  });

  r.post('/set-key', async (req: Request, res: Response) => {
    const { provider, key } = req.body as { provider: ProviderType; key: string };
    if (!provider || !key) {
      res.status(400).json({ error: 'provider and key are required' });
      return;
    }
    if (!PROVIDER_META.find((p) => p.id === provider)) {
      res.status(400).json({ error: `unknown provider "${provider}"` });
      return;
    }
    await cfg.setApiKey(provider, key);
    res.json({ ok: true });
  });

  r.post('/remove-key', async (req: Request, res: Response) => {
    const { provider } = req.body as { provider: ProviderType };
    if (!provider) {
      res.status(400).json({ error: 'provider is required' });
      return;
    }
    await cfg.removeApiKey(provider);
    res.json({ ok: true });
  });

  r.post('/set-default', async (req: Request, res: Response) => {
    const { provider } = req.body as { provider: ProviderType };
    if (!provider) {
      res.status(400).json({ error: 'provider is required' });
      return;
    }
    await cfg.setDefaultProvider(provider);
    res.json({ ok: true });
  });

  r.post('/set-chat-config', async (req: Request, res: Response) => {
    const { model, temperature, maxTokens, systemPrompt } = req.body as Record<string, unknown>;
    await cfg.updateChatConfig({
      model: typeof model === 'string' ? model : undefined,
      temperature: typeof temperature === 'number' ? temperature : undefined,
      maxTokens: typeof maxTokens === 'number' ? maxTokens : undefined,
      systemPrompt: typeof systemPrompt === 'string' ? systemPrompt : undefined,
    });
    res.json({ ok: true });
  });

  r.post('/test', async (req: Request, res: Response) => {
    const { provider } = req.body as { provider: ProviderType };
    if (!provider) {
      res.status(400).json({ error: 'provider is required' });
      return;
    }
    try {
      const available = await llm.isAvailable(provider);
      res.json({ available });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  r.post('/test-message', async (req: Request, res: Response) => {
    const { provider, model, message } = req.body as { provider: ProviderType; model?: string; message?: string };
    if (!provider) {
      res.status(400).json({ error: 'provider is required' });
      return;
    }
    try {
      const response = await llm.chat({
        provider,
        model,
        messages: [{ role: 'user', content: message ?? 'say "ok" in one word' }],
        maxTokens: 16,
        temperature: 0,
      });
      res.json({ ok: true, content: response.content, model: response.model });
    } catch (err) {
      res.status(502).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  });

  return r;
}
