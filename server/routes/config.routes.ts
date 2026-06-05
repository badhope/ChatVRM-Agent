import { Router, type Request, type Response } from 'express';
import type { IConfigPort, ProviderType, EnvVarSnapshot } from '../../src/ports/config.port.js';
import type { ILLMPort } from '../../src/ports/llm.port.js';
import { PROVIDER_META, PROVIDER_BASE_URLS, resolveApiKey } from '../providers.js';

const ENV_BASE_URL_KEYS: Record<ProviderType, string> = {
  openai: 'OPENAI_BASE_URL',
  anthropic: 'ANTHROPIC_BASE_URL',
  google: 'GOOGLE_BASE_URL',
  deepseek: 'DEEPSEEK_BASE_URL',
  siliconflow: 'SILICONFLOW_BASE_URL',
  aliyun: 'ALIYUN_BASE_URL',
  zhipu: 'ZHIPU_BASE_URL',
  baidu: 'BAIDU_BASE_URL',
  ollama: 'OLLAMA_BASE_URL',
  lmstudio: 'LMSTUDIO_BASE_URL',
};

function envSnapshotFor(provider: ProviderType): EnvVarSnapshot {
  const upper = provider.toUpperCase();
  const apiKeyEnv = [
    { name: `PERSONAL_ASSISTANT_${upper}`, set: false, length: 0 },
    { name: `${upper}_API_KEY`, set: false, length: 0 },
  ].map((e) => {
    const v = process.env[e.name];
    if (v && v.length > 0) return { name: e.name, set: true, length: v.length };
    return e;
  });
  const baseName = ENV_BASE_URL_KEYS[provider];
  const baseVal = process.env[baseName];
  return {
    provider,
    apiKeyEnv,
    baseUrlEnv: { name: baseName, set: !!baseVal && baseVal.length > 0, value: baseVal },
  };
}

export function configRoutes(cfg: IConfigPort, llm: ILLMPort): Router {
  const r = Router();

  // ───────────────────────────────────────────────────────────────────────────
  // Providers
  // ───────────────────────────────────────────────────────────────────────────
  r.get('/providers', async (_req, res) => {
    const enriched = await Promise.all(
      PROVIDER_META.map(async (p) => {
        const hasKey = !!(await resolveApiKey(cfg, p.id));
        const configuredBaseUrl = await cfg.getBaseUrl(p.id);
        const effectiveBaseUrl = configuredBaseUrl ?? PROVIDER_BASE_URLS[p.id];
        return {
          ...p,
          baseUrl: effectiveBaseUrl,
          defaultBaseUrl: PROVIDER_BASE_URLS[p.id],
          hasKey,
          isCustomBaseUrl: !!configuredBaseUrl,
        };
      }),
    );
    res.json(enriched);
  });

  /** Per-provider discovered model list, with graceful fallback to the default model. */
  r.get('/providers/:id/models', async (req, res) => {
    const id = req.params.id as ProviderType;
    const meta = PROVIDER_META.find((p) => p.id === id);
    if (!meta) {
      res.status(404).json({ error: `unknown provider "${id}"` });
      return;
    }
    try {
      const models = await llm.listModels(id);
      res.json({ provider: id, models });
    } catch (err) {
      // Return just the default so the UI can still render a non-empty dropdown
      res.json({
        provider: id,
        models: [meta.defaultModel],
        warning: err instanceof Error ? err.message : String(err),
      });
    }
  });

  /**
   * Force a fresh model scan for a provider. Same response shape as GET, but
   * always re-fetches from the upstream API and updates the in-memory cache
   * so subsequent GETs return the latest list.
   */
  r.post('/providers/:id/models/scan', async (req, res) => {
    const id = req.params.id as ProviderType;
    const meta = PROVIDER_META.find((p) => p.id === id);
    if (!meta) {
      res.status(404).json({ error: `unknown provider "${id}"` });
      return;
    }
    try {
      const models = await llm.listModels(id);
      res.json({
        provider: id,
        models,
        scannedAt: new Date().toISOString(),
        count: models.length,
      });
    } catch (err) {
      res.status(502).json({
        provider: id,
        models: [meta.defaultModel],
        scannedAt: new Date().toISOString(),
        count: 1,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  /**
   * Test a single model with a tiny prompt. Used by the UI to show per-model
   * availability and to support the "scan + pick" workflow.
   */
  r.post('/providers/:id/test-model', async (req, res) => {
    const id = req.params.id as ProviderType;
    const { model, message } = req.body as { model?: string; message?: string };
    const meta = PROVIDER_META.find((p) => p.id === id);
    if (!meta) {
      res.status(404).json({ error: `unknown provider "${id}"` });
      return;
    }
    if (!model) {
      res.status(400).json({ error: 'model is required' });
      return;
    }
    const startedAt = Date.now();
    try {
      const chatFn = llm.chatExact ?? llm.chat;
      const r = await chatFn({
        provider: id,
        model,
        messages: [{ role: 'user', content: message ?? 'Reply with one word: ready' }],
        maxTokens: 16,
        temperature: 0,
      });
      res.json({
        ok: true,
        provider: id,
        model: r.model,
        content: r.content,
        latencyMs: Date.now() - startedAt,
        testedAt: new Date(startedAt).toISOString(),
      });
    } catch (err) {
      res.json({
        ok: false,
        provider: id,
        model,
        error: err instanceof Error ? err.message : String(err),
        latencyMs: Date.now() - startedAt,
        testedAt: new Date(startedAt).toISOString(),
      });
    }
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Full snapshot (kept for backwards compatibility; new code should call
  // the specific /chat /sandbox /circuit-breaker endpoints below).
  // ───────────────────────────────────────────────────────────────────────────
  r.get('/snapshot', async (_req, res) => {
    await cfg.init();
    const defaultProvider = await cfg.getDefaultProvider();
    // H16: ask the config layer for the *raw* keys; we apply the
    // server-side masking here so the response is consistently safe and
    // the masking policy lives in one place. (Default `getAllConfig()`
    // is now redacted, so passing the redacted value through this mask
    // would just re-mask a redacted string.)
    const all = await cfg.getAllConfig({ revealSecrets: true });
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

  // ───────────────────────────────────────────────────────────────────────────
  // Default provider
  // ───────────────────────────────────────────────────────────────────────────
  r.post('/set-default', async (req: Request, res: Response) => {
    const { provider } = req.body as { provider: ProviderType };
    if (!provider) {
      res.status(400).json({ error: 'provider is required' });
      return;
    }
    if (!PROVIDER_META.find((p) => p.id === provider)) {
      res.status(400).json({ error: `unknown provider "${provider}"` });
      return;
    }
    await cfg.setDefaultProvider(provider);
    res.json({ ok: true });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // API keys & base URLs
  // ───────────────────────────────────────────────────────────────────────────
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

  r.post('/set-base-url', async (req: Request, res: Response) => {
    const { provider, baseUrl } = req.body as { provider: ProviderType; baseUrl: string };
    if (!provider || typeof baseUrl !== 'string') {
      res.status(400).json({ error: 'provider and baseUrl are required' });
      return;
    }
    if (!PROVIDER_META.find((p) => p.id === provider)) {
      res.status(400).json({ error: `unknown provider "${provider}"` });
      return;
    }
    const trimmed = baseUrl.trim();
    if (trimmed.length > 0) {
      let parsed: URL;
      try {
        parsed = new URL(trimmed);
      } catch {
        res.status(400).json({ error: `baseUrl "${trimmed}" is not a valid URL` });
        return;
      }
      // W17 M11: an LLM-facing base URL is supposed to point at an
      // HTTP(S) API. Accepting arbitrary schemes (e.g. `javascript:`,
      // `file:`, `data:`) lets a misconfigured client smuggle the
      // wrong value into the LLM. Whitelist the two useful schemes.
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        res
          .status(400)
          .json({ error: `baseUrl "${trimmed}" must use http or https (got ${parsed.protocol})` });
        return;
      }
    }
    await cfg.setBaseUrl(provider, trimmed);
    res.json({ ok: true });
  });

  r.post('/reset-base-url', async (req: Request, res: Response) => {
    const { provider } = req.body as { provider: ProviderType };
    if (!provider) {
      res.status(400).json({ error: 'provider is required' });
      return;
    }
    await cfg.resetBaseUrl(provider);
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

  // ───────────────────────────────────────────────────────────────────────────
  // Chat defaults (model, temperature, top_p, system prompt, ...)
  // ───────────────────────────────────────────────────────────────────────────
  r.get('/chat', async (_req, res) => {
    await cfg.init();
    const chat = await cfg.getChatConfig();
    const defaultProvider = await cfg.getDefaultProvider();
    res.json({ ...chat, defaultProvider });
  });

  r.put('/chat', async (req: Request, res: Response) => {
    const { model, temperature, maxTokens, topP, presencePenalty, frequencyPenalty, systemPrompt, fallbackModels } =
      req.body as Record<string, unknown>;
    const update: Record<string, unknown> = {};
    if (typeof model === 'string') update.model = model;
    if (typeof temperature === 'number') update.temperature = temperature;
    if (typeof maxTokens === 'number') update.maxTokens = maxTokens;
    if (typeof topP === 'number') update.topP = topP;
    if (typeof presencePenalty === 'number') update.presencePenalty = presencePenalty;
    if (typeof frequencyPenalty === 'number') update.frequencyPenalty = frequencyPenalty;
    if (typeof systemPrompt === 'string') update.systemPrompt = systemPrompt;
    if (Array.isArray(fallbackModels)) {
      update.fallbackModels = (fallbackModels as unknown[])
        .filter((m): m is string => typeof m === 'string' && m.length > 0)
        .slice(0, 10);
    }
    await cfg.updateChatConfig(update);
    res.json({ ok: true, applied: update });
  });

  // Backwards-compatible alias for the old single endpoint shape
  r.post('/set-chat-config', async (req: Request, res: Response) => {
    const { model, temperature, maxTokens, topP, presencePenalty, frequencyPenalty, systemPrompt, fallbackModels } =
      req.body as Record<string, unknown>;
    const update: Record<string, unknown> = {};
    if (typeof model === 'string') update.model = model;
    if (typeof temperature === 'number') update.temperature = temperature;
    if (typeof maxTokens === 'number') update.maxTokens = maxTokens;
    if (typeof topP === 'number') update.topP = topP;
    if (typeof presencePenalty === 'number') update.presencePenalty = presencePenalty;
    if (typeof frequencyPenalty === 'number') update.frequencyPenalty = frequencyPenalty;
    if (typeof systemPrompt === 'string') update.systemPrompt = systemPrompt;
    await cfg.updateChatConfig(update);
    res.json({ ok: true, applied: update });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Sandbox (tool execution)
  // ───────────────────────────────────────────────────────────────────────────
  r.get('/sandbox', async (_req, res) => {
    await cfg.init();
    res.json(await cfg.getSandboxConfig());
  });

  r.put('/sandbox', async (req: Request, res: Response) => {
    const { enabled, allowedCommands, timeout, workingDirectory } = req.body as Record<string, unknown>;
    const update: Record<string, unknown> = {};
    if (typeof enabled === 'boolean') update.enabled = enabled;
    if (Array.isArray(allowedCommands)) update.allowedCommands = allowedCommands.filter((c) => typeof c === 'string');
    if (typeof timeout === 'number') update.timeout = timeout;
    if (typeof workingDirectory === 'string') update.workingDirectory = workingDirectory;
    await cfg.updateSandboxConfig(update);
    res.json({ ok: true, applied: update });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Circuit breaker (reliability)
  // ───────────────────────────────────────────────────────────────────────────
  r.get('/circuit-breaker', async (_req, res) => {
    await cfg.init();
    const config = await cfg.getCircuitBreakerConfig();
    const live = (llm as unknown as {
      getCircuitBreakerSnapshots?: () => unknown[];
    }).getCircuitBreakerSnapshots?.() ?? [];
    res.json({ config, live });
  });

  r.put('/circuit-breaker', async (req: Request, res: Response) => {
    const { enabled, failureThreshold, resetTimeout, halfOpenMaxCalls } = req.body as Record<string, unknown>;
    const update: Record<string, unknown> = {};
    if (typeof enabled === 'boolean') update.enabled = enabled;
    if (typeof failureThreshold === 'number') update.failureThreshold = failureThreshold;
    if (typeof resetTimeout === 'number') update.resetTimeout = resetTimeout;
    if (typeof halfOpenMaxCalls === 'number') update.halfOpenMaxCalls = halfOpenMaxCalls;
    await cfg.updateCircuitBreakerConfig(update);
    res.json({ ok: true, applied: update });
  });

  r.post('/circuit-breaker/reset', async (req: Request, res: Response) => {
    const { provider } = req.body as { provider?: ProviderType };
    const adapter = llm as unknown as {
      resetCircuitBreaker: (p: ProviderType) => void;
      resetAllCircuitBreakers: () => void;
    };
    if (provider) {
      if (!PROVIDER_META.find((p) => p.id === provider)) {
        res.status(400).json({ error: `unknown provider "${provider}"` });
        return;
      }
      adapter.resetCircuitBreaker(provider);
    } else {
      adapter.resetAllCircuitBreakers();
    }
    res.json({ ok: true });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Connection tests
  // ───────────────────────────────────────────────────────────────────────────
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

  // ───────────────────────────────────────────────────────────────────────────
  // Data management (export / import / reset / file path)
  // ───────────────────────────────────────────────────────────────────────────
  r.get('/file-path', async (_req, res) => {
    const meta = await cfg.getFileMeta();
    res.json(meta);
  });

  r.get('/export', async (_req, res) => {
    const data = await cfg.export();
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.setHeader('content-disposition', `attachment; filename="personal-assistant-config.json"`);
    res.send(JSON.stringify(data, null, 2));
  });

  r.post('/import', async (req: Request, res: Response) => {
    if (!req.body || typeof req.body !== 'object') {
      res.status(400).json({ error: 'body must be a JSON object' });
      return;
    }
    try {
      await cfg.import(req.body as Record<string, unknown>);
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  r.post('/reset', async (_req, res: Response) => {
    try {
      await cfg.reset();
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Environment variables (for "what is overriding what" transparency)
  // ───────────────────────────────────────────────────────────────────────────
  r.get('/env', async (_req, res) => {
    res.json(PROVIDER_META.map((p) => envSnapshotFor(p.id)));
  });

  return r;
}
