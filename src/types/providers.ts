import type { ProviderType, ModelInfo } from './index.js';

// ============================================================================
// 共享 Provider 响应类型
// ============================================================================

/**
 * 模型列表响应的基础接口
 */
export interface ModelsListResponse {
  models: Array<{
    id: string;
    name: string;
  }>;
}

/**
 * API 使用量信息
 */
export interface ApiUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

/**
 * API 响应基础接口
 */
export interface ApiResponseBase {
  model: string;
  usage?: ApiUsage;
}

/**
 * OpenAI 兼容的模型列表响应
 */
export interface OpenAICompatibleModelsResponse {
  data: Array<{
    id: string;
    object: string;
    created: number;
    owned_by: string;
  }>;
}

/**
 * 消息内容部分 - 文本
 */
export interface TextPart {
  type: 'text';
  text: string;
}

/**
 * 消息内容部分 - 图片 URL
 */
export interface ImageUrlPart {
  type: 'image_url';
  image_url: {
    url: string;
  };
}

/**
 * 消息内容部分联合类型
 */
export type MessagePart = TextPart | ImageUrlPart;

export const PROVIDER_INFO: Record<ProviderType, {
  name: string;
  displayName: string;
  description: string;
  baseUrl: string;
  requiresApiKey: boolean;
  freeTier: boolean;
  models: ModelInfo[];
  keyPrefix?: string;  // API Key 前缀提示
}> = {
  openai: {
    name: 'openai',
    displayName: 'OpenAI',
    description: 'GPT-4o/o1系列模型，国际领先 (2026-04)',
    baseUrl: 'https://api.openai.com/v1',
    requiresApiKey: true,
    freeTier: false,
    keyPrefix: 'sk-',  // OpenAI keys start with sk-
    models: [
      {
        id: 'gpt-4o',
        name: 'GPT-4o',
        provider: 'openai',
        contextWindow: 128000,
        maxOutput: 4096,
        pricing: { inputPerMillion: 2.5, outputPerMillion: 10, currency: 'USD' },
        capabilities: { chat: true, stream: true, embed: true, tools: true, thinking: false, vision: true, audio: true }
      },
      {
        id: 'gpt-4o-mini',
        name: 'GPT-4o Mini',
        provider: 'openai',
        contextWindow: 128000,
        maxOutput: 4096,
        pricing: { inputPerMillion: 0.15, outputPerMillion: 0.6, currency: 'USD' },
        capabilities: { chat: true, stream: true, embed: true, tools: true, thinking: false, vision: true, audio: false }
      },
      {
        id: 'o1-preview',
        name: 'o1 Preview',
        provider: 'openai',
        contextWindow: 128000,
        maxOutput: 32768,
        pricing: { inputPerMillion: 15, outputPerMillion: 60, currency: 'USD' },
        capabilities: { chat: true, stream: true, embed: false, tools: true, thinking: true, vision: true, audio: false }
      },
      {
        id: 'o1-mini',
        name: 'o1 Mini',
        provider: 'openai',
        contextWindow: 128000,
        maxOutput: 65536,
        pricing: { inputPerMillion: 3, outputPerMillion: 12, currency: 'USD' },
        capabilities: { chat: true, stream: true, embed: false, tools: true, thinking: true, vision: false, audio: false }
      }
    ]
  },
  anthropic: {
    name: 'anthropic',
    displayName: 'Anthropic Claude',
    description: 'Claude 4系列，编程和Agent能力强 (2026-05)',
    baseUrl: 'https://api.anthropic.com',
    requiresApiKey: true,
    freeTier: false,
    keyPrefix: 'sk-ant-',  // Anthropic keys start with sk-ant-
    models: [
      {
        id: 'claude-sonnet-4-20250514',
        name: 'Claude Sonnet 4',
        provider: 'anthropic',
        contextWindow: 200000,
        maxOutput: 8192,
        pricing: { inputPerMillion: 3, outputPerMillion: 15, currency: 'USD' },
        capabilities: { chat: true, stream: true, embed: false, tools: true, thinking: true, vision: true, audio: false }
      },
      {
        id: 'claude-opus-4-20250514',
        name: 'Claude Opus 4',
        provider: 'anthropic',
        contextWindow: 200000,
        maxOutput: 8192,
        pricing: { inputPerMillion: 15, outputPerMillion: 75, currency: 'USD' },
        capabilities: { chat: true, stream: true, embed: false, tools: true, thinking: true, vision: true, audio: false }
      }
    ]
  },
  google: {
    name: 'google',
    displayName: 'Google Gemini',
    description: 'Gemini 3系列，多模态能力强 (2026-05)',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    requiresApiKey: true,
    freeTier: true,
    keyPrefix: 'AI',  // Google API keys start with AI
    models: [
      {
        id: 'gemini-3-flash-preview',
        name: 'Gemini 3 Flash',
        provider: 'google',
        contextWindow: 1000000,
        maxOutput: 8192,
        pricing: { inputPerMillion: 0.15, outputPerMillion: 0.6, currency: 'USD' },
        capabilities: { chat: true, stream: true, embed: true, tools: true, thinking: true, vision: true, audio: false }
      },
      {
        id: 'gemini-3.1-flash-preview',
        name: 'Gemini 3.1 Flash',
        provider: 'google',
        contextWindow: 1000000,
        maxOutput: 8192,
        pricing: { inputPerMillion: 0.25, outputPerMillion: 1.5, currency: 'USD' },
        capabilities: { chat: true, stream: true, embed: true, tools: true, thinking: true, vision: true, audio: false }
      },
      {
        id: 'gemini-3.1-pro-preview',
        name: 'Gemini 3.1 Pro',
        provider: 'google',
        contextWindow: 2000000,
        maxOutput: 8192,
        pricing: { inputPerMillion: 3.5, outputPerMillion: 10.5, currency: 'USD' },
        capabilities: { chat: true, stream: true, embed: true, tools: true, thinking: true, vision: true, audio: false }
      }
    ]
  },
  siliconflow: {
    name: 'siliconflow',
    displayName: '硅基流动',
    description: 'DeepSeek-R1/V3/Qwen2.5，国产低成本 (2026)',
    baseUrl: 'https://api.siliconflow.cn/v1',
    requiresApiKey: true,
    freeTier: true,
    keyPrefix: 'sk-',  // 硅基流动 keys start with sk-
    models: [
      {
        id: 'deepseek-ai/DeepSeek-R1',
        name: 'DeepSeek R1',
        provider: 'siliconflow',
        contextWindow: 64000,
        maxOutput: 8192,
        pricing: { inputPerMillion: 4, outputPerMillion: 16, currency: 'CNY' },
        capabilities: { chat: true, stream: true, embed: false, tools: false, thinking: true, vision: false, audio: false }
      },
      {
        id: 'deepseek-ai/DeepSeek-V3',
        name: 'DeepSeek V3',
        provider: 'siliconflow',
        contextWindow: 64000,
        maxOutput: 8192,
        pricing: { inputPerMillion: 2, outputPerMillion: 8, currency: 'CNY' },
        capabilities: { chat: true, stream: true, embed: true, tools: true, thinking: false, vision: false, audio: false }
      },
      {
        id: 'Qwen/Qwen2.5-72B-Instruct',
        name: 'Qwen2.5 72B',
        provider: 'siliconflow',
        contextWindow: 128000,
        maxOutput: 8192,
        pricing: { inputPerMillion: 1.2, outputPerMillion: 4.8, currency: 'CNY' },
        capabilities: { chat: true, stream: true, embed: true, tools: true, thinking: false, vision: false, audio: false }
      },
      {
        id: 'Qwen/Qwen2.5-Coder-32B-Instruct',
        name: 'Qwen2.5 Coder 32B',
        provider: 'siliconflow',
        contextWindow: 128000,
        maxOutput: 8192,
        pricing: { inputPerMillion: 0.8, outputPerMillion: 3.2, currency: 'CNY' },
        capabilities: { chat: true, stream: true, embed: true, tools: true, thinking: false, vision: false, audio: false }
      },
      {
        id: 'meta-llama/Llama-3.3-70B-Instruct',
        name: 'Llama 3.3 70B',
        provider: 'siliconflow',
        contextWindow: 128000,
        maxOutput: 8192,
        pricing: { inputPerMillion: 1.5, outputPerMillion: 6, currency: 'CNY' },
        capabilities: { chat: true, stream: true, embed: true, tools: true, thinking: false, vision: false, audio: false }
      }
    ]
  },
  aliyun: {
    name: 'aliyun',
    displayName: '阿里云百炼',
    description: 'Qwen3.6/Max/Plus/Flash，100+模型，编程Agent全面升级 (2026-05)',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    requiresApiKey: true,
    freeTier: true,
    keyPrefix: 'sk-',  // 阿里云百炼 keys start with sk-
    models: [
      // Qwen3.6 系列 (最新)
      {
        id: 'qwen3.6-plus',
        name: 'Qwen3.6-Plus',
        provider: 'aliyun',
        contextWindow: 128000,
        maxOutput: 8192,
        pricing: { inputPerMillion: 4, outputPerMillion: 12, currency: 'CNY' },
        capabilities: { chat: true, stream: true, embed: true, tools: true, thinking: true, vision: true, audio: false }
      },
      {
        id: 'qwen3.6-flash',
        name: 'Qwen3.6-Flash',
        provider: 'aliyun',
        contextWindow: 128000,
        maxOutput: 8192,
        pricing: { inputPerMillion: 0.5, outputPerMillion: 1, currency: 'CNY' },
        capabilities: { chat: true, stream: true, embed: true, tools: true, thinking: true, vision: true, audio: false }
      },
      // Qwen Max 系列 (旗舰)
      {
        id: 'qwen-max',
        name: 'Qwen Max',
        provider: 'aliyun',
        contextWindow: 32000,
        maxOutput: 8192,
        pricing: { inputPerMillion: 20, outputPerMillion: 60, currency: 'CNY' },
        capabilities: { chat: true, stream: true, embed: true, tools: true, thinking: true, vision: true, audio: false }
      },
      {
        id: 'qwen-max-latest',
        name: 'Qwen Max Latest',
        provider: 'aliyun',
        contextWindow: 128000,
        maxOutput: 8192,
        pricing: { inputPerMillion: 20, outputPerMillion: 60, currency: 'CNY' },
        capabilities: { chat: true, stream: true, embed: true, tools: true, thinking: true, vision: true, audio: false }
      },
      // Qwen Plus 系列
      {
        id: 'qwen-plus',
        name: 'Qwen Plus',
        provider: 'aliyun',
        contextWindow: 129024,
        maxOutput: 8192,
        pricing: { inputPerMillion: 2, outputPerMillion: 6, currency: 'CNY' },
        capabilities: { chat: true, stream: true, embed: true, tools: true, thinking: true, vision: true, audio: false }
      },
      // Qwen Turbo 系列 (高性价比)
      {
        id: 'qwen-turbo',
        name: 'Qwen Turbo',
        provider: 'aliyun',
        contextWindow: 1000000,
        maxOutput: 8192,
        pricing: { inputPerMillion: 0.3, outputPerMillion: 0.6, currency: 'CNY' },
        capabilities: { chat: true, stream: true, embed: true, tools: true, thinking: false, vision: true, audio: false }
      },
      {
        id: 'qwen-turbo-latest',
        name: 'Qwen Turbo Latest',
        provider: 'aliyun',
        contextWindow: 128000,
        maxOutput: 8192,
        pricing: { inputPerMillion: 0.3, outputPerMillion: 0.6, currency: 'CNY' },
        capabilities: { chat: true, stream: true, embed: true, tools: true, thinking: false, vision: true, audio: false }
      },
      // Qwen Coder 系列 (编程专用)
      {
        id: 'qwen-coder-plus',
        name: 'Qwen Coder Plus',
        provider: 'aliyun',
        contextWindow: 128000,
        maxOutput: 8192,
        pricing: { inputPerMillion: 2, outputPerMillion: 6, currency: 'CNY' },
        capabilities: { chat: true, stream: true, embed: true, tools: true, thinking: false, vision: false, audio: false }
      },
      {
        id: 'qwen-coder-turbo',
        name: 'Qwen Coder Turbo',
        provider: 'aliyun',
        contextWindow: 128000,
        maxOutput: 8192,
        pricing: { inputPerMillion: 0.5, outputPerMillion: 1, currency: 'CNY' },
        capabilities: { chat: true, stream: true, embed: true, tools: true, thinking: false, vision: false, audio: false }
      },
      // Qwen Long 系列 (长文本)
      {
        id: 'qwen-long',
        name: 'Qwen Long',
        provider: 'aliyun',
        contextWindow: 10000000,
        maxOutput: 8192,
        pricing: { inputPerMillion: 0.5, outputPerMillion: 2, currency: 'CNY' },
        capabilities: { chat: true, stream: true, embed: true, tools: false, thinking: false, vision: false, audio: false }
      },
      // Qwen VL 系列 (视觉)
      {
        id: 'qwen-vl-max',
        name: 'Qwen VL Max',
        provider: 'aliyun',
        contextWindow: 32000,
        maxOutput: 8192,
        pricing: { inputPerMillion: 20, outputPerMillion: 60, currency: 'CNY' },
        capabilities: { chat: true, stream: true, embed: false, tools: false, thinking: false, vision: true, audio: false }
      },
      {
        id: 'qwen-vl-plus',
        name: 'Qwen VL Plus',
        provider: 'aliyun',
        contextWindow: 128000,
        maxOutput: 8192,
        pricing: { inputPerMillion: 8, outputPerMillion: 8, currency: 'CNY' },
        capabilities: { chat: true, stream: true, embed: false, tools: false, thinking: false, vision: true, audio: false }
      },
      // Qwen Audio 系列 (语音)
      {
        id: 'qwen-audio-turbo',
        name: 'Qwen Audio Turbo',
        provider: 'aliyun',
        contextWindow: 8000,
        maxOutput: 2048,
        pricing: { inputPerMillion: 4, outputPerMillion: 8, currency: 'CNY' },
        capabilities: { chat: true, stream: true, embed: false, tools: false, thinking: false, vision: false, audio: true }
      },
      // Qwen2.5 系列 (开源)
      {
        id: 'qwen2.5-72b-instruct',
        name: 'Qwen2.5-72B',
        provider: 'aliyun',
        contextWindow: 128000,
        maxOutput: 8192,
        pricing: { inputPerMillion: 4, outputPerMillion: 4, currency: 'CNY' },
        capabilities: { chat: true, stream: true, embed: true, tools: true, thinking: false, vision: false, audio: false }
      },
      {
        id: 'qwen2.5-32b-instruct',
        name: 'Qwen2.5-32B',
        provider: 'aliyun',
        contextWindow: 128000,
        maxOutput: 8192,
        pricing: { inputPerMillion: 2, outputPerMillion: 2, currency: 'CNY' },
        capabilities: { chat: true, stream: true, embed: true, tools: true, thinking: false, vision: false, audio: false }
      },
      {
        id: 'qwen2.5-14b-instruct',
        name: 'Qwen2.5-14B',
        provider: 'aliyun',
        contextWindow: 128000,
        maxOutput: 8192,
        pricing: { inputPerMillion: 1, outputPerMillion: 1, currency: 'CNY' },
        capabilities: { chat: true, stream: true, embed: true, tools: true, thinking: false, vision: false, audio: false }
      },
      {
        id: 'qwen2.5-7b-instruct',
        name: 'Qwen2.5-7B',
        provider: 'aliyun',
        contextWindow: 128000,
        maxOutput: 8192,
        pricing: { inputPerMillion: 0.5, outputPerMillion: 0.5, currency: 'CNY' },
        capabilities: { chat: true, stream: true, embed: true, tools: true, thinking: false, vision: false, audio: false }
      },
      // DeepSeek 系列 (阿里云托管)
      {
        id: 'deepseek-r1',
        name: 'DeepSeek R1',
        provider: 'aliyun',
        contextWindow: 64000,
        maxOutput: 8192,
        pricing: { inputPerMillion: 4, outputPerMillion: 16, currency: 'CNY' },
        capabilities: { chat: true, stream: true, embed: false, tools: true, thinking: true, vision: false, audio: false }
      },
      {
        id: 'deepseek-v3',
        name: 'DeepSeek V3',
        provider: 'aliyun',
        contextWindow: 64000,
        maxOutput: 8192,
        pricing: { inputPerMillion: 1, outputPerMillion: 2, currency: 'CNY' },
        capabilities: { chat: true, stream: true, embed: false, tools: true, thinking: false, vision: false, audio: false }
      },
      // 第三方模型
      {
        id: 'glm-4-plus',
        name: 'GLM-4-Plus',
        provider: 'aliyun',
        contextWindow: 128000,
        maxOutput: 8192,
        pricing: { inputPerMillion: 50, outputPerMillion: 50, currency: 'CNY' },
        capabilities: { chat: true, stream: true, embed: false, tools: true, thinking: false, vision: true, audio: false }
      },
      {
        id: 'kimi-k2-8b',
        name: 'Kimi K2-8B',
        provider: 'aliyun',
        contextWindow: 128000,
        maxOutput: 8192,
        pricing: { inputPerMillion: 2, outputPerMillion: 2, currency: 'CNY' },
        capabilities: { chat: true, stream: true, embed: false, tools: false, thinking: false, vision: false, audio: false }
      }
    ]
  },
  zhipu: {
    name: 'zhipu',
    displayName: '智谱AI',
    description: 'GLM-5.1/5系列，8小时持续工作',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    requiresApiKey: true,
    freeTier: true,
    keyPrefix: undefined,  // 智谱没有特定前缀
    models: [
      {
        id: 'glm-5.1',
        name: 'GLM-5.1',
        provider: 'zhipu',
        contextWindow: 200000,
        maxOutput: 8192,
        pricing: { inputPerMillion: 6, outputPerMillion: 24, currency: 'CNY' },
        capabilities: { chat: true, stream: true, embed: false, tools: true, thinking: true, vision: false, audio: false }
      },
      {
        id: 'glm-5',
        name: 'GLM-5',
        provider: 'zhipu',
        contextWindow: 200000,
        maxOutput: 8192,
        pricing: { inputPerMillion: 4, outputPerMillion: 18, currency: 'CNY' },
        capabilities: { chat: true, stream: true, embed: false, tools: true, thinking: true, vision: false, audio: false }
      },
      {
        id: 'glm-4.7-flash',
        name: 'GLM-4.7 Flash',
        provider: 'zhipu',
        contextWindow: 200000,
        maxOutput: 8192,
        pricing: { inputPerMillion: 0, outputPerMillion: 0, currency: 'CNY' },
        capabilities: { chat: true, stream: true, embed: false, tools: true, thinking: false, vision: false, audio: false }
      }
    ]
  },
  baidu: {
    name: 'baidu',
    displayName: '百度千帆',
    description: 'ERNIE 5.1/5.0系列，原生多模态',
    baseUrl: 'https://aip.baidubce.com/rpc/2.0/ai_custom/v1/wenxinworkshop',
    requiresApiKey: true,
    freeTier: true,
    keyPrefix: undefined,  // 百度使用不同的格式
    models: [
      {
        id: 'ernie-5.1-preview',
        name: 'ERNIE 5.1 Preview',
        provider: 'baidu',
        contextWindow: 128000,
        maxOutput: 8192,
        pricing: { inputPerMillion: 1, outputPerMillion: 4, currency: 'CNY' },
        capabilities: { chat: true, stream: true, embed: true, tools: true, thinking: true, vision: true, audio: false }
      },
      {
        id: 'ernie-5.0',
        name: 'ERNIE 5.0',
        provider: 'baidu',
        contextWindow: 128000,
        maxOutput: 8192,
        pricing: { inputPerMillion: 0.8, outputPerMillion: 3.2, currency: 'CNY' },
        capabilities: { chat: true, stream: true, embed: true, tools: true, thinking: true, vision: true, audio: false }
      }
    ]
  },
  deepseek: {
    name: 'deepseek',
    displayName: 'DeepSeek',
    description: 'DeepSeek-R1/V3，开源编程第一 (2026-01)',
    baseUrl: 'https://api.deepseek.com/v1',
    requiresApiKey: true,
    freeTier: false,
    keyPrefix: 'sk-',  // DeepSeek keys start with sk-
    models: [
      {
        id: 'deepseek-reasoner',
        name: 'DeepSeek R1',
        provider: 'deepseek',
        contextWindow: 64000,
        maxOutput: 8192,
        pricing: { inputPerMillion: 0.55, outputPerMillion: 2.19, currency: 'USD' },
        capabilities: { chat: true, stream: true, embed: false, tools: false, thinking: true, vision: false, audio: false }
      },
      {
        id: 'deepseek-chat',
        name: 'DeepSeek V3',
        provider: 'deepseek',
        contextWindow: 64000,
        maxOutput: 8192,
        pricing: { inputPerMillion: 0.27, outputPerMillion: 1.1, currency: 'USD' },
        capabilities: { chat: true, stream: true, embed: true, tools: true, thinking: false, vision: false, audio: false }
      }
    ]
  },
  ollama: {
    name: 'ollama',
    displayName: 'Ollama (本地)',
    description: '本地模型运行，支持DeepSeek/Qwen/Llama等',
    baseUrl: 'http://127.0.0.1:11434',
    requiresApiKey: false,
    freeTier: true,
    keyPrefix: undefined,  // 本地无需key
    models: [
      {
        id: 'deepseek-r1:14b',
        name: 'DeepSeek R1 14B',
        provider: 'ollama',
        contextWindow: 128000,
        maxOutput: 8192,
        pricing: { inputPerMillion: 0, outputPerMillion: 0, currency: 'USD' },
        capabilities: { chat: true, stream: true, embed: false, tools: false, thinking: true, vision: false, audio: false }
      },
      {
        id: 'qwen2.5:14b',
        name: 'Qwen2.5 14B',
        provider: 'ollama',
        contextWindow: 128000,
        maxOutput: 8192,
        pricing: { inputPerMillion: 0, outputPerMillion: 0, currency: 'USD' },
        capabilities: { chat: true, stream: true, embed: true, tools: true, thinking: false, vision: false, audio: false }
      },
      {
        id: 'llama3.2:8b',
        name: 'Llama 3.2 8B',
        provider: 'ollama',
        contextWindow: 128000,
        maxOutput: 8192,
        pricing: { inputPerMillion: 0, outputPerMillion: 0, currency: 'USD' },
        capabilities: { chat: true, stream: true, embed: true, tools: true, thinking: false, vision: false, audio: false }
      }
    ]
  },
  lmstudio: {
    name: 'lmstudio',
    displayName: 'LM Studio (本地)',
    description: '本地模型GUI管理，OpenAI兼容',
    baseUrl: 'http://127.0.0.1:1234/v1',
    requiresApiKey: false,
    freeTier: true,
    keyPrefix: undefined,  // 本地无需key
    models: [
      {
        id: 'loaded-model',
        name: '已加载的模型',
        provider: 'lmstudio',
        contextWindow: 128000,
        maxOutput: 8192,
        pricing: { inputPerMillion: 0, outputPerMillion: 0, currency: 'USD' },
        capabilities: { chat: true, stream: true, embed: true, tools: true, thinking: false, vision: false, audio: false }
      }
    ]
  }
};
