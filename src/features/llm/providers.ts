import type { LLMProvider } from "./types";

/**
 * Pre-defined LLM providers. The id is the persisted key — never
 * rename it. Add a new entry here to ship a new built-in provider;
 * the settings UI will pick it up automatically.
 *
 * The "custom" provider requires the user to fill in the baseURL and
 * model fields manually. It is useful for self-hosted or proxy
 * endpoints that speak the OpenAI chat completions protocol.
 */
export const LLM_PROVIDERS: LLMProvider[] = [
  // ─── International: OpenAI ────────────────────────────────────────
  {
    id: "openai",
    name: "OpenAI",
    protocol: "openai",
    baseURL: "https://api.openai.com/v1",
    defaultModel: "gpt-4o-mini",
    models: [
      { id: "gpt-4o", label: "GPT-4o", vision: true, hint: "Flagship multimodal" },
      { id: "gpt-4o-mini", label: "GPT-4o mini", vision: true, hint: "Fast and cheap" },
      { id: "gpt-4.1", label: "GPT-4.1", hint: "Latest generation" },
      { id: "gpt-4.1-mini", label: "GPT-4.1 mini", hint: "Cheaper GPT-4.1" },
      { id: "o4-mini", label: "o4-mini", hint: "Reasoning model" },
      { id: "gpt-3.5-turbo", label: "GPT-3.5 Turbo", hint: "Legacy, cheapest" },
    ],
    apiKeyHint: "Get your key at platform.openai.com → API keys",
    docsURL: "https://platform.openai.com/account/api-keys",
    region: "global",
  },

  // ─── International: Azure OpenAI ──────────────────────────────────
  {
    id: "azure",
    name: "Azure OpenAI",
    protocol: "openai",
    baseURL: "",
    defaultModel: "",
    models: [],
    customBaseURL: true,
    apiKeyHint: "Set base URL to https://{resource}.openai.azure.com/openai/v1/ and the deployment name as the model.",
    docsURL:
      "https://learn.microsoft.com/en-us/azure/ai-services/openai/how-to/create-resource",
    notes:
      "Azure uses deployment names instead of model names. The baseURL and model are both required and you must set them in the fields below.",
    region: "global",
  },

  // ─── International: Anthropic ─────────────────────────────────────
  {
    id: "anthropic",
    name: "Anthropic (Claude)",
    protocol: "anthropic",
    baseURL: "https://api.anthropic.com",
    defaultModel: "claude-sonnet-4-5",
    models: [
      {
        id: "claude-sonnet-4-5",
        label: "Claude Sonnet 4.5",
        hint: "Balanced — recommended",
      },
      {
        id: "claude-opus-4-1",
        label: "Claude Opus 4.1",
        hint: "Most capable, slowest",
      },
      { id: "claude-3-5-haiku-20241022", label: "Claude 3.5 Haiku", hint: "Fastest" },
    ],
    apiKeyHint: "Get your key at console.anthropic.com → Settings → API Keys",
    docsURL: "https://console.anthropic.com/settings/keys",
    region: "global",
  },

  // ─── International: OpenRouter (one key, 500+ models) ────────────
  {
    id: "openrouter",
    name: "OpenRouter",
    protocol: "openai",
    baseURL: "https://openrouter.ai/api/v1",
    defaultModel: "openai/gpt-4o-mini",
    models: [
      { id: "openai/gpt-4o-mini", label: "OpenAI · GPT-4o mini" },
      { id: "openai/gpt-4o", label: "OpenAI · GPT-4o" },
      { id: "anthropic/claude-sonnet-4-5", label: "Anthropic · Claude Sonnet 4.5" },
      { id: "google/gemini-2.5-pro", label: "Google · Gemini 2.5 Pro" },
      { id: "meta-llama/llama-4-maverick", label: "Meta · Llama 4 Maverick" },
      { id: "deepseek/deepseek-chat-v3.1", label: "DeepSeek · V3.1" },
    ],
    customBaseURL: true,
    apiKeyHint: "Get your key at openrouter.ai → Keys",
    docsURL: "https://openrouter.ai/keys",
    notes:
      "OpenRouter is a unified gateway. Use a free model by suffixing :free (rate-limited).",
    extraHeaders: {
      "HTTP-Referer": "https://github.com/badhope/ChatVRM-Agent",
      "X-Title": "ChatVRM Agent",
    },
    region: "global",
  },

  // ─── China: DeepSeek ──────────────────────────────────────────────
  {
    id: "deepseek",
    name: "DeepSeek",
    protocol: "openai",
    baseURL: "https://api.deepseek.com/v1",
    defaultModel: "deepseek-chat",
    models: [
      {
        id: "deepseek-chat",
        label: "DeepSeek-V3.2 (chat)",
        hint: "General purpose, very cheap",
      },
      {
        id: "deepseek-reasoner",
        label: "DeepSeek-R1 (reasoner)",
        hint: "Reasoning model with thinking trace",
      },
    ],
    apiKeyHint: "Get your key at platform.deepseek.com → API Keys",
    docsURL: "https://platform.deepseek.com/api_keys/",
    region: "china",
  },

  // ─── China: Moonshot Kimi ─────────────────────────────────────────
  {
    id: "moonshot",
    name: "Moonshot (Kimi)",
    protocol: "openai",
    baseURL: "https://api.moonshot.cn/v1",
    defaultModel: "moonshot-v1-8k",
    models: [
      { id: "moonshot-v1-8k", label: "moonshot-v1-8k" },
      { id: "moonshot-v1-32k", label: "moonshot-v1-32k" },
      { id: "moonshot-v1-128k", label: "moonshot-v1-128k" },
      { id: "kimi-k2-0711-preview", label: "Kimi K2 (preview)" },
    ],
    apiKeyHint: "Get your key at platform.moonshot.cn → API Keys",
    docsURL: "https://platform.moonshot.cn/console/api-keys",
    region: "china",
  },

  // ─── China: 智谱 GLM ──────────────────────────────────────────────
  {
    id: "zhipu",
    name: "Zhipu AI (GLM)",
    protocol: "openai",
    baseURL: "https://open.bigmodel.cn/api/paas/v4/",
    defaultModel: "glm-4.6",
    models: [
      { id: "glm-4.6", label: "GLM-4.6", hint: "Latest flagship" },
      { id: "glm-4.5", label: "GLM-4.5" },
      { id: "glm-4-flash", label: "GLM-4 Flash", hint: "Free tier available" },
      { id: "glm-z1-air", label: "GLM-Z1 Air (reasoning)" },
    ],
    apiKeyHint: "Get your key at bigmodel.cn → API Keys",
    docsURL: "https://bigmodel.cn/usercenter/proj-mgmt/apikeys",
    region: "china",
  },

  // ─── China: 阿里云百炼 Qwen ────────────────────────────────────────
  {
    id: "dashscope",
    name: "Aliyun Bailian (Qwen)",
    protocol: "openai",
    baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    defaultModel: "qwen-plus",
    models: [
      { id: "qwen3-max", label: "Qwen3-Max", hint: "Latest flagship" },
      { id: "qwen-plus", label: "Qwen-Plus", hint: "Balanced" },
      { id: "qwen-flash", label: "Qwen-Flash", hint: "Fast" },
      { id: "qwen3-coder-plus", label: "Qwen3-Coder-Plus" },
      { id: "deepseek-v3", label: "DeepSeek-V3 (via Bailian)" },
    ],
    customBaseURL: true,
    apiKeyHint: "Get your key at bailian.console.aliyun.com → API-KEY",
    docsURL: "https://help.aliyun.com/zh/model-studio/get-api-key",
    notes:
      "International users may prefer the Singapore or Virginia endpoint. Override baseURL to switch regions.",
    region: "china",
  },

  // ─── China: 字节火山方舟 ──────────────────────────────────────────
  {
    id: "volcengine",
    name: "Volcengine Ark (Doubao)",
    protocol: "openai",
    baseURL: "https://ark.cn-beijing.volces.com/api/v3",
    defaultModel: "doubao-seed-1-6-250715",
    models: [
      { id: "doubao-seed-1-6-250715", label: "Doubao-Seed-1.6", hint: "Latest flagship" },
      { id: "doubao-seed-1-6-flash-250715", label: "Doubao-Seed-1.6 Flash" },
      { id: "doubao-seed-code-preview-latest", label: "Doubao-Seed-Code" },
      { id: "deepseek-v3-250324", label: "DeepSeek-V3 (via Ark)" },
    ],
    customBaseURL: true,
    apiKeyHint: "Get your key at volcengine.com → API Key 管理",
    docsURL: "https://www.volcengine.com/docs/82379/2167675",
    region: "china",
  },

  // ─── China: 腾讯混元 ──────────────────────────────────────────────
  {
    id: "hunyuan",
    name: "Tencent Hunyuan",
    protocol: "openai",
    baseURL: "https://api.hunyuan.cloud.tencent.com/v1",
    defaultModel: "hunyuan-turbos-latest",
    models: [
      { id: "hunyuan-turbos-latest", label: "Hunyuan-TurboS (latest)" },
      { id: "hunyuan-t1-latest", label: "Hunyuan-T1 (reasoning)" },
      { id: "hunyuan-lite", label: "Hunyuan-Lite", hint: "Free" },
    ],
    apiKeyHint: "Get your key at hunyuan.cloud.tencent.com → API Key 管理",
    docsURL:
      "https://cloud.tencent.com/document/product/1729/111008",
    region: "china",
  },

  // ─── China: 百度千帆 ──────────────────────────────────────────────
  {
    id: "qianfan",
    name: "Baidu Qianfan",
    protocol: "openai",
    baseURL: "https://qianfan.baidubce.com/v2",
    defaultModel: "deepseek-v3.2",
    models: [
      { id: "deepseek-v3.2", label: "DeepSeek-V3.2 (default)" },
      { id: "ernie-5.0-thinking-preview", label: "ERNIE-5.0-Thinking" },
      { id: "qwen3-235b-a22b", label: "Qwen3-235B" },
    ],
    customBaseURL: true,
    apiKeyHint:
      "Generate a key at cloud.baidu.com → 千帆大模型 → API Key. Format: bce-v3/ALTAK-…",
    docsURL: "https://cloud.baidu.com/product/wenxinworkshop",
    region: "china",
  },

  // ─── China: SiliconFlow 硅基流动 ──────────────────────────────────
  {
    id: "siliconflow",
    name: "SiliconFlow",
    protocol: "openai",
    baseURL: "https://api.siliconflow.cn/v1",
    defaultModel: "Qwen/Qwen3-8B",
    models: [
      { id: "Qwen/Qwen3-8B", label: "Qwen3-8B", hint: "Free tier" },
      { id: "deepseek-ai/DeepSeek-V3.2", label: "DeepSeek-V3.2" },
      { id: "THUDM/GLM-4-32B-0414", label: "GLM-4-32B" },
      { id: "moonshotai/Kimi-K2-Instruct", label: "Kimi-K2" },
    ],
    apiKeyHint: "Get your key at cloud.siliconflow.com → API Keys",
    docsURL: "https://cloud.siliconflow.com/account/ak",
    region: "china",
  },

  // ─── Local: Ollama ────────────────────────────────────────────────
  {
    id: "ollama",
    name: "Ollama (local)",
    protocol: "openai",
    baseURL: "http://localhost:11434/v1",
    defaultModel: "qwen3:8b",
    models: [
      { id: "qwen3:8b", label: "qwen3:8b" },
      { id: "llama3.3", label: "llama3.3" },
      { id: "gemma3:12b", label: "gemma3:12b" },
      { id: "deepseek-r1:8b", label: "deepseek-r1:8b" },
    ],
    customBaseURL: true,
    apiKeyHint: "Ollama does not validate the key. Use any string (e.g. ollama).",
    docsURL: "https://ollama.com/",
    notes:
      "Run ollama serve locally. The baseURL defaults to http://localhost:11434/v1.",
    region: "local",
  },

  // ─── Custom HTTP endpoint ─────────────────────────────────────────
  {
    id: "custom",
    name: "Custom OpenAI-compatible",
    protocol: "openai",
    baseURL: "",
    defaultModel: "",
    models: [],
    customBaseURL: true,
    apiKeyHint:
      "POST {baseURL}/chat/completions. Empty baseURL is OK — /v1 is appended automatically. Paste the model ID above.",
    docsURL: "",
    notes:
      "Use this for any OpenAI-compatible endpoint (vLLM, LocalAI, text-generation-webui, LiteLLM proxy, or self-hosted models).",
    region: "local",
  },
];

/** Find a provider by id. Falls back to OpenAI. */
export function findProvider(id: string | undefined): LLMProvider {
  if (id) {
    const hit = LLM_PROVIDERS.find((p) => p.id === id);
    if (hit) return hit;
  }
  return LLM_PROVIDERS[0];
}
