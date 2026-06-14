export type Language = "en" | "zh";

export const translations = {
  en: {
    introduction: {
      title: "About This Application",
      description:
        "Enjoy conversations with 3D characters using your microphone, text input, and voice synthesis, all from your web browser. You can change the character (VRM), adjust personality settings, and tune the voice.",
      techTitle: "Technology",
      techDescription:
        "This app uses @pixiv/three-vrm for 3D model display, ChatGPT API for conversation generation, and Koemotion's Koeiromap API for voice synthesis. See the technical explanation article for details.",
      techLink: "technical explanation article",
      githubNotice:
        "This demo's source code is publicly available on GitHub. Feel free to modify and customize it!",
      repoLabel: "Repository:",
      usageTitle: "Usage Guidelines",
      usageDescription:
        "Please do not intentionally guide the character to make discriminatory or violent statements, or statements that demean specific individuals. Also, when replacing the character with a VRM model, please follow the model's usage conditions.",
      koeiromapTitle: "Koeiromap API Key",
      koeiromapDescription: "Get an API key from rinna Developers.",
      koeiromapLink: "Learn more",
      openaiTitle: "OpenAI API Key",
      openaiDescription:
        "You can get an API key from the OpenAI website. Please enter the obtained API key in the form.",
      openaiSite: "OpenAI website",
      openaiNotice:
        "ChatGPT API is accessed directly from the browser. Also, API keys and conversation content are not stored on Pixiv's servers.",
      openaiModel: "The model used is ChatGPT API (GPT-3.5).",
      startButton: "Start by entering API keys",
    },
    menu: {
      settings: "Settings",
      chatLog: "Chat Log",
    },
    settings: {
      title: "Settings",
      openaiKey: "OpenAI API Key",
      openaiDescription:
        "You can get an API key from the OpenAI website. Please enter the obtained API key in the form.",
      openaiSite: "OpenAI website",
      openaiNotice:
        "ChatGPT API is accessed directly from the browser. Also, API keys and conversation content are not stored on Pixiv's servers.",
      openaiModel: "The model used is ChatGPT API (GPT-3.5).",
      characterModel: "Character Model",
      openVrm: "Open VRM",
      characterSettings: "Character Settings (System Prompt)",
      resetCharacterSettings: "Reset Character Settings",
      voiceAdjustment: "Voice Adjustment",
      koeiromapDescription:
        "Using Koemotion's Koeiromap API. For details, please visit",
      apiKey: "API Key",
      preset: "Preset",
      cute: "Cute",
      energetic: "Energetic",
      cool: "Cool",
      mature: "Mature",
      chatHistory: "Chat History",
      resetChatHistory: "Reset Chat History",
      language: "Language",
    },
    messageInput: {
      placeholder: "Type your question here",
      poweredBy: "powered by VRoid, Koemotion, ChatGPT API",
    },
    chatLog: {
      character: "CHARACTER",
      you: "YOU",
    },
    assistantText: {
      character: "CHARACTER",
    },
    errors: {
      apiKeyNotSet: "API key is not set",
    },
  },
  zh: {
    introduction: {
      title: "关于此应用",
      description:
        "仅通过网页浏览器即可使用麦克风、文本输入和语音合成与 3D 角色对话。您可以更换角色 (VRM)、调整性格设置和语音参数。",
      techTitle: "技术介绍",
      techDescription:
        "本应用使用 @pixiv/three-vrm 显示 3D 模型，使用 ChatGPT API 生成对话，使用 Koemotion 的 Koeiromap API 进行语音合成。详情请参阅技术解说文章。",
      techLink: "技术解说文章",
      githubNotice:
        "此演示的源代码已在 GitHub 上公开。欢迎自由修改和定制！",
      repoLabel: "仓库：",
      usageTitle: "使用须知",
      usageDescription:
        "请不要故意引导角色说出歧视性或暴力性言论，或贬低特定人物的言论。另外，使用 VRM 模型替换角色时，请遵守该模型的使用条款。",
      koeiromapTitle: "Koeiromap API 密钥",
      koeiromapDescription: "请从 rinna Developers 获取 API 密钥。",
      koeiromapLink: "了解详情",
      openaiTitle: "OpenAI API 密钥",
      openaiDescription:
        "您可以从 OpenAI 网站获取 API 密钥。请将获取的 API 密钥填入表单。",
      openaiSite: "OpenAI 网站",
      openaiNotice:
        "ChatGPT API 直接从浏览器访问。此外，API 密钥和对话内容不会存储在 Pixiv 的服务器上。",
      openaiModel: "使用的模型是 ChatGPT API (GPT-3.5)。",
      startButton: "输入 API 密钥开始",
    },
    menu: {
      settings: "设置",
      chatLog: "对话记录",
    },
    settings: {
      title: "设置",
      openaiKey: "OpenAI API 密钥",
      openaiDescription:
        "您可以从 OpenAI 网站获取 API 密钥。请将获取的 API 密钥填入表单。",
      openaiSite: "OpenAI 网站",
      openaiNotice:
        "ChatGPT API 直接从浏览器访问。此外，API 密钥和对话内容不会存储在 Pixiv 的服务器上。",
      openaiModel: "使用的模型是 ChatGPT API (GPT-3.5)。",
      characterModel: "角色模型",
      openVrm: "打开 VRM",
      characterSettings: "角色设置（系统提示词）",
      resetCharacterSettings: "重置角色设置",
      voiceAdjustment: "语音调整",
      koeiromapDescription: "使用 Koemotion 的 Koeiromap API。详情请访问",
      apiKey: "API 密钥",
      preset: "预设",
      cute: "可爱",
      energetic: "活力",
      cool: "帅气",
      mature: "成熟",
      chatHistory: "对话历史",
      resetChatHistory: "重置对话历史",
      language: "语言",
    },
    messageInput: {
      placeholder: "输入你想问的问题",
      poweredBy: "powered by VRoid, Koemotion, ChatGPT API",
    },
    chatLog: {
      character: "角色",
      you: "你",
    },
    assistantText: {
      character: "角色",
    },
    errors: {
      apiKeyNotSet: "未设置 API 密钥",
    },
  },
};

export type TranslationKey = typeof translations.en;
