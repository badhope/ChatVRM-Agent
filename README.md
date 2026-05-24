# Personal-Assistant

**Personal-Assistant** — 一个强大的个人 AI 助手 CLI 工具。

## 🌟 核心特性

### AI 能力
- **10+ AI 平台** — OpenAI、Anthropic、Google、DeepSeek、硅基流动、阿里云百炼、智谱AI、百度千帆、Ollama、LM Studio
- **智能模型搜索** — 自动从平台 API 搜索匹配模型
- **自动切换** — 模型失败时自动尝试下一个
- **流式响应** — 实时显示 AI 输出
- **熔断保护** — 内置 Circuit Breaker，自动隔离故障平台

### 聊天功能
- **会话管理** — 完整的对话历史管理
- **本地存储** — 数据持久化到本地
- **多轮对话** — 支持上下文连贯的对话

### 开发工具
- **内置工具** — Shell、文件操作、HTTP、JSON、文本处理等
- **记忆系统** — 上下文记忆、知识图谱、RAG 检索

### 信任机制
- **信任评估** — 自动执行 / 需要确认
- **危险检测** — 自动识别破坏性操作、敏感信息

## 📦 安装

### 从 GitHub 安装

```bash
# 克隆仓库
git clone https://github.com/badhope/Personal-Assistant.git
cd Personal-Assistant

# 安装依赖
npm install

# 全局链接（可选）
npm link
```

要求 Node.js >= 18.0.0 < 23.0.0

## 🚀 快速开始

```bash
# 1. 配置 API Key
personal-assistant config provider set-key aliyun sk-xxxxx
personal-assistant config set-default aliyun

# 2. 开始聊天
personal-assistant chat ask "你好，介绍一下你自己"

# 3. 交互式多轮对话
personal-assistant chat start
```

## ⚙️ 命令参考

### 聊天命令
```bash
personal-assistant chat start           # 交互式多轮对话
personal-assistant chat ask <问题>       # 单轮快速提问
personal-assistant chat models -p aliyun    # 列出平台模型
```

### 配置命令
```bash
personal-assistant config init            # 交互式配置向导
personal-assistant config list            # 查看所有配置
personal-assistant config provider set-key <平台> <API Key>
personal-assistant config set-default <平台>
personal-assistant config test <平台>   # 测试平台连接
```

### 工具命令
```bash
personal-assistant tools list          # 列出所有工具
```

## 📁 项目结构

```
Personal-Assistant/
├── src/                    # 源代码
│   ├── cli.ts             # CLI 入口
│   ├── commands/           # CLI 命令
│   ├── providers/         # AI 平台适配器
│   ├── agent/            # Agent 系统
│   ├── memory/          # 记忆系统
│   ├── tools/            # 工具系统
│   ├── config/           # 配置管理
│   └── utils/            # 工具函数
├── dist/                   # 编译输出
├── packages/               # 包
├── plugins/               # 插件
├── sdk/                   # SDK
└── vscode/               # VSCode 扩展
```

## 🔒 支持的 AI 平台

| 平台 | 类型 | API 格式 |
|------|------|---------|
| OpenAI | 云端 | OpenAI |
| Anthropic | 云端 | Anthropic |
| Google Gemini | 云端 | Google |
| DeepSeek | 云端 | OpenAI 兼容 |
| 硅基流动 | 云端 | OpenAI 兼容 |
| 阿里云百炼 | 云端 | OpenAI 兼容 |
| 智谱AI | 云端 | OpenAI 兼容 |
| 百度千帆 | 云端 | 自定义 |
| Ollama | 本地 | Ollama |
| LM Studio | 本地 | OpenAI 兼容 |

## 📜 许可证

MIT License

## 🤝 贡献

欢迎贡献！详见 [CONTRIBUTING.md](CONTRIBUTING.md)。

---

**Personal-Assistant** — 你的智能个人 AI 助手
