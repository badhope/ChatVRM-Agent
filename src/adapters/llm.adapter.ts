import type {
  ILLMPort,
  ChatParams,
  ChatResponse,
  StreamChunk,
} from '../ports/llm.port.js';
import type {
  ProviderType,
  IConfigPort,
  CircuitBreakerSnapshot,
} from '../ports/config.port.js';
import { CircuitBreaker } from '../infrastructure/circuit-breaker.js';

const DEFAULT_BASE_URLS: Record<ProviderType, string> = {
  openai: 'https://api.openai.com/v1',
  anthropic: 'https://api.anthropic.com',
  google: 'https://generativelanguage.googleapis.com/v1beta',
  deepseek: 'https://api.deepseek.com/v1',
  siliconflow: 'https://api.siliconflow.cn/v1',
  aliyun: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  zhipu: 'https://open.bigmodel.cn/api/paas/v4',
  baidu: 'https://aip.baidubce.com/rpc/2.0/ai_custom/v1',
  ollama: 'http://localhost:11434/v1',
  lmstudio: 'http://localhost:1234/v1',
};

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

const PROVIDER_BASE_URLS: Record<ProviderType, string> = new Proxy(DEFAULT_BASE_URLS, {
  get(target, prop: string) {
    const envKey = ENV_BASE_URL_KEYS[prop as ProviderType];
    if (envKey) {
      const envVal = process.env[envKey];
      if (envVal && envVal.length > 0) return envVal;
    }
    return target[prop as ProviderType];
  },
});

const DEFAULT_MODELS: Record<ProviderType, string> = {
  openai: 'gpt-4o',
  anthropic: 'claude-3-5-sonnet-20241022',
  google: 'gemini-2.0-flash',
  deepseek: 'deepseek-chat',
  siliconflow: 'Qwen/Qwen2.5-7B-Instruct',
  aliyun: 'qwen-plus',
  zhipu: 'glm-4',
  baidu: 'ernie-4.0-8k',
  ollama: 'llama3.2',
  lmstudio: 'local-model',
};

const STREAM_DONE_MARKER = '[DONE]';

const NO_API_KEY_REQUIRED = new Set<ProviderType>(['ollama', 'lmstudio']);

/**
 * Heuristic: can the failure be explained by THIS model being unavailable,
 * and is it worth trying the next model in the fallback chain?
 * True for HTTP 403 (quota / free-tier), 404 (model not in plan), 429 (rate-limited).
 */
function isRetryableModelError(msg: string): boolean {
  return /(?:^|\s)(403|404|429)\b/.test(msg) || /FreeTierOnly|rate.?limit|model not found|not supported/i.test(msg);
}

function combineSignals(signals: Array<AbortSignal | undefined>): AbortSignal | undefined {
  const defined = signals.filter((s): s is AbortSignal => s !== undefined);
  if (defined.length === 0) return undefined;
  if (defined.length === 1) return defined[0];
  return AbortSignal.any(defined);
}

interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: string | Array<{ type: 'text'; text: string }>;
}

interface GooglePart {
  text: string;
}

interface GoogleContent {
  role: 'user' | 'model';
  parts: GooglePart[];
}

export class LLMAdapter implements ILLMPort {
  private configPort: IConfigPort;
  private breakers: Map<ProviderType, CircuitBreaker> = new Map();

  constructor(configPort: IConfigPort) {
    this.configPort = configPort;
  }

  async chat(params: ChatParams): Promise<ChatResponse> {
    const provider = params.provider ?? (await this.configPort.getDefaultProvider());
    const breaker = this.getBreaker(provider);
    return breaker.fire(() => this.chatWithFallbacks(provider, params));
  }

  /**
   * Direct, no-fallback chat. Used by /test-model so the user sees the
   * "true" status of a specific model instead of having a fallback silently
   * save the call.
   */
  async chatExact(params: ChatParams): Promise<ChatResponse> {
    const provider = params.provider ?? (await this.configPort.getDefaultProvider());
    const breaker = this.getBreaker(provider);
    return breaker.fire(() => this.dispatchChat(provider, params));
  }

  /**
   * Try the requested model first, then walk the user's configured fallback list.
   * Only retries on transient / quota / not-found errors (403, 404, 429).
   * Returns the first model that produces a usable response.
   */
  private async chatWithFallbacks(
    provider: ProviderType,
    params: ChatParams,
  ): Promise<ChatResponse> {
    const rawCfg = this.configPort.getChatConfig();
    const chatCfg = (typeof rawCfg?.then === 'function' ? await rawCfg : rawCfg) ?? {};
    const fallbacks = (chatCfg.fallbackModels ?? []).filter((m) => m && m !== params.model);
    const tried: Array<{ model: string; error: string }> = [];

    const tryModel = async (modelName: string | undefined) => {
      try {
        const r = await this.dispatchChat(provider, { ...params, model: modelName });
        return { ok: true as const, response: r, tried };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        tried.push({ model: modelName ?? '(default)', error: msg });
        if (isRetryableModelError(msg)) {
          return { ok: false as const, retry: true };
        }
        return { ok: false as const, retry: false };
      }
    };

    const first = await tryModel(params.model);
    if (first.ok) return first.response;
    if (!first.retry) throw new Error(first.response ? '' : tried.at(-1)!.error);

    for (const fallback of fallbacks) {
      const r = await tryModel(fallback);
      if (r.ok) return r.response;
      if (!r.retry) throw new Error(tried.at(-1)!.error);
    }
    throw new Error(tried.at(-1)!.error);
  }

  async *stream(params: ChatParams): AsyncGenerator<StreamChunk> {
    const provider = params.provider ?? (await this.configPort.getDefaultProvider());
    const breaker = this.getBreaker(provider);
    const apiKey = await this.resolveApiKey(provider);
    const model = params.model ?? DEFAULT_MODELS[provider];

    if (provider === 'anthropic') {
      yield* this.streamAnthropic(apiKey, model, params, breaker);
      return;
    }
    if (provider === 'google') {
      yield* this.streamGoogle(apiKey, model, params, breaker);
      return;
    }
    if (provider === 'baidu') {
      throw new Error(
        `Streaming is not supported for provider "${provider}". Baidu Ernie requires a non-streaming chat call.`,
      );
    }
    yield* this.streamOpenAICompatible(provider, apiKey, model, params, breaker);
  }

  async listModels(provider: ProviderType): Promise<string[]> {
    const breaker = this.getBreaker(provider);
    return breaker.fire(() => this.dispatchListModels(provider));
  }

  async isAvailable(provider: ProviderType): Promise<boolean> {
    try {
      const breaker = this.getBreaker(provider);
      if (provider === 'google') {
        const apiKey = await this.configPort.getApiKey(provider);
        if (!apiKey) return false;
        return true;
      }
      if (provider === 'anthropic') {
        const apiKey = await this.configPort.getApiKey(provider);
        if (!apiKey) return false;
        return true;
      }
      await breaker.fire(() => this.doHeadRequest(provider));
      return true;
    } catch {
      return false;
    }
  }

  private getBreaker(provider: ProviderType): CircuitBreaker {
    if (!this.breakers.has(provider)) {
      this.breakers.set(provider, CircuitBreaker.createPreset('llm'));
    }
    return this.breakers.get(provider)!;
  }

  /**
   * Live circuit breaker state for every provider we've talked to. Used by
   * the Config page "Reliability" panel to render state, failures, successes.
   */
  getCircuitBreakerSnapshots(): CircuitBreakerSnapshot[] {
    const providers: ProviderType[] = Object.keys(DEFAULT_BASE_URLS) as ProviderType[];
    return providers.map((p) => {
      const breaker = this.breakers.get(p);
      if (!breaker) {
        return { provider: p, state: 'CLOSED', failures: 0, successes: 0 };
      }
      const stats = breaker.getStats();
      return {
        provider: p,
        state: stats.state,
        failures: stats.failures,
        successes: stats.successes,
      };
    });
  }

  /**
   * Force-close a provider's circuit breaker (e.g. after the user fixes a
   * bad key). Also clears accumulated stats.
   */
  resetCircuitBreaker(provider: ProviderType): void {
    const breaker = this.breakers.get(provider);
    if (breaker) breaker.reset();
  }

  resetAllCircuitBreakers(): void {
    for (const breaker of this.breakers.values()) {
      breaker.reset();
    }
  }

  private async getBaseUrl(provider: ProviderType): Promise<string> {
    const configured = await this.configPort.getBaseUrl(provider);
    if (configured && configured.length > 0) return configured;
    return PROVIDER_BASE_URLS[provider];
  }

  private async resolveApiKey(provider: ProviderType): Promise<string | undefined> {
    let key = await this.configPort.getApiKey(provider);
    if (key && key.length > 0) return key.trim();
    const envCandidates = [
      `PERSONAL_ASSISTANT_${provider.toUpperCase()}`,
      `${provider.toUpperCase()}_API_KEY`,
    ];
    for (const envKey of envCandidates) {
      const val = process.env[envKey];
      if (val && val.length > 0) return val.trim();
    }
    return undefined;
  }

  private async dispatchChat(provider: ProviderType, params: ChatParams): Promise<ChatResponse> {
    const apiKey = await this.resolveApiKey(provider);
    const model = params.model ?? DEFAULT_MODELS[provider];

    if (provider === 'anthropic') {
      return this.chatAnthropic(apiKey, model, params);
    }
    if (provider === 'google') {
      return this.chatGoogle(apiKey, model, params);
    }
    if (provider === 'baidu') {
      return this.chatBaidu(apiKey, model, params);
    }
    return this.chatOpenAICompatible(provider, apiKey, model, params);
  }

  private async chatOpenAICompatible(
    provider: ProviderType,
    apiKey: string | undefined,
    model: string,
    params: ChatParams,
  ): Promise<ChatResponse> {
    const baseUrl = await this.getBaseUrl(provider);
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (apiKey && !NO_API_KEY_REQUIRED.has(provider)) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    const body = JSON.stringify({
      model,
      messages: params.messages,
      temperature: params.temperature,
      max_tokens: params.maxTokens,
      stream: false,
    });

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers,
      body,
      signal: combineSignals([AbortSignal.timeout(120_000), params.signal]),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(`LLM request failed (${provider}): ${response.status} ${errorText}`);
    }

    const json = (await response.json()) as Record<string, unknown>;
    const choice = (json.choices as Array<Record<string, unknown>>)?.[0];
    const message = choice?.message as Record<string, unknown> | undefined;

    return {
      content: (message?.content as string) ?? '',
      model: (json.model as string) ?? model,
      usage: {
        promptTokens: (json.usage as Record<string, number>)?.prompt_tokens ?? 0,
        completionTokens: (json.usage as Record<string, number>)?.completion_tokens ?? 0,
        totalTokens: (json.usage as Record<string, number>)?.total_tokens ?? 0,
      },
    };
  }

  private async chatAnthropic(apiKey: string | undefined, model: string, params: ChatParams): Promise<ChatResponse> {
    if (!apiKey) {
      throw new Error('Anthropic API key is required');
    }

    const systemPrompt = params.messages.find((m) => m.role === 'system')?.content;
    const conversationMessages = params.messages
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .map((m): AnthropicMessage => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }));

    const body: Record<string, unknown> = {
      model,
      messages: conversationMessages,
      max_tokens: params.maxTokens ?? 4096,
    };
    if (systemPrompt) body.system = systemPrompt;
    if (params.temperature !== undefined) body.temperature = params.temperature;

    const anthropicBase = await this.getBaseUrl('anthropic');
    const response = await fetch(`${anthropicBase}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
      signal: combineSignals([AbortSignal.timeout(120_000), params.signal]),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(`Anthropic request failed: ${response.status} ${errorText}`);
    }

    const json = (await response.json()) as Record<string, unknown>;
    const content = (json.content as Array<Record<string, unknown>>)?.[0];
    const text = (content?.text as string) ?? '';

    const inputTokens = (json.usage as Record<string, number>)?.input_tokens ?? 0;
    const outputTokens = (json.usage as Record<string, number>)?.output_tokens ?? 0;

    return {
      content: text,
      model: (json.model as string) ?? model,
      usage: {
        promptTokens: inputTokens,
        completionTokens: outputTokens,
        totalTokens: inputTokens + outputTokens,
      },
    };
  }

  private async chatGoogle(apiKey: string | undefined, model: string, params: ChatParams): Promise<ChatResponse> {
    if (!apiKey) {
      throw new Error('Google API key is required');
    }

    const systemInstruction = params.messages.find((m) => m.role === 'system')?.content;
    const contents: GoogleContent[] = [];
    for (const m of params.messages) {
      if (m.role === 'system') continue;
      contents.push({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      });
    }

    const body: Record<string, unknown> = { contents };
    if (systemInstruction) {
      body.systemInstruction = { parts: [{ text: systemInstruction }] };
    }
    const generationConfig: Record<string, unknown> = {};
    if (params.temperature !== undefined) generationConfig.temperature = params.temperature;
    if (params.maxTokens !== undefined) generationConfig.maxOutputTokens = params.maxTokens;
    if (Object.keys(generationConfig).length > 0) body.generationConfig = generationConfig;

    const googleBase = await this.getBaseUrl('google');
    const url = `${googleBase}/models/${model}:generateContent?key=${apiKey}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: combineSignals([AbortSignal.timeout(120_000), params.signal]),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(`Google request failed: ${response.status} ${errorText}`);
    }

    const json = (await response.json()) as Record<string, unknown>;
    const candidates = (json.candidates as Array<Record<string, unknown>>) ?? [];
    const firstCandidate = candidates[0];
    const content = firstCandidate?.content as Record<string, unknown> | undefined;
    const parts = (content?.parts as Array<Record<string, unknown>>) ?? [];
    const text = parts.map((p) => (p.text as string) ?? '').join('');

    const usageMeta = (json.usageMetadata as Record<string, number>) ?? {};
    const promptTokens = usageMeta.promptTokenCount ?? 0;
    const completionTokens = usageMeta.candidatesTokenCount ?? 0;

    return {
      content: text,
      model,
      usage: {
        promptTokens,
        completionTokens,
        totalTokens: usageMeta.totalTokenCount ?? promptTokens + completionTokens,
      },
    };
  }

  private async chatBaidu(apiKey: string | undefined, model: string, params: ChatParams): Promise<ChatResponse> {
    if (!apiKey) {
      throw new Error('Baidu API key is required');
    }

    const systemPrompt = params.messages.find((m) => m.role === 'system')?.content;
    const lastUserMessage = [...params.messages].reverse().find((m) => m.role === 'user');
    if (!lastUserMessage) {
      throw new Error('Baidu requires at least one user message');
    }

    const body: Record<string, unknown> = {
      messages: [
        ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
        ...params.messages.filter((m) => m.role !== 'system'),
      ],
    };

    const baiduBase = await this.getBaseUrl('baidu');
    const url = `${baiduBase}/wenxinworkshop/chat/${model}?access_token=${apiKey}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: combineSignals([AbortSignal.timeout(120_000), params.signal]),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(`Baidu request failed: ${response.status} ${errorText}`);
    }

    const json = (await response.json()) as Record<string, unknown>;
    const result = (json.result as string) ?? '';

    const usage = (json.usage as Record<string, number>) ?? {};
    const promptTokens = usage.prompt_tokens ?? 0;
    const completionTokens = usage.completion_tokens ?? 0;

    return {
      content: result,
      model,
      usage: {
        promptTokens,
        completionTokens,
        totalTokens: usage.total_tokens ?? promptTokens + completionTokens,
      },
    };
  }

  private async *streamOpenAICompatible(
    provider: ProviderType,
    apiKey: string | undefined,
    model: string,
    params: ChatParams,
    breaker: CircuitBreaker,
  ): AsyncGenerator<StreamChunk> {
    const baseUrl = await this.getBaseUrl(provider);
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (apiKey && !NO_API_KEY_REQUIRED.has(provider)) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    const body = JSON.stringify({
      model,
      messages: params.messages,
      temperature: params.temperature,
      max_tokens: params.maxTokens,
      stream: true,
    });

    const response = await breaker.fire(() =>
      fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers,
        body,
        signal: combineSignals([AbortSignal.timeout(120_000), params.signal]),
      }),
    );

    if (!response.ok || !response.body) {
      const errorText = await response.text().catch(() => '');
      throw new Error(`LLM stream request failed (${provider}): ${response.status} ${errorText}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data: ')) continue;

          const data = trimmed.slice(6);
          if (data === STREAM_DONE_MARKER) {
            yield { content: '', done: true };
            return;
          }

          try {
            const parsed = JSON.parse(data);
            const delta = parsed.choices?.[0]?.delta?.content ?? '';
            yield { content: delta, done: false };
          } catch {
            continue;
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    yield { content: '', done: true };
  }

  private async *streamAnthropic(
    apiKey: string | undefined,
    model: string,
    params: ChatParams,
    breaker: CircuitBreaker,
  ): AsyncGenerator<StreamChunk> {
    if (!apiKey) {
      throw new Error('Anthropic API key is required');
    }

    const systemPrompt = params.messages.find((m) => m.role === 'system')?.content;
    const conversationMessages = params.messages
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .map((m): AnthropicMessage => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }));

    const body: Record<string, unknown> = {
      model,
      messages: conversationMessages,
      max_tokens: params.maxTokens ?? 4096,
      stream: true,
    };
    if (systemPrompt) body.system = systemPrompt;
    if (params.temperature !== undefined) body.temperature = params.temperature;

    const anthropicBase = await this.getBaseUrl('anthropic');
    const response = await breaker.fire(() =>
      fetch(`${anthropicBase}/v1/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(body),
        signal: combineSignals([AbortSignal.timeout(120_000), params.signal]),
      }),
    );

    if (!response.ok || !response.body) {
      const errorText = await response.text().catch(() => '');
      throw new Error(`Anthropic stream failed: ${response.status} ${errorText}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data: ')) continue;
          const data = trimmed.slice(6);
          if (!data || data === STREAM_DONE_MARKER) continue;

          try {
            const parsed = JSON.parse(data);
            if (parsed.type === 'content_block_delta' && parsed.delta?.type === 'text_delta') {
              yield { content: (parsed.delta.text as string) ?? '', done: false };
            } else if (parsed.type === 'message_stop') {
              yield { content: '', done: true };
              return;
            }
          } catch {
            continue;
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    yield { content: '', done: true };
  }

  private async *streamGoogle(
    apiKey: string | undefined,
    model: string,
    params: ChatParams,
    breaker: CircuitBreaker,
  ): AsyncGenerator<StreamChunk> {
    if (!apiKey) {
      throw new Error('Google API key is required');
    }

    const systemInstruction = params.messages.find((m) => m.role === 'system')?.content;
    const contents: GoogleContent[] = [];
    for (const m of params.messages) {
      if (m.role === 'system') continue;
      contents.push({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      });
    }

    const body: Record<string, unknown> = { contents };
    if (systemInstruction) {
      body.systemInstruction = { parts: [{ text: systemInstruction }] };
    }

    const googleBase = await this.getBaseUrl('google');
    const url = `${googleBase}/models/${model}:streamGenerateContent?alt=sse&key=${apiKey}`;
    const response = await breaker.fire(() =>
      fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: combineSignals([AbortSignal.timeout(120_000), params.signal]),
      }),
    );

    if (!response.ok || !response.body) {
      const errorText = await response.text().catch(() => '');
      throw new Error(`Google stream failed: ${response.status} ${errorText}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data: ')) continue;
          const data = trimmed.slice(6);
          if (!data || data === STREAM_DONE_MARKER) continue;

          try {
            const parsed = JSON.parse(data);
            const candidates = (parsed.candidates as Array<Record<string, unknown>>) ?? [];
            const first = candidates[0];
            const content = first?.content as Record<string, unknown> | undefined;
            const parts = (content?.parts as Array<Record<string, unknown>>) ?? [];
            const text = parts.map((p) => (p.text as string) ?? '').join('');
            if (text) yield { content: text, done: false };
          } catch {
            continue;
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    yield { content: '', done: true };
  }

  private async dispatchListModels(provider: ProviderType): Promise<string[]> {
    const apiKey = await this.configPort.getApiKey(provider);

    if (provider === 'anthropic') {
      if (!apiKey) return [];
      return ['claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022', 'claude-3-opus-20240229'];
    }
    if (provider === 'google') {
      if (!apiKey) return [];
      return ['gemini-2.0-flash', 'gemini-1.5-pro', 'gemini-1.5-flash'];
    }
    if (provider === 'baidu') {
      if (!apiKey) return [];
      return ['ernie-4.0-8k', 'ernie-3.5-8k', 'ernie-speed-128k'];
    }

    const baseUrl = await this.getBaseUrl(provider);
    const headers: Record<string, string> = {};
    if (apiKey && !NO_API_KEY_REQUIRED.has(provider)) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    try {
      const response = await fetch(`${baseUrl}/models`, {
        method: 'GET',
        headers,
        signal: AbortSignal.timeout(30_000),
      });
      if (!response.ok) return [];
      const json = (await response.json()) as Record<string, unknown>;
      const data = json.data as Array<Record<string, string>> | undefined;
      if (!data) return [];
      return data.map((m) => m.id).filter(Boolean);
    } catch {
      return [];
    }
  }

  private async doHeadRequest(provider: ProviderType): Promise<void> {
    const apiKey = await this.configPort.getApiKey(provider);
    const baseUrl = await this.getBaseUrl(provider);
    const headers: Record<string, string> = {};
    if (apiKey && !NO_API_KEY_REQUIRED.has(provider)) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    const response = await fetch(`${baseUrl}/models`, {
      method: 'HEAD',
      headers,
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      throw new Error(`Provider unavailable: ${response.status}`);
    }
  }
}
