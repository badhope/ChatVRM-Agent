// ============================================================
// 帮助数据定义
// ============================================================

/** 帮助主题 */
export interface HelpTopic {
  title: string;
  description?: string;
  children?: HelpTopic[];
  content?: string;
}

/** 帮助树 */
export const HELP_TREE: HelpTopic[] = [
  {
    title: '\uD83D\uDE80 快速入门',
    children: [
      {
        title: '首次使用',
        content: [
          '1. 设置 API Key:',
          '   personal-assistant config set-key aliyun <你的API密钥>',
          '',
          '2. 开始对话:',
          '   personal-assistant chat ask "你好"',
          '',
          '3. 进入交互模式:',
          '   personal-assistant',
          '',
          '\uD83D\uDCA1 阿里云百炼提供免费额度，推荐新手使用 qwen3.6-flash 模型',
        ].join('\n'),
      },
      {
        title: '选择模型',
        content: [
          '查看所有可用模型:',
          '  personal-assistant chat models',
          '',
          '指定模型对话:',
          '  personal-assistant chat ask "问题" -m qwen3.6-flash',
          '  personal-assistant chat ask "问题" -m qwen-plus',
          '',
          '搜索模型:',
          '  personal-assistant chat search deepseek',
          '',
          '\uD83D\uDCA1 模型推荐:',
          '  \u2022 qwen3.6-flash  \u2014 免费/快速，日常对话首选',
          '  \u2022 qwen-plus      \u2014 更强推理能力',
          '  \u2022 qwen-turbo     \u2014 最快响应速度',
        ].join('\n'),
      },
      {
        title: '命令行 vs 交互模式',
        content: [
          '命令行模式 (适合脚本/自动化):',
          '  personal-assistant chat ask "问题"',
          '  personal-assistant agent run "任务"',
          '  personal-assistant config list',
          '',
          '交互模式 (适合日常使用):',
          '  personal-assistant          \u2192 打开主菜单',
          '  personal-assistant chat start  \u2192 进入对话',
          '',
          '\uD83D\uDCA1 交互模式支持流式输出、上下文记忆、命令快捷键',
        ].join('\n'),
      },
    ],
  },
  {
    title: '\uD83D\uDCAC AI 对话',
    children: [
      {
        title: '快速提问',
        content: [
          '单次对话，问完即走:',
          '  personal-assistant chat ask "1+1等于几？"',
          '',
          '指定平台和模型:',
          '  personal-assistant chat ask "你好" -p aliyun -m qwen3.6-flash',
          '',
          '流式输出 (默认开启):',
          '  personal-assistant chat ask "介绍Python"',
          '',
          '关闭流式输出:',
          '  personal-assistant chat ask "介绍Python" --no-stream',
          '',
          '自动切换模型 (失败时尝试下一个):',
          '  personal-assistant chat ask "写代码" -f',
        ].join('\n'),
      },
      {
        title: '交互式对话',
        content: [
          '启动对话:',
          '  personal-assistant chat start',
          '',
          '对话中可用命令:',
          '  /help   \u2014 查看帮助',
          '  /clear  \u2014 清空对话历史',
          '  /model  \u2014 切换模型',
          '  /exit   \u2014 退出对话',
          '',
          '\uD83D\uDCA1 对话支持上下文记忆，AI 会记住之前的对话内容',
        ].join('\n'),
      },
      {
        title: '搜索和查看模型',
        content: [
          '查看平台内置模型:',
          '  personal-assistant chat models',
          '  personal-assistant chat models -p aliyun',
          '',
          '从API实时搜索模型:',
          '  personal-assistant chat search deepseek',
          '  personal-assistant chat search qwen',
          '',
          '列出所有远程模型:',
          '  personal-assistant chat remote-models',
          '  personal-assistant chat remote-models --filter flash',
        ].join('\n'),
      },
    ],
  },
  {
    title: '\uD83E\uDD16 Agent',
    children: [
      {
        title: '执行任务',
        content: [
          '让 Agent 自动执行任务:',
          '  personal-assistant agent run "创建 hello.py 文件，输出Hello World"',
          '  personal-assistant agent run "分析当前目录结构"',
          '',
          'Agent 会自动:',
          '  1. 理解你的任务意图',
          '  2. 制定执行计划',
          '  3. 逐步执行 (创建文件、运行命令等)',
          '  4. 验证执行结果',
          '',
          '\uD83D\uDCA1 Agent 在沙盒中运行，不会执行危险操作',
        ].join('\n'),
      },
    ],
  },
  {
    title: '\uD83D\uDCCB 代码审查',
    children: [
      {
        title: '审查文件',
        content: [
          '审查单个文件:',
          '  personal-assistant review file <文件路径>',
          '  personal-assistant review file src/index.ts',
          '',
          '审查内容包括:',
          '  \u2022 代码质量和可读性',
          '  \u2022 潜在 Bug 和安全漏洞',
          '  \u2022 性能优化建议',
          '  \u2022 最佳实践建议',
        ].join('\n'),
      },
      {
        title: '审查目录',
        content: [
          '审查整个目录:',
          '  personal-assistant review dir <目录路径>',
          '  personal-assistant review dir src/',
          '',
          '\uD83D\uDCA1 目录审查会逐个分析目录下的代码文件',
        ].join('\n'),
      },
    ],
  },
  {
    title: '\uD83D\uDD27 工具箱',
    children: [
      {
        title: '查看和执行工具',
        content: [
          '列出所有可用工具:',
          '  personal-assistant tools list',
          '',
          '执行工具:',
          '  personal-assistant tools run <工具名>',
          '  personal-assistant tools run sysinfo',
          '  personal-assistant tools run calc --expression "2+3*4"',
          '',
          '安装新工具包:',
          '  personal-assistant tools install <包名>',
        ].join('\n'),
      },
    ],
  },
  {
    title: '\uD83D\uDCC1 文件管理',
    children: [
      {
        title: '读取文件',
        content: [
          '  personal-assistant files read <文件路径>',
          '  personal-assistant files read package.json',
        ].join('\n'),
      },
      {
        title: '写入文件',
        content: [
          '  personal-assistant files write <文件路径> --content "内容"',
          '  personal-assistant files write hello.py --content "print(\'hello\')"',
        ].join('\n'),
      },
      {
        title: '目录树',
        content: [
          '  personal-assistant files tree <目录路径>',
          '  personal-assistant files tree .',
          '  personal-assistant files tree src/',
        ].join('\n'),
      },
    ],
  },
  {
    title: '\uD83E\uDDE0 记忆系统',
    children: [
      {
        title: '查看和搜索记忆',
        content: [
          '查看最近记忆:',
          '  personal-assistant memory recent',
          '  personal-assistant memory recent --limit 20',
          '',
          '搜索记忆:',
          '  personal-assistant memory search "关键词"',
          '',
          '查看记忆统计:',
          '  personal-assistant memory stats',
          '',
          '\uD83D\uDCA1 记忆系统会自动保存对话，下次对话时自动召回相关上下文',
        ].join('\n'),
      },
    ],
  },
  {
    title: '\u2699\uFE0F 配置',
    children: [
      {
        title: '设置 API Key',
        content: [
          '设置密钥:',
          '  personal-assistant config set-key aliyun sk-xxxxx',
          '  personal-assistant config set-key openai sk-xxxxx',
          '',
          '查看配置:',
          '  personal-assistant config list',
          '',
          '\uD83D\uDCA1 API Key 保存在本地 .personal-assistant/config.json 中，不会上传',
        ].join('\n'),
      },
      {
        title: '沙盒权限',
        content: [
          '查看当前沙盒级别:',
          '  personal-assistant config get-sandbox',
          '',
          '沙盒级别:',
          '  \u2022 conservative \u2014 最严格，仅允许读取',
          '  \u2022 balanced     \u2014 平衡，允许创建文件',
          '  \u2022 permissive   \u2014 宽松，允许执行命令',
          '',
          '\uD83D\uDCA1 沙盒保护你的系统安全，Agent 的操作受沙盒限制',
        ].join('\n'),
      },
      {
        title: '默认平台和模型',
        content: [
          '设置默认平台:',
          '  personal-assistant config set-default aliyun',
          '',
          '设置默认模型:',
          '  personal-assistant config set-model qwen3.6-flash',
          '',
          '查看当前配置:',
          '  personal-assistant config list',
        ].join('\n'),
      },
    ],
  },
  {
    title: '\uD83C\uDF10 AI 平台',
    children: [
      {
        title: '查看支持的平台',
        content: [
          '  personal-assistant ai list',
          '',
          '当前支持 10 个平台:',
          '  \u2601\uFE0F 海外: OpenAI, Anthropic, Google',
          '  \uD83C\uDDE8\uD83C\uDDF3 国内: 阿里云百炼, 硅基流动, 智谱AI, 百度千帆, DeepSeek',
          '  \uD83C\uDFE0 本地: Ollama, LM Studio',
        ].join('\n'),
      },
    ],
  },
];
