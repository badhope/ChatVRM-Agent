import type { IConfigPort } from '../src/ports/config.port.js';
import type { ProviderType } from '../src/ports/config.port.js';
import { DEFAULT_PROVIDER_BASE_URLS } from '../src/adapters/llm.adapter.js';

export interface ProviderMeta {
  id: ProviderType;
  name: string;
  baseUrl: string;
  defaultModel: string;
  requiresKey: boolean;
  protocol: 'openai' | 'anthropic' | 'google' | 'baidu';
  description: string;
}

export const PROVIDER_BASE_URLS: Record<ProviderType, string> = DEFAULT_PROVIDER_BASE_URLS;

export const PROVIDER_META: ProviderMeta[] = [
  { id: 'openai',      name: 'OpenAI',           baseUrl: PROVIDER_BASE_URLS.openai,                            defaultModel: 'gpt-4o',                 requiresKey: true,  protocol: 'openai',    description: 'GPT-4o / GPT-4 Turbo / o1 系列' },
  { id: 'anthropic',   name: 'Anthropic Claude', baseUrl: PROVIDER_BASE_URLS.anthropic,                         defaultModel: 'claude-3-5-sonnet-20241022', requiresKey: true,  protocol: 'anthropic', description: 'Claude 3.5 Sonnet / Haiku / Opus' },
  { id: 'google',      name: 'Google Gemini',    baseUrl: PROVIDER_BASE_URLS.google,                            defaultModel: 'gemini-2.0-flash',       requiresKey: true,  protocol: 'google',    description: 'Gemini 2.0 Flash / 1.5 Pro' },
  { id: 'deepseek',    name: 'DeepSeek',         baseUrl: PROVIDER_BASE_URLS.deepseek,                          defaultModel: 'deepseek-chat',          requiresKey: true,  protocol: 'openai',    description: 'DeepSeek-V3 / R1 推理模型' },
  { id: 'siliconflow', name: 'SiliconFlow',      baseUrl: PROVIDER_BASE_URLS.siliconflow,                       defaultModel: 'Qwen/Qwen2.5-7B-Instruct', requiresKey: true,  protocol: 'openai',    description: 'Qwen / DeepSeek / GLM 等开源模型（默认）' },
  { id: 'aliyun',      name: 'Aliyun DashScope', baseUrl: PROVIDER_BASE_URLS.aliyun,                           defaultModel: 'qwen-plus',              requiresKey: true,  protocol: 'openai',    description: '通义千问 Qwen-Plus / Max' },
  { id: 'zhipu',       name: 'Zhipu GLM',        baseUrl: PROVIDER_BASE_URLS.zhipu,                             defaultModel: 'glm-4',                  requiresKey: true,  protocol: 'openai',    description: 'GLM-4 / GLM-4-Plus' },
  { id: 'baidu',       name: 'Baidu Ernie',      baseUrl: PROVIDER_BASE_URLS.baidu,                             defaultModel: 'ernie-4.0-8k',           requiresKey: true,  protocol: 'baidu',     description: '文心一言 Ernie-4.0' },
  { id: 'ollama',      name: 'Ollama (本地)',    baseUrl: PROVIDER_BASE_URLS.ollama,                            defaultModel: 'llama3.2',               requiresKey: false, protocol: 'openai',    description: '本地 Ollama 服务（无需 key）' },
  { id: 'lmstudio',    name: 'LM Studio (本地)', baseUrl: PROVIDER_BASE_URLS.lmstudio,                          defaultModel: 'local-model',            requiresKey: false, protocol: 'openai',    description: 'LM Studio 本地服务（无需 key）' },
];

export async function listProviders(): Promise<ProviderMeta[]> {
  return PROVIDER_META;
}

export async function resolveApiKey(cfg: IConfigPort, provider: ProviderType): Promise<string | undefined> {
  const stored = await cfg.getApiKey(provider);
  if (stored && stored.length > 0) return stored.trim();
  const envCandidates = [
    `PERSONAL_ASSISTANT_${provider.toUpperCase()}`,
    `${provider.toUpperCase()}_API_KEY`,
  ];
  for (const envKey of envCandidates) {
    const v = process.env[envKey];
    if (v && v.length > 0) return v.trim();
  }
  return undefined;
}
